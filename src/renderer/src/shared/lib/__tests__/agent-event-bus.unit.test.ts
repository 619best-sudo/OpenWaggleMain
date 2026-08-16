// @vitest-environment jsdom

import { SessionId } from '@shared/types/brand'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { onAgentEventBatchMock, sourceHandlers, sourceUnsubscribe } = vi.hoisted(() => {
  const sourceHandlers: Array<(payload: unknown) => void> = []
  const sourceUnsubscribe = vi.fn()
  return {
    onAgentEventBatchMock: vi.fn((handler: (payload: unknown) => void) => {
      sourceHandlers.push(handler)
      return sourceUnsubscribe
    }),
    sourceHandlers,
    sourceUnsubscribe,
  }
})

vi.mock('@/shared/lib/ipc', () => ({
  api: {
    onAgentEventBatch: onAgentEventBatchMock,
  },
}))

describe('agent-event-bus', () => {
  beforeEach(() => {
    vi.resetModules()
    onAgentEventBatchMock.mockClear()
    sourceHandlers.length = 0
    sourceUnsubscribe.mockClear()
  })

  it('reuses one source subscription and filters scoped subscribers by session', async () => {
    const { subscribeToAgentEventBatches } = await import('../agent-event-bus')
    const allSessionsHandler = vi.fn()
    const scopedHandler = vi.fn()

    const unsubscribeAll = subscribeToAgentEventBatches(allSessionsHandler)
    const unsubscribeScoped = subscribeToAgentEventBatches(scopedHandler, {
      sessionId: SessionId('session-1'),
    })

    expect(onAgentEventBatchMock).toHaveBeenCalledTimes(1)
    expect(sourceHandlers).toHaveLength(1)

    // A batch is per-session on the wire (`agent:event-batch` carries one
    // sessionId and the events coalesced for it), so scoping filters whole
    // batches, and the bus re-attaches the sessionId to each event.
    const runOne = { type: 'agent_start' as const, runId: 'run-1', timestamp: 1 }
    const runOneDelta = { type: 'agent_start' as const, runId: 'run-1b', timestamp: 2 }
    const runTwo = { type: 'agent_start' as const, runId: 'run-2', timestamp: 3 }

    sourceHandlers[0]({ sessionId: SessionId('session-1'), events: [runOne, runOneDelta] })
    sourceHandlers[0]({ sessionId: SessionId('session-2'), events: [runTwo] })

    expect(allSessionsHandler).toHaveBeenCalledTimes(2)
    expect(allSessionsHandler).toHaveBeenNthCalledWith(1, [
      { sessionId: SessionId('session-1'), event: runOne },
      { sessionId: SessionId('session-1'), event: runOneDelta },
    ])
    expect(allSessionsHandler).toHaveBeenNthCalledWith(2, [
      { sessionId: SessionId('session-2'), event: runTwo },
    ])

    expect(scopedHandler).toHaveBeenCalledTimes(1)
    expect(scopedHandler).toHaveBeenCalledWith([
      { sessionId: SessionId('session-1'), event: runOne },
      { sessionId: SessionId('session-1'), event: runOneDelta },
    ])

    unsubscribeScoped()
    expect(sourceUnsubscribe).not.toHaveBeenCalled()

    unsubscribeAll()
    expect(sourceUnsubscribe).toHaveBeenCalledTimes(1)
  })
})
