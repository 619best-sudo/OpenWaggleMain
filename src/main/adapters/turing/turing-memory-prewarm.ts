import path from 'node:path'
import { FileMemory, Harness, type Session, McpRuntimePool } from 'turing-harness'
import type { McpSettingsView } from '@shared/types/mcp'
import type { ProjectMemoryStatus } from '../../../shared/types/project-memory'
import { createLogger } from '../../logger'
import type { AgentKernelStandardsContext } from '../../ports/agent-kernel-service'
import { attachOpenWaggleRuntime } from './turing-openwaggle-bridge'
import { resolveTuringLlmConfig } from './turing-llm-config'

const logger = createLogger('turing-memory-prewarm')
const DEFAULT_MODEL_REF = 'turing-machine/turing-machine'

export interface PrewarmRuntime {
  modelRef?: string
  mcpSettings?: McpSettingsView
  standardsContext?: AgentKernelStandardsContext
}

interface WarmProjectSession {
  readonly projectPath: string
  readonly llmSignature: string
  readonly harness: Harness
  readonly session: Session
  readonly warmedAt: number
  /** True if MCP clients + skill providers were attached during prewarm. */
  readonly bridgeAttached: boolean
  /** Signature of the attached runtime, for diagnostics; null if not attached. */
  readonly bridgeSignature: string | null
}

interface InflightWarmProjectSession {
  readonly llmSignature: string
  readonly promise: Promise<WarmProjectSession>
}

interface WarmProjectMemoryRuntimeStatus {
  readonly llmSyncEnabled: boolean
  readonly isRefreshing: boolean
  readonly lastFullSummarySyncStartedAt?: number
  readonly lastFullSummarySyncCompletedAt?: number
  readonly lastFullSummarySyncModel?: string
  readonly lastFullSummarySyncError?: string
}

interface WarmProjectMemoryRuntime {
  getStatus(): WarmProjectMemoryRuntimeStatus
  refreshAllSummaries(): Promise<void>
}

const inflight = new Map<string, InflightWarmProjectSession>()
const spareSessions = new Map<string, WarmProjectSession>()
const assignedSessions = new Map<string, WarmProjectSession>()
const sharedMcpPools = new Map<string, McpRuntimePool>()

/** Get or create a shared MCP runtime pool for a given project path. */
export function getSharedMcpPool(projectPath: string): McpRuntimePool {
  const normalized = normalizeProjectPath(projectPath)
  let pool = sharedMcpPools.get(normalized)
  if (!pool) {
    pool = new McpRuntimePool()
    sharedMcpPools.set(normalized, pool)
    logger.info('Created new shared MCP pool', { projectPath: normalized })
  } else {
    const poolAny = pool as unknown as { pool?: Map<string, unknown> }
    logger.info('Reusing existing shared MCP pool', {
      projectPath: normalized,
      poolSize: poolAny.pool?.size ?? 'unknown',
    })
  }
  return pool
}

function normalizeProjectPath(projectPath: string) {
  return path.resolve(projectPath)
}

function buildLlmSignature(modelRef?: string) {
  const llm = resolveTuringLlmConfig(modelRef ?? DEFAULT_MODEL_REF)
  return {
    config: llm,
    signature: `${llm.baseUrl}::${llm.apiKey}`,
  }
}

