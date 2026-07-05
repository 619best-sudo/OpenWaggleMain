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
  broadcastToWindows('agent:run-completed', { sessionId })
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

  broadcastToWindows('agent:event', { sessionId, event })
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
