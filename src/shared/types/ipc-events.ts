import type { OAuthFlowStatus } from './auth'
import type { SessionId } from './brand'
import type { AgentPhaseEventPayload } from './phase'
import type { AgentTransportEvent } from './stream'
import type { UpdateStatus } from './updater'
import type { WaggleStreamMetadata, WaggleTurnEvent } from './waggle'

export interface IpcSendChannelMap {
  'agent:cancel-machine': {
    args: [sessionId: SessionId]
  }
  'agent:cancel-waggle': {
    args: [sessionId: SessionId]
  }
  'agent:cancel-team': {
    args: [sessionId: SessionId]
  }
  'terminal:write': {
    args: [terminalId: string, data: string]
  }
  'clipboard:write-text': {
    args: [text: string]
  }
  'log:renderer': {
    args: [entry: { namespace: string; level: string; message: string; data?: unknown }]
  }
}

/**
 * Event channels — one-way, main → renderer
 */
export interface IpcEventChannelMap {
  /**
   * Pi-shaped runtime events for the renderer's live transcript runtime,
   * coalesced: main buffers transport events for one animation frame and ships
   * them together so the renderer performs a single state reduction per batch
   * instead of one per token delta. Order within a batch (and across batches)
   * is the emit order. This is the ONLY transport-event channel — there is no
   * per-event variant to subscribe to.
   */
  'agent:event-batch': {
    payload: { sessionId: SessionId; events: AgentTransportEvent[] }
  }
  'terminal:data': {
    payload: { terminalId: string; data: string }
  }
  'agent:phase': {
    payload: AgentPhaseEventPayload
  }
  'agent:run-completed': {
    payload: { sessionId: SessionId }
  }
  'window:fullscreen-changed': {
    payload: boolean
  }
  'auth:oauth-status': {
    payload: OAuthFlowStatus
  }
  /**
   * Main asking the renderer to mint a new backend session token, because a run
   * in flight was rejected as unauthorized.
   *
   * The refresh token lives only in the renderer's auth store, so main cannot
   * renew on its own — it can only report that the token it was handed is dead.
   * The renderer refreshes and pushes the replacement back down through
   * `auth:set-api-key`, which is the slot the harness reads per request.
   */
  'app-auth:refresh-required': {
    payload: { reason: 'run-unauthorized' }
  }
  'waggle:event': {
    payload: {
      sessionId: SessionId
      event: AgentTransportEvent
      meta: WaggleStreamMetadata
    }
  }
  'waggle:turn-event': {
    payload: { sessionId: SessionId; event: WaggleTurnEvent }
  }
  'attachments:prepare-from-text-progress': {
    payload: {
      operationId: string
      bytesWritten: number
      totalBytes: number
      progressPercent: number
      stage: 'writing' | 'completed'
    }
  }
  'sessions:title-updated': {
    payload: { sessionId: SessionId; title: string }
  }
  'updater:status-changed': {
    payload: UpdateStatus
  }
}
