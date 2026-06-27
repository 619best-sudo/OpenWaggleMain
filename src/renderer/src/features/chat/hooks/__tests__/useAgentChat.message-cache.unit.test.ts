// @vitest-environment jsdom

import { SessionId } from '@shared/types/brand'
import type { UIMessage } from '@shared/types/chat-ui'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('setMessagesForSession', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('publishes optimistic messages immediately in production mode', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    vi.resetModules()

    try {
      const { setMessagesForSession } = await import('../useAgentChat.message-cache')
      const sessionId = SessionId('session-1')
      const nextMessages: UIMessage[] = [
        {
          id: 'optimistic-user-1',
          role: 'user',
          parts: [{ type: 'text', content: 'Keep this prompt visible' }],
          createdAt: new Date(1),
        },
      ]
      const messagesBySessionIdRef = { current: new Map() }
      const setMessagesBySessionId = vi.fn()
      const setRunRenderMessages = vi.fn()
      const requestAnimationFrameSpy = vi
        .spyOn(window, 'requestAnimationFrame')
        .mockImplementation(() => 1)

      setMessagesForSession(
        messagesBySessionIdRef,
        setMessagesBySessionId,
        setRunRenderMessages,
        sessionId,
        nextMessages,
        { cacheRunSnapshot: true },
      )

      expect(setMessagesBySessionId).toHaveBeenCalledTimes(1)
      expect(setMessagesBySessionId).toHaveBeenCalledWith(messagesBySessionIdRef.current)
      expect(setRunRenderMessages).toHaveBeenCalledWith(sessionId, nextMessages)
      expect(requestAnimationFrameSpy).not.toHaveBeenCalled()
    } finally {
      process.env.NODE_ENV = previousNodeEnv
      vi.resetModules()
    }
  })
})
