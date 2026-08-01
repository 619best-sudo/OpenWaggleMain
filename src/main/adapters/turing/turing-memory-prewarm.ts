import path from 'node:path'
import type { McpSettingsView } from '@shared/types/mcp'
import { FileMemory, Harness, McpRuntimePool, type PoolLogger, type Session } from 'turing-harness'
import type { ProjectMemoryStatus } from '../../../shared/types/project-memory'
import { createLogger } from '../../logger'
import type { AgentKernelStandardsContext } from '../../ports/agent-kernel-service'
import { resolveTuringLlmConfig } from './turing-llm-config'
import { assetBackends, mediaAnalysisConfig } from './turing-media-providers'
import { createInspirationBackend } from './inspiration/inspiration-backend'
import { routeModel } from './turing-model-routing'
import { resolveVisionModel } from './turing-vision-model'

const logger = createLogger('turing-memory-prewarm')

// Adapter so the harness MCP pool writes into the same app log file the user
// reads. The harness PoolLogger uses `data?: unknown`; the app Logger uses
// `data?: object`, so we cast at the boundary.
const poolLog: PoolLogger = {
  debug: (m, d) => logger.debug(m, d as object | undefined),
  info: (m, d) => logger.info(m, d as object | undefined),
  warn: (m, d) => logger.warn(m, d as object | undefined),
  error: (m, d) => logger.error(m, d as object | undefined),
}
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
  /** MCP settings + standards context carried for deferred bridge attach at run time. */
  readonly runtime: PrewarmRuntime
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

/**
 * Get or create a shared MCP runtime pool for a given project path.
 *
 * The pool uses a near-infinite idle timeout (24h) so connected MCP servers
 * PERSIST across runs, sessions, and app idle — they're spawned once and kept
 * alive for the lifetime of the process. This makes `borrow()` essentially free
 * (a Map lookup) on every run after the first, so MCP tools are available to
 * the LLM at turn 1 instead of appearing mid-run.
 */
