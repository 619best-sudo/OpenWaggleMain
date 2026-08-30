import { spawn } from 'node:child_process'
import path from 'node:path'
import type { McpSettingsView } from '@shared/types/mcp'
import {
  FileMemory,
  Harness,
  McpRuntimePool,
  McpToolCache,
  type PoolLogger,
  type Session,
  setBrowserBootstrap,
} from 'turing-harness'
import type { ProjectMemoryStatus } from '../../../shared/types/project-memory'
import { createLogger } from '../../logger'
import type { AgentKernelStandardsContext } from '../../ports/agent-kernel-service'
import { createInspirationBackend } from './inspiration/inspiration-backend'
import { resolveTuringLlmConfig } from './turing-llm-config'
import { assetBackends, mediaAnalysisConfig } from './turing-media-providers'
import { routeModel } from './turing-model-routing'
import { resolveVisionModel } from './turing-vision-model'

const logger = createLogger('turing-memory-prewarm')
/** Harness-internal diagnostics, tagged separately so they can be filtered. */
const harnessLogger = createLogger('turing-harness')

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

/**
 * Where the MCP tool-metadata cache lives. Set once at startup from the app's
 * userData dir (see `setMcpToolCachePath`); until then the harness default (a
 * temp path) applies, which still works but does not survive a reboot.
 *
 * Kept as a setter rather than importing `electron` here so this module stays
 * unit-testable without an Electron runtime.
 */
let mcpToolCachePath: string | undefined
let mcpToolCache: McpToolCache | undefined

/** Point the MCP tool cache at a durable location. Call once, before any run. */
export function setMcpToolCachePath(filePath: string): void {
  mcpToolCachePath = filePath
  mcpToolCache = undefined
}