async function createWarmProjectSession(
  projectPath: string,
  runtime: PrewarmRuntime = {},
): Promise<WarmProjectSession> {
  const normalizedProjectPath = normalizeProjectPath(projectPath)
  const { config, signature } = buildLlmSignature(runtime.modelRef)
  const harness = new Harness({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    cwd: normalizedProjectPath,
    permissionMode: 'bypass',
  })
  const { session } = await (
    harness.createProjectSession as (opts: Record<string, unknown>) => Promise<{ session: Session }>
  )({
    cwd: normalizedProjectPath,
    connectMcp: false,
    fileMemoryRuntime: {
      autoStartHydration: false,
    },
  })

  // Best-effort: attach the OpenWaggle bridge (MCP clients + skill providers)
  // during prewarm so the first prompt hits a prewarmed runtime. Failures
  // here must NOT throw away the spare — the run-path bridge will retry.
  let bridgeAttached = false
  let bridgeSignature: string | null = null
  if (runtime.mcpSettings || runtime.standardsContext) {
    try {
      const t0 = Date.now()
      const mcpPool = getSharedMcpPool(normalizedProjectPath)
      const result = await attachOpenWaggleRuntime(session, {
        mcpSettings: runtime.mcpSettings,
        standardsContext: runtime.standardsContext,
      }, {
        projectPath: normalizedProjectPath,
        mcpPool,
      })
      const mcpCount = runtime.mcpSettings?.servers.filter((s) => s.enabled).length ?? 0
      const skillCount = runtime.standardsContext?.activeSkills.length ?? 0
      const mcpFails = result.issues.filter((i) => i.kind === 'mcp-fail').length
      // `bridgeAttached` is true whenever the attach completed (even with
      // partial MCP fails). The bridge now caches partial results, so the run
      // path's `attachOpenWaggleRuntime` hits the fast-path and reuses the
      // already-connected providers.
      bridgeAttached = true
      bridgeSignature = mcpCount + skillCount > 0 ? `${mcpCount}mcp/${skillCount}skill` : null
      logger.info('Bridge attached during prewarm', {
        projectPath: normalizedProjectPath,
        mcpCount,
        skillCount,
        mcpFails,
        ms: Date.now() - t0,
      })
    } catch (error) {
      logger.warn('Bridge attach during prewarm failed; run pipeline will retry', {
        projectPath: normalizedProjectPath,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    projectPath: normalizedProjectPath,
    llmSignature: signature,
    harness,
    session,
    warmedAt: Date.now(),
    bridgeAttached,
    bridgeSignature,
  }
}

async function disposeWarmProjectSession(
  projectSession: WarmProjectSession | undefined,
): Promise<void> {
  if (!projectSession) return
  await projectSession.harness.dispose().catch(() => undefined)
}

function projectMemoryStatusFromRuntime(
  projectPath: string,
  status: WarmProjectMemoryRuntimeStatus,
): ProjectMemoryStatus {
  return {
    projectPath,
    isEnabled: status.llmSyncEnabled,
    isRefreshing: status.isRefreshing,
    lastFullSyncStartedAt: status.lastFullSummarySyncStartedAt,
    lastFullSyncCompletedAt: status.lastFullSummarySyncCompletedAt,
    lastModel: status.lastFullSummarySyncModel,
    lastError: status.lastFullSummarySyncError,
  }
}

async function readProjectMemoryStatusFromDisk(projectPath: string): Promise<ProjectMemoryStatus> {
  const memory = await FileMemory.open(projectPath)
  const summarySync = memory.getSummarySyncData()
  return {
    projectPath,
    isEnabled: summarySync.llmSyncEnabled,
    isRefreshing: false,
    lastFullSyncStartedAt: summarySync.lastFullSummarySyncStartedAt,
    lastFullSyncCompletedAt: summarySync.lastFullSummarySyncCompletedAt,
    lastModel: summarySync.lastFullSummarySyncModel,
    lastError: summarySync.lastFullSummarySyncError,
  }
}

function findWarmProjectSession(projectPath: string): WarmProjectSession | undefined {
  const normalizedProjectPath = normalizeProjectPath(projectPath)
  const spare = spareSessions.get(normalizedProjectPath)
  if (spare) return spare
  return [...assignedSessions.values()].find((entry) => entry.projectPath === normalizedProjectPath)
}

export function hasProjectMemoryPrewarm(projectPath: string, modelRef?: string): boolean {
  const normalizedProjectPath = normalizeProjectPath(projectPath)
  const cached = spareSessions.get(normalizedProjectPath)
  if (!cached) return false
  return cached.llmSignature === buildLlmSignature(modelRef).signature
}

export function getWarmProjectSession(projectPath: string): WarmProjectSession | undefined {
  return spareSessions.get(normalizeProjectPath(projectPath))
}

export function prewarmProjectMemory(
  projectPath: string,
  runtime: PrewarmRuntime = {},
): Promise<WarmProjectSession> {
  const normalizedProjectPath = normalizeProjectPath(projectPath)
  const { signature } = buildLlmSignature(runtime.modelRef)
  const cached = spareSessions.get(normalizedProjectPath)
  if (cached && cached.llmSignature === signature) {
    return Promise.resolve(cached)
  }
  const active = inflight.get(normalizedProjectPath)
  if (active && active.llmSignature === signature) {
    return active.promise
  }

  let run: Promise<WarmProjectSession>
  run = createWarmProjectSession(normalizedProjectPath, runtime)
    .then(async (projectSession) => {
      const prior = spareSessions.get(normalizedProjectPath)
      spareSessions.set(normalizedProjectPath, projectSession)
      if (prior && prior !== projectSession) {
        await disposeWarmProjectSession(prior)
      }
      logger.info('Prewarmed warm turing session', {
        projectPath: normalizedProjectPath,
        warmedAt: projectSession.warmedAt,
        bridgeAttached: projectSession.bridgeAttached,
        bridgeSignature: projectSession.bridgeSignature,
      })
      return projectSession
    })
    .catch((error: unknown) => {
      logger.warn('Failed to prewarm warm turing session', {
        projectPath: normalizedProjectPath,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    })
    .finally(() => {
      const current = inflight.get(normalizedProjectPath)
      if (current?.promise === run) {
        inflight.delete(normalizedProjectPath)
      }
    })

  inflight.set(normalizedProjectPath, { llmSignature: signature, promise: run })
  return run
}

/**
 * Rebuild the spare warm session for a project in the background, keyed to the
 * model that was just checked out. Checkout consumes the spare (spare→assigned),
 * so without this the next NEW thread would find no spare and block on a full
 * project-session build (memory index + staleness scan) before the agent can
 * start thinking. Building the replacement now — during the current run/idle
 * time — keeps a signature-matching spare ready for the next thread.
 *
 * Fire-and-forget: `prewarmProjectMemory` already de-dupes concurrent builds and
 * returns the cached spare when one is present, so repeated calls are cheap.
 */
function replenishWarmSpare(projectPath: string, runtime: PrewarmRuntime = {}) {
  void prewarmProjectMemory(projectPath, runtime).catch(() => undefined)
}

export async function checkoutWarmProjectSession(
  piSessionId: string,
  projectPath: string,
  runtime: PrewarmRuntime = {},
): Promise<WarmProjectSession> {
  const normalizedProjectPath = normalizeProjectPath(projectPath)
  const { signature } = buildLlmSignature(runtime.modelRef)
  const assigned = assignedSessions.get(piSessionId)
  if (
    assigned &&
    assigned.projectPath === normalizedProjectPath &&
    assigned.llmSignature === signature
  ) {
    // Same thread re-running with the same model: reuse its session as-is. No
    // spare was consumed, so nothing to replenish.
    return assigned
  }
  if (assigned) {
    assignedSessions.delete(piSessionId)
    await disposeWarmProjectSession(assigned)
  }

  const spare = spareSessions.get(normalizedProjectPath)
  if (spare && spare.llmSignature === signature) {
    spareSessions.delete(normalizedProjectPath)
    assignedSessions.set(piSessionId, spare)
    replenishWarmSpare(normalizedProjectPath, runtime)
    return spare
  }

  const warmed = await prewarmProjectMemory(normalizedProjectPath, runtime)
  const ready = spareSessions.get(normalizedProjectPath)
  const projectSession = ready && ready === warmed ? ready : warmed
  if (spareSessions.get(normalizedProjectPath) === projectSession) {
    spareSessions.delete(normalizedProjectPath)
  }
  assignedSessions.set(piSessionId, projectSession)
  replenishWarmSpare(normalizedProjectPath, runtime)
  return projectSession
}

export async function disposeWarmProjectSessionForPiSession(piSessionId: string): Promise<void> {
  const assigned = assignedSessions.get(piSessionId)
  if (!assigned) return
  assignedSessions.delete(piSessionId)
  await disposeWarmProjectSession(assigned)
}

export async function getProjectMemoryStatus(
  projectPath: string,
  _modelRef?: string,
): Promise<ProjectMemoryStatus> {
  const normalizedProjectPath = normalizeProjectPath(projectPath)
  const warm = findWarmProjectSession(normalizedProjectPath)
  const runtime = warm?.session.fileMemoryRuntime as WarmProjectMemoryRuntime | undefined
  const runtimeStatus = runtime?.getStatus()
  if (runtimeStatus) {
    return projectMemoryStatusFromRuntime(normalizedProjectPath, runtimeStatus)
  }
  return readProjectMemoryStatusFromDisk(normalizedProjectPath)
}

export async function refreshProjectMemory(
  projectPath: string,
  modelRef?: string,
  piSessionId?: string,
): Promise<ProjectMemoryStatus> {
  const normalizedProjectPath = normalizeProjectPath(projectPath)
  const runtime: PrewarmRuntime = modelRef ? { modelRef } : {}
  const warm = piSessionId
    ? await checkoutWarmProjectSession(piSessionId, normalizedProjectPath, runtime)
    : await prewarmProjectMemory(normalizedProjectPath, runtime)
  const memRuntime = warm.session.fileMemoryRuntime as WarmProjectMemoryRuntime | undefined
  if (!memRuntime) {
    throw new Error(`Project memory runtime is unavailable for ${normalizedProjectPath}.`)
  }
  await memRuntime.refreshAllSummaries()
  return projectMemoryStatusFromRuntime(normalizedProjectPath, memRuntime.getStatus())
}

export async function disposeAllWarmProjectSessions(): Promise<void> {
  const current = [...spareSessions.values(), ...assignedSessions.values()]
  spareSessions.clear()
  assignedSessions.clear()
  inflight.clear()
  await Promise.all(current.map((entry) => disposeWarmProjectSession(entry)))
}