export function getSharedMcpPool(projectPath: string): McpRuntimePool {
  const normalized = normalizeProjectPath(projectPath)
  let pool = sharedMcpPools.get(normalized)
  if (!pool) {
    pool = new McpRuntimePool({ idleTimeoutMs: 24 * 60 * 60 * 1000, log: poolLog })
    sharedMcpPools.set(normalized, pool)
    logger.info('Created new persistent shared MCP pool', {
      projectPath: normalized,
      poolInstanceId: pool.getInstanceId(),
    })
  } else {
    const poolAny = pool as unknown as { pool?: Map<string, unknown>; getInstanceId?: () => number }
    logger.info('Reusing existing shared MCP pool', {
      projectPath: normalized,
      poolInstanceId: poolAny.getInstanceId?.() ?? 'unknown',
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
  const visionModel = resolveVisionModel()
  logger.info('Creating warm turing session', {
    projectPath: normalizedProjectPath,
    model: config.modelSlug,
    visionModel,
  })
  const harness = new Harness({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    cwd: normalizedProjectPath,
    permissionMode: 'bypass',
    // Real media generation for `assets_generator`. The harness ships only
    // placeholders (it can't pick a provider for us), so without this the tool
    // writes stand-in files. Provider is env-selected, so Runware can replace
    // OpenRouter later without touching this call site.
    assets: { backends: assetBackends(config) },
    // Vision for `media_analysis`. Without this the tool inherits the run model,
    // which is text-to-text by default — the attachment reaches a model that
    // cannot read it. Pin a multimodal slug (see `turing-vision-model`); and when
    // OPENWAGGLE_ASSET_PROVIDER=turing, route the vision call through the backend
    // `/media/analysis` proxy (JWT auth + central billing) instead of OpenRouter.
    mediaAnalysis: mediaAnalysisConfig(visionModel),
    // Internal keyword→blueprint lookup for `inspiration_generator`, used when a
    // UI/poster is built without a reference image. The backend resolves the
    // user JWT per call and silently returns null (no token / no match / backend
    // down) so the run always continues. The tool's `details` are internal.
    inspiration: { backend: createInspirationBackend() },
    // Escalation routing: (read|write) x (medium|high) -> model slug. The table
    // lives in `turing-model-routing.ts`; the harness consults it for write/edit
    // authoring and for the staged `read`'s comprehension model. Without it,
    // escalation falls back to indexing `toolModelCandidates` by complexity
    // score, where which model a rating lands on depends on the pool's length.
    routeModel,
  })
  const { session } = await (
    harness.createProjectSession as (opts: Record<string, unknown>) => Promise<{ session: Session }>
  )({
    cwd: normalizedProjectPath,
    connectMcp: false,
    fileMemoryRuntime: {
      // `autoStartHydration: false` narrows the initial hydration queue to
      // stale/pending/errored entries (instead of re-summarizing the whole
      // project on every session open). Pairing it with `llmSyncEnabled: true`
      // guarantees that narrow queue actually seeds — without it, hydration is
      // silently gated on a persisted on-disk flag that can be false, leaving
      // stale entries un-summarized forever. Full re-summarization still only
      // happens via the manual "Refresh memory" UI action (`refreshAllSummaries`).
      autoStartHydration: false,
      llmSyncEnabled: true,
    },
  })

  // Eagerly prewarm the SHARED MCP POOL in the background. We do NOT attach the
  // servers to this session's registry here (that happens at run time via
  // `connectMcpBackground` → `addPooledMcpServer`), but we DO kick off the
  // child-process spawn + JSON-RPC handshake now, against the persistent pool.
  //
  // Because the pool holds servers alive across sessions (24h idle timeout),
  // `borrow()` during a run is a Map lookup — instant — so MCP tools are in the
  // registry before turn 1. This is what makes the race condition go away:
  // the spawn cost (seconds) is paid here, in the background, while the user
  // is still typing; the run pays only the borrow cost (microseconds).
  prewarmMcpPool(normalizedProjectPath, runtime).catch((error: unknown) => {
    logger.warn('Background MCP pool prewarm failed (non-fatal)', {
      projectPath: normalizedProjectPath,
      error: error instanceof Error ? error.message : String(error),
    })
  })

  return {
    projectPath: normalizedProjectPath,
    llmSignature: signature,
    harness,
    session,
    warmedAt: Date.now(),
    runtime,
  }
}

/**
 * Eagerly connect every enabled stdio MCP server into the project's shared pool.
 * Fire-and-forget by design: callers don't await this. Each server that connects
 * stays in the pool (24h idle timeout) so subsequent runs borrow it instantly.
 *
 * This deliberately touches only the POOL — it does not register providers on any
 * session. Run-time code (`connectMcpBackground`) borrows from the warm pool and
 * registers on the live session then. Splitting warm (pool) from attach (session)
 * is what lets a spare session stay MCP-free while the pool is shared + hot.
 */
async function prewarmMcpPool(projectPath: string, runtime: PrewarmRuntime): Promise<void> {
  if (!runtime.mcpSettings) return
  const pool = getSharedMcpPool(projectPath)
  // Resolve the same server options the run-time bridge will use. We import the
  // resolver lazily to avoid a cycle (the bridge imports prewarm's pool getter).
  const { resolveOpenWaggleMcpServers } = await import('./turing-openwaggle-bridge')
  const { servers } = resolveOpenWaggleMcpServers(runtime.mcpSettings)
  if (servers.length === 0) return

  // Borrow each server into the pool with a throwaway session id. We never
  // return them — they're meant to stay warm. allSettled so a single failing
  // server (e.g. a bad command) doesn't reject the whole prewarm.
  const t0 = Date.now()
  const results = await Promise.allSettled(
    servers.map((options) => pool.borrow(options, 'prewarm')),
  )
  const fulfilled = results.filter((r) => r.status === 'fulfilled').length
  logger.info('MCP pool prewarm complete', {
    projectPath,
    servers: servers.length,
    connected: fulfilled,
    failed: servers.length - fulfilled,
    ms: Date.now() - t0,
  })
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
