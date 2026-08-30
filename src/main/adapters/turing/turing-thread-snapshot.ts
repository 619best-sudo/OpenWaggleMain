import type { ContextUsageSnapshot } from '@shared/types/context-usage'
import type { JsonValue } from '@shared/types/json'
import { TURING_THREAD_SNAPSHOT_CUSTOM_TYPE } from '@shared/types/structural-nodes'
import type {
  AgentEvent,
  AgentHost,
  AskUserQuestionRequest,
  Session,
  ThreadFollowUpContext,
  ThreadRunSnapshot,
} from 'turing-harness'
import { renderThreadContinuity } from 'turing-harness'
import type { ProjectedSessionNodeInput } from '../../ports/session-repository'
import { buildCustomSessionNode } from './turing-message-projection'

export { TURING_THREAD_SNAPSHOT_CUSTOM_TYPE }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isThreadRunSnapshot(value: unknown): value is ThreadRunSnapshot {
  if (!isRecord(value)) return false
  return (
    typeof value.timestamp === 'number' &&
    typeof value.task === 'string' &&
    (value.route === 'task' || value.route === 'conversational') &&
    (value.disposition === 'completed' ||
      value.disposition === 'pending_user_question' ||
      value.disposition === 'aborted' ||
      value.disposition === 'failed') &&
    (value.recommendedFollowUpMode === 'fresh' ||
      value.recommendedFollowUpMode === 'structured_continue') &&
    typeof value.summary === 'string' &&
    value.summary.trim().length > 0
  )
}

/**
 * How many past runs ride into the next one. Recency window only: the ledger
 * answers "what was asked and done recently", while durable knowledge belongs
 * to the project/file memory systems — a bigger N here would just be a slow
 * way to re-grow the transcript this harness exists to avoid.
 */
export const LEDGER_MAX_STEPS = 8

export function buildThreadSnapshotNode(
  snapshot: ThreadRunSnapshot,
  timestampMs = snapshot.timestamp,
): ProjectedSessionNodeInput {
  return {
    ...buildCustomSessionNode({
      customType: TURING_THREAD_SNAPSHOT_CUSTOM_TYPE,
      data: snapshot as unknown as JsonValue,
      timestampMs,
    }),
    parentId: null,
    pathDepth: 0,
    createdOrder: 0,
  }
}

/**
 * The last {@link limit} persisted run snapshots, chronological (oldest first).
 * One node is persisted per run and nothing ever trims them, so "recent steps"
 * is just the newest N of these. Ordering rides `createdOrder`, which
 * `reparentProjectedNodesToTail` rewrites as tail positions every run — the
 * persisted tree is rebuilt linear, so the order is chronology.
 */
export function extractPersistedThreadSnapshots(
  nodes: readonly ProjectedSessionNodeInput[] | undefined,
  limit: number = LEDGER_MAX_STEPS,
): ThreadRunSnapshot[] {
  if (!nodes?.length) return []
  const candidates = [...nodes]
    .filter((node) => node.kind === 'custom' && node.piEntryType === 'custom')
    .sort((left, right) => right.createdOrder - left.createdOrder)

  const snapshots: ThreadRunSnapshot[] = []
  for (const node of candidates) {
    if (snapshots.length >= limit) break
    try {
      const parsed = JSON.parse(node.contentJson) as unknown
      if (!isRecord(parsed) || parsed.customType !== TURING_THREAD_SNAPSHOT_CUSTOM_TYPE) {
        continue
      }
      const data = parsed.data
      if (isThreadRunSnapshot(data)) {
        snapshots.unshift(data)
      }
    } catch {}
  }
  return snapshots
}

export function extractPersistedThreadSnapshot(
  nodes: readonly ProjectedSessionNodeInput[] | undefined,
): ThreadRunSnapshot | undefined {
  return extractPersistedThreadSnapshots(nodes, 1)[0]
}

function snapshotIdentity(snapshot: ThreadRunSnapshot) {
  return `${snapshot.timestamp}|${snapshot.task}`
}

/**
 * Pure ledger builder: the continuity context from the persisted step ledger
 * plus the session's live in-memory slot (undefined for a cold estimate).
 *
 * Both sources can hold the SAME newest run: each run persists its snapshot
 * node at its end, and a warm session keeps it in `threadSnapshot` too. They
 * are deduped by identity with the PERSISTED copy winning, because only the
 * persisted node carries the host-stamped `userQuery` (the harness slot knows
 * the wrapped prompt, never the raw user text).
 *
 * The live slot matters in its own right: mid-run, the auth-recovery
 * continuation calls `run()` a second time on the same session, and the
 * persisted nodes are then one run BEHIND the in-memory slot. A
 * `structured_continue` gate is kept from the single-run design: when the
 * newest step recommends `fresh` (it paused on a question), no continuity is
 * injected and the answer itself rides in the new prompt.
 */
