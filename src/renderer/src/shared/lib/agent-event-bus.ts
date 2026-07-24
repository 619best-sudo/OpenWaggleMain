import type { SessionId } from '@shared/types/brand'
import type { IpcEventPayload } from '@shared/types/ipc'
import { api } from '@/shared/lib/ipc'

export type AgentEventPayload = IpcEventPayload<'agent:event'>
export type AgentEventBatchPayload = IpcEventPayload<'agent:event-batch'>

interface AgentEventSubscriber {
  readonly sessionId?: SessionId
  readonly handler: (events: AgentEventPayload[]) => void
}

const subscribers = new Set<AgentEventSubscriber>()
let unsubscribeFromSource: (() => void) | null = null

function ensureSourceSubscription() {
  if (unsubscribeFromSource) return
  unsubscribeFromSource = api.onAgentEventBatch((payload) => {
    if (payload.events.length === 0) return
    for (const subscriber of subscribers) {
      const scopedEvents = subscriber.sessionId
        ? payload.events.filter((event) => event.sessionId === subscriber.sessionId)
        : payload.events
      if (scopedEvents.length === 0) continue
      subscriber.handler(scopedEvents)
    }
  })
}

function maybeDisposeSourceSubscription() {
  if (subscribers.size > 0 || !unsubscribeFromSource) return
  unsubscribeFromSource()
  unsubscribeFromSource = null
}

export function subscribeToAgentEventBatches(
  handler: (events: AgentEventPayload[]) => void,
  opts: { sessionId?: SessionId } = {},
): () => void {
  const subscriber: AgentEventSubscriber = {
    sessionId: opts.sessionId,
    handler,
  }
  subscribers.add(subscriber)
  ensureSourceSubscription()
  return () => {
    subscribers.delete(subscriber)
    maybeDisposeSourceSubscription()
  }
}