function getMcpToolCache(): McpToolCache {
  mcpToolCache ??= new McpToolCache(mcpToolCachePath ? { path: mcpToolCachePath } : {})
  return mcpToolCache
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
    pool = new McpRuntimePool({
      idleTimeoutMs: 24 * 60 * 60 * 1000,
      // With a warm cache a server's tools are registered from disk in ~2ms and
      // the child process starts only when a tool is actually called. That is
      // what removes the multi-second wait before the first turn: previously
      // every launch had to spawn and handshake every server just to learn what
      // tools existed, and readiness was bounded by the slowest one.
      toolCache: getMcpToolCache(),
      log: poolLog,
    })
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

/**
 * Whether write/edit register in content-less author-only mode (the schema drops
 * `content`/`newString`). Single source of truth: both the Harness config below
 * and the warm-session cache signature read this, so flipping it invalidates any
 * stale pre-flag session instead of silently serving the old content-required
 * `write` tool.
 */
const AUTHOR_ONLY_WRITES = true

/**
 * Cache key for a warm session's LLM wiring.
 *
 * Deliberately excludes the credential. The backend token is the signed-in
 * user's JWT, renewed on a ~15-minute timer, and the harness now resolves it per
 * request (see `apiKey` below) — so a rotated token needs no new session. Keying
 * on it threw away the warm session (memory index + staleness scan) on every
 * silent renew, which is pure cost for a value that is no longer captured.
 *
 * DOES include tool-shaping config (vision model, content-less writes). Those
 * change what the session's tools actually DO — a warm session built before
 * such a flag flipped is stale and must be rebuilt, but the model slug is
 * unchanged so it would otherwise be served from cache indefinitely.
 */
function buildLlmSignature(modelRef?: string) {
  const llm = resolveTuringLlmConfig(modelRef ?? DEFAULT_MODEL_REF)
  const visionModel = resolveVisionModel()
  return {
    config: llm,
    signature: `${llm.baseUrl}::${llm.modelSlug}::vision=${visionModel ?? ''}::authorOnlyWrites=${AUTHOR_ONLY_WRITES}`,
  }
}

/** Log levels the harness emits, mapped onto the app logger. */
function forwardHarnessLogs(session: Session): void {
  const store = (
    session as unknown as { logStore?: { subscribe?: (fn: (e: unknown) => void) => () => void } }
  ).logStore
  if (!store?.subscribe) return
  store.subscribe((entry) => {
    const e = entry as {
      level?: string
      message?: string
      tags?: string[]
      data?: unknown
    }
    const message = typeof e.message === 'string' ? e.message : ''
    if (!message) return
    const context = {
      ...(e.tags?.length ? { tags: e.tags } : {}),
      ...(e.data && typeof e.data === 'object' ? { data: e.data } : {}),
    }
    // `debug` is dropped unless the app is running at debug level anyway, so
    // forwarding it costs nothing and keeps the harness's own levels intact.
    if (e.level === 'error') harnessLogger.error(message, context)
    else if (e.level === 'warn') harnessLogger.warn(message, context)
    else if (e.level === 'debug') harnessLogger.debug(message, context)
    else harnessLogger.info(message, context)
  })
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
    // Resolved per request, not captured. The backend credential is the user's
    // JWT (15-minute TTL, renewed on a timer by the renderer auth store); a
    // snapshot taken here went stale mid-run and every later turn 401'd — which
    // the app then reported as "Invalid API key", pointing at a Settings tab
    // that does not exist. Re-reading the credential slot per call means a
    // renewal lands on the very next turn of an in-flight run.
    apiKey: () => resolveTuringLlmConfig(runtime.modelRef ?? DEFAULT_MODEL_REF).apiKey,
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
    // Same model, second job: when a TOOL returns an image (a Playwright
    // screenshot) and the run's own model is text-only, the image is described
    // by this model and the description is fed back as text. Without it the
    // screenshot is dropped — and before that, sending it verbatim made the
    // provider reject the entire request and killed the run.
    visionModel,
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
    // Content-less authoring for write/edit: the schema drops `content`/
    // `newString`, so the driver never spends tokens generating a full-file
    // draft the authoring model re-authors anyway. The authoring model (strong
    // for medium/high via routeModel, the driver itself for unrouted low writes)
    // is the sole author of the bytes. Paired with routeModel above, so a
    // routed write still escalates and a low write falls back to the driver
    // rather than erroring.
    authorOnlyWrites: AUTHOR_ONLY_WRITES,
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

  // Forward the harness's own diagnostics into the app log.
  //
  // Without this the harness logs to an in-memory LogStore nobody reads, so the
  // most useful signals are invisible from outside: which tools the loop started
  // with (including whether project/file/graph memory were registered at all),
  // when the search ladder advises the model to ask memory before grepping, MCP
  // pool hits and misses, and why a tool call was rejected. Diagnosing "memory
  // isn't being used" from the app log alone is impossible without it — the
  // absence of those lines reads as absence of the behaviour.
  forwardHarnessLogs(session)

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

async function prewarmMcpPool(projectPath: string, runtime: PrewarmRuntime): Promise<void> {
  if (!runtime.mcpSettings) return
  await reconcileMcpPool(projectPath, runtime.mcpSettings)
}

/**
 * Bring the project's shared MCP pool in line with a settings view: connect
 * every enabled stdio server that isn't pooled yet, and kill every pooled
 * server that is no longer enabled.
 *
 * Fire-and-forget by design — callers must not await this on a latency-
 * sensitive path. Each server that connects stays in the pool (24h idle
 * timeout) so subsequent runs borrow it instantly.
 *
 * Called from two places, both of them off the prompt path:
 *   - project open / model change, via {@link createWarmProjectSession}
 *   - a save on the MCP settings page, via the turing MCP config service
 *
 * This deliberately touches only the POOL — it does not register providers on any
 * session. Run-time code (`connectMcpBackground`) borrows from the warm pool and
 * registers on the live session then. Splitting warm (pool) from attach (session)
 * is what lets a spare session stay MCP-free while the pool is shared + hot.
 */
/**
 * Chromium bootstrap, run at the moment a browser is actually wanted.
 *
 * The harness drives its own browser now (`playwright-core` + the system
 * Chrome); the Playwright MCP is a fallback, not the path. So this no longer
 * keys off "an MCP server is about to spawn" — it is registered with the
 * harness as {@link setBrowserBootstrap} and fires only when a launch has
 * already FAILED, which on a machine with Chrome installed is never.
 *
 * That ordering is the point: `npx playwright install chromium` is a ~150MB
 * download, and paying it at startup on the chance a run wants a browser is
 * exactly the cost the lazy hook avoids. Playwright's installer is idempotent,
 * so a redundant call is a fast skip. Best-effort: a failure logs and moves on,
 * and the harness reports "could not start a browser" as a normal tool error.
 */
let playwrightChromiumEnsured = false

async function ensurePlaywrightChromiumOnce(): Promise<void> {
  if (playwrightChromiumEnsured) return
  playwrightChromiumEnsured = true

  logger.info('No browser could be launched; installing Chromium (one-time)')
  await new Promise<void>((resolve) => {
    const child = spawn('npx', ['playwright', 'install', 'chromium'], {
      stdio: 'ignore',
      shell: process.platform === 'win32',
    })
    child.on('close', () => resolve())
    child.on('error', () => resolve())
  })
}

/**
 * Hand the harness its provisioning hook. Called once at module load: the
 * harness holds it and invokes it only from a failed launch.
 */
setBrowserBootstrap(() =>
  ensurePlaywrightChromiumOnce().catch((error: unknown) => {
    logger.warn('Chromium bootstrap failed; the browser tools will report it', {
      error: error instanceof Error ? error.message : String(error),
    })
  }),
)

export async function reconcileMcpPool(
  projectPath: string,
  mcpSettings: McpSettingsView,
): Promise<void> {
  const normalized = normalizeProjectPath(projectPath)
  const pool = getSharedMcpPool(normalized)
  // A reconcile is triggered by something CHANGING — a project opening, a model
  // switch, or a save on the MCP page. Any of those can be the fix for a server
  // that previously failed, so forget recorded failures and let them retry.
  pool.clearFailureCooldowns()
  // Resolve the same server options the run-time bridge will use. We import the
  // resolver lazily to avoid a cycle (the bridge imports prewarm's pool getter).
  const { resolveOpenWaggleMcpServers } = await import('./turing-openwaggle-bridge')
  const { servers } = resolveOpenWaggleMcpServers(mcpSettings)

  // Kill anything the user just disabled or deleted. Without this a toggled-off
  // server keeps its child process — and keeps serving tools to the next run —
  // for the pool's full 24h idle window. `evictById` matches on provider id, so
  // it also catches a server whose command/env changed (the new options produce
  // a different signature, and the stale process would otherwise linger).
  const wantedIds = new Set(
    servers.filter((options) => pool.has(options)).map((options) => options.id),
  )
  const stale = pool.pooledIds().filter((id) => !wantedIds.has(id))
  if (stale.length > 0) {
    await Promise.allSettled(stale.map((id) => pool.evictById(id)))
    logger.info('Evicted stale MCP servers from pool', { projectPath: normalized, stale })
  }

  if (servers.length === 0) return

  // npm cache priming is the POOL's job now: it happens inside the cold-spawn
  // path, so it delays only the server actually spawning. Doing it here meant an
  // up-front barrier over every cold server before any of them was connected.
  const cold = servers.filter((options) => !pool.has(options))
  if (cold.length === 0) return
  const t0 = Date.now()
  // allSettled so a single failing server (e.g. a bad command) doesn't reject
  // the whole warm-up.
  const results = await Promise.allSettled(cold.map((options) => pool.prewarm(options)))
  const fulfilled = results.filter((r) => r.status === 'fulfilled').length
  logger.info('MCP pool prewarm complete', {
    projectPath: normalized,
    servers: cold.length,
    connected: fulfilled,
    failed: cold.length - fulfilled,
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