export function buildLedgerFollowUpContext(
  live: ThreadRunSnapshot | undefined,
  persistedSnapshots: readonly ThreadRunSnapshot[],
): ThreadFollowUpContext | undefined {
  const merged: ThreadRunSnapshot[] = [...persistedSnapshots]
  if (live && !merged.some((s) => snapshotIdentity(s) === snapshotIdentity(live))) {
    merged.push(live)
  }

  const steps = merged.slice(-LEDGER_MAX_STEPS)
  const newest = steps[steps.length - 1]
  if (!newest || newest.recommendedFollowUpMode !== 'structured_continue') return undefined
  return {
    mode: 'structured_continue',
    previousRun: newest,
    recentRuns: steps,
  }
}

function resolveLedgerFollowUpContext(
  session: Session,
  persistedSnapshots: readonly ThreadRunSnapshot[],
  explicitFollowUpContext: ThreadFollowUpContext | undefined,
): ThreadFollowUpContext | undefined {
  if (explicitFollowUpContext) return explicitFollowUpContext
  return buildLedgerFollowUpContext(session.threadSnapshot, persistedSnapshots)
}

export function createThreadSnapshotAgentHost(
  session: Session,
  persistedSnapshots: readonly ThreadRunSnapshot[],
): AgentHost {
  return {
    subscribe(fn: (e: AgentEvent) => void) {
      return session.subscribe(fn)
    },
    /**
     * The categorizer chain (v2) — the single execution path. The step ledger
     * (persisted run snapshots + the session's live slot) is injected as the
     * structured-continue follow-up context so the first hop of the run knows
     * what was asked and done in recent steps, not just the last one.
     */
    run(
      task: string,
      opts?: {
        signal?: AbortSignal
        askUserQuestion?: (request: AskUserQuestionRequest) => Promise<string>
        followUpContext?: ThreadFollowUpContext
        transcriptMode?: import('turing-harness').TranscriptMode
        images?: Array<{ path: string; mimeType: string }>
        planMode?: boolean
        skipPlan?: boolean
      },
    ) {
      const followUpContext = resolveLedgerFollowUpContext(
        session,
        persistedSnapshots,
        opts?.followUpContext,
      )
      return session.run(task, {
        ...opts,
        ...(followUpContext ? { followUpContext } : {}),
      })
    },
    orchestrator: session.orchestrator,
    get threadSnapshot() {
      return session.threadSnapshot
    },
    clearThreadSnapshot() {
      session.clearThreadSnapshot()
    },
  }
}

/** Context usage percent is displayed on a 0..100 ring; never exceed it. */
const CONTEXT_PERCENT_CAP = 100
/**
 * Chars → tokens. The composer meter has no tokenizer for an arbitrary
 * OpenRouter slug and must not pay for one on every session change, so it uses
 * the standard ~4-chars-per-token approximation. The figure is an estimate and
 * is labelled as the NEXT REQUEST rather than a measured transcript, which is
 * what it is.
 */
const CHARS_PER_TOKEN = 4

/**
 * What the composer's context meter shows for a turing thread.
 *
 * There is no growing transcript under this kernel: every run rebuilds its
 * context from scratch, so "context used" can only mean the size of the context
 * the NEXT run will carry. That is two things, and both are read from what the
 * thread has actually recorded:
 *
 *   the envelope   — the newest run's `task`, i.e. the full WRAPPED runtime
 *                    prompt (standards context, transcript mode, MCP listings,
 *                    the user text). The next run's envelope is built the same
 *                    way from the same session, so the last one measures it.
 *   the continuity — `renderThreadContinuity` over the step ledger this session
 *                    would inject right now. Rendering it here rather than
 *                    approximating its size is the point of the harness
 *                    exporting it: whatever it returns is exactly what the
 *                    first hop sees.
 *
 * Not counted: the categorizer's own system prompt, which is fixed per hop,
 * chosen by routing the meter cannot predict, and not something the thread
 * grows. The number is the thread's own contribution to the next request.
 *
 * A thread with no completed run reads 0 — nothing is carried yet — and grows
 * with each run until the ledger reaches its {@link LEDGER_MAX_STEPS} cap.
 */
export function buildTuringContextUsageSnapshot(input: {
  readonly persistedTranscriptNodes: readonly ProjectedSessionNodeInput[] | undefined
  readonly contextWindow: number
  // `tokens` is narrowed: unlike Pi's, this estimate is always computable — an
  // empty thread carries nothing, which is 0, not "unknown".
}): ContextUsageSnapshot & { readonly tokens: number } {
  const ledger = extractPersistedThreadSnapshots(input.persistedTranscriptNodes)
  const continuity = renderThreadContinuity(buildLedgerFollowUpContext(undefined, ledger)) ?? ''
  const envelope = ledger[ledger.length - 1]?.task ?? ''
  const tokens = Math.round((envelope.length + continuity.length) / CHARS_PER_TOKEN)
  const percent =
    input.contextWindow > 0
      ? Math.min(CONTEXT_PERCENT_CAP, (tokens / input.contextWindow) * CONTEXT_PERCENT_CAP)
      : null
  return {
    tokens,
    contextWindow: input.contextWindow,
    percent,
    label: 'Next request',
  }
}
