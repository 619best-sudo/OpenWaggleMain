import type { SessionId } from '@shared/types/brand'
import type { AgentPhaseEventPayload } from '@shared/types/phase'
import type { AgentTransportEvent } from '@shared/types/stream'
import type { WaggleStreamMetadata, WaggleTurnEvent } from '@shared/types/waggle'
import { resetPhaseForSession, updatePhaseFromTransportEvent } from '../agent/phase-tracker'
import { createLogger } from '../logger'
import { broadcastToWindows } from './broadcast'
import { applyEventToStreamBuffer } from './stream-buffer'

const logger = createLogger('stream-bridge')

export {
  clearStreamBuffer,
  getStreamBuffer,
  listStreamBuffers,
  startStreamBuffer,
} from './stream-buffer'

export function emitRunCompleted(sessionId: SessionId) {
  // The renderer treats run-completed as "the stream is over" and rehydrates —
  // every buffered event must land BEFORE that, or the final tokens are shown
  // only after the (slower) DB hydration replaces the live transcript.
  flushAgentEventBatch()
  broadcastToWindows('agent:run-completed', { sessionId })
}

/**
 * Token deltas arrive at 10²-10³ per run. Shipping each as its own IPC message
 * made the renderer do a full state reduction per token — the single biggest
 * source of streaming lag. Events are buffered for one animation frame and
 * flushed as a single `agent:event-batch`, which the renderer applies in ONE
 * state commit. Ordering is preserved (single queue, in-order flush), and
 * lifecycle events (`agent_end` — the error path funnels through it too) flush
 * immediately so a completion is never delayed by the window.
 */
const AGENT_EVENT_BATCH_WINDOW_MS = 16

type QueuedAgentEvent = { sessionId: SessionId; event: AgentTransportEvent }

let agentEventQueue: QueuedAgentEvent[] = []
let agentEventFlushTimer: NodeJS.Timeout | null = null

function flushAgentEventBatch(): void {
  if (agentEventFlushTimer !== null) {
    clearTimeout(agentEventFlushTimer)
    agentEventFlushTimer = null
  }
  if (agentEventQueue.length === 0) return

  // Group by session in queue order — one payload per session per flush keeps
  // the renderer's per-session reduction single-threaded while multi-run
  // streams stay correctly separated.
  const bySession = new Map<SessionId, AgentTransportEvent[]>()
  for (const entry of agentEventQueue) {
    const list = bySession.get(entry.sessionId)
    if (list) list.push(entry.event)
    else bySession.set(entry.sessionId, [entry.event])
  }
  agentEventQueue = []

  for (const [sessionId, events] of bySession) {
    broadcastToWindows('agent:event-batch', { sessionId, events })
  }
}

export function emitTransportEvent(sessionId: SessionId, event: AgentTransportEvent) {
  if (
    (event.type === 'custom' && event.name === 'team:auto-user-prompt') ||
    (event.type === 'message_start' && event.role === 'user') ||
    (event.type === 'message_end' && event.role === 'user')
  ) {
    logger.debug('Broadcasting Team(New) live user-related transport event', {
      sessionId,
      event,
    })
  }
  applyEventToStreamBuffer(sessionId, event)

  maybeEmitPhase({
    sessionId,
    phase: updatePhaseFromTransportEvent(sessionId, event, Date.now()),
  })

  agentEventQueue.push({ sessionId, event })
  if (event.type === 'agent_end') {
    flushAgentEventBatch()
    return
  }
  if (agentEventFlushTimer === null) {
    agentEventFlushTimer = setTimeout(flushAgentEventBatch, AGENT_EVENT_BATCH_WINDOW_MS)
  }
}

export function emitErrorAndFinish(
  sessionId: SessionId,
  message: string,
  code: string,
  runId = '',
) {
  emitTransportEvent(sessionId, {
    type: 'agent_end',
    runId,
    reason: 'error',
    error: { message, code },
    timestamp: Date.now(),
  })
}

export function emitWaggleTransportEvent(
  sessionId: SessionId,
  event: AgentTransportEvent,
  meta: WaggleStreamMetadata,
) {
  broadcastToWindows('waggle:event', { sessionId, event, meta })
}

export function emitWaggleTurnEvent(sessionId: SessionId, event: WaggleTurnEvent) {
  broadcastToWindows('waggle:turn-event', { sessionId, event })
}

export function clearAgentPhase(sessionId: SessionId) {
  const result = resetPhaseForSession(sessionId)
  if (!result.changed) return
  broadcastToWindows('agent:phase', { sessionId, phase: null })
}

function maybeEmitPhase(input: {
  sessionId: SessionId
  phase: { changed: boolean; phase: AgentPhaseEventPayload['phase'] }
}) {
  if (!input.phase.changed) return
  broadcastToWindows('agent:phase', {
    sessionId: input.sessionId,
    phase: input.phase.phase,
  })
}
