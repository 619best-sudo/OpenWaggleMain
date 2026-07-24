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

    const payload = {
      events: [
        {
          sessionId: SessionId('session-1'),
          event: {
            type: 'agent_start' as const,
            runId: 'run-1',
            timestamp: 1,
          },
        },
        {
          sessionId: SessionId('session-2'),
          event: {
            type: 'agent_start' as const,
            runId: 'run-2',
            timestamp: 2,
          },
        },
      ],
    }

    sourceHandlers[0](payload)

    expect(allSessionsHandler).toHaveBeenCalledWith(payload.events)
    expect(scopedHandler).toHaveBeenCalledWith([payload.events[0]])

    unsubscribeScoped()
    expect(sourceUnsubscribe).not.toHaveBeenCalled()

    unsubscribeAll()
    expect(sourceUnsubscribe).toHaveBeenCalledTimes(1)
  })
})
