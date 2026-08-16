import type { JsonValue } from '@shared/types/json'
import { TURING_THREAD_SNAPSHOT_CUSTOM_TYPE } from '@shared/types/structural-nodes'
import type {
  AgentEvent,
  AgentHost,
  AskUserQuestionRequest,
  MediaRef,
  Phase,
  PhaseResult,
  RunPhaseOptions,
  Session,
  ThreadFollowUpContext,
  ThreadRunSnapshot,
} from 'turing-harness'
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

export function extractPersistedThreadSnapshot(
  nodes: readonly ProjectedSessionNodeInput[] | undefined,
): ThreadRunSnapshot | undefined {
  if (!nodes?.length) return undefined
  const candidates = [...nodes]
    .filter((node) => node.kind === 'custom' && node.piEntryType === 'custom')
    .sort((left, right) => right.createdOrder - left.createdOrder)

  for (const node of candidates) {
    try {
      const parsed = JSON.parse(node.contentJson) as unknown
      if (!isRecord(parsed) || parsed.customType !== TURING_THREAD_SNAPSHOT_CUSTOM_TYPE) {
        continue
      }
      const data = parsed.data
      if (isThreadRunSnapshot(data)) {
        return data
      }
    } catch {}
  }
  return undefined
}

function resolvePersistedFollowUpContext(
  session: Session,
  persistedSnapshot: ThreadRunSnapshot | undefined,
  explicitFollowUpContext: ThreadFollowUpContext | undefined,
): ThreadFollowUpContext | undefined {
  if (explicitFollowUpContext) return explicitFollowUpContext
  if (session.threadSnapshot) return undefined
  if (!persistedSnapshot) return undefined
  if (persistedSnapshot.recommendedFollowUpMode !== 'structured_continue') return undefined
  return {
    mode: 'structured_continue',
    previousRun: persistedSnapshot,
  }
}

export function createThreadSnapshotAgentHost(
  session: Session,
  persistedSnapshot: ThreadRunSnapshot | undefined,
): AgentHost {
  return {
    subscribe(fn: (e: AgentEvent) => void) {
      return session.subscribe(fn)
    },
    runChain(
      task: string,
      opts?: {
        signal?: AbortSignal
        askUserQuestion?: (request: AskUserQuestionRequest) => Promise<string>
        followUpContext?: ThreadFollowUpContext
        transcriptMode?: import('turing-harness').TranscriptMode
      },
    ) {
      const followUpContext = resolvePersistedFollowUpContext(
        session,
        persistedSnapshot,
        opts?.followUpContext,
      )
      return session.runChain(task, {
        ...opts,
        ...(followUpContext ? { followUpContext } : {}),
      })
    },
    /**
     * Flat loop driver passthrough. `HarnessAgent` with `mode:'chain'` calls this
     * under the hood; the structured-continue follow-up context is injected the
     * same way as for the legacy runChain/runPhase shims.
     */
    run(
      task: string,
      opts?: {
        signal?: AbortSignal
        askUserQuestion?: (request: AskUserQuestionRequest) => Promise<string>
        followUpContext?: ThreadFollowUpContext
        transcriptMode?: import('turing-harness').TranscriptMode
        images?: Array<{ path: string; mimeType: string }>
        skipPlan?: boolean
      },
    ) {
      const followUpContext = resolvePersistedFollowUpContext(
        session,
        persistedSnapshot,
        opts?.followUpContext,
      )
      return session.run(task, {
        ...opts,
        ...(followUpContext ? { followUpContext } : {}),
      })
    },
    runPhase(
      phase: Phase,
      task: string,
      opts?: {
        priorRefs?: MediaRef[]
        signal?: AbortSignal
        askUserQuestion?: (request: AskUserQuestionRequest) => Promise<string>
        followUpContext?: ThreadFollowUpContext
        transcriptMode?: import('turing-harness').TranscriptMode
      },
    ) {
      const followUpContext = resolvePersistedFollowUpContext(
        session,
        persistedSnapshot,
        opts?.followUpContext,
      )
      return session.runPhase(phase, task, {
        ...opts,
        ...(followUpContext ? { followUpContext } : {}),
      } satisfies RunPhaseOptions)
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
