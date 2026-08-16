// @vitest-environment jsdom

import { SessionId, SupportedModelId } from '@shared/types/brand'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  createSession,
  emitAgentEvent,
  emitAgentEventBatch,
  emitRunCompleted,
  installUseAgentChatTestLifecycle,
  markLivePipelineSessionMock,
  SEND_PAYLOAD,
  unmarkLivePipelineSessionMock,
  useAgentChat,
} from './useAgentChat.test-utils'

describe('useAgentChat streaming', () => {
  installUseAgentChatTestLifecycle()

  it('applies stream text immediately as chunks arrive', async () => {
    const { result } = renderHook(() =>
      useAgentChat(
        SessionId('session-1'),
        createSession(),
        SupportedModelId('claude-sonnet-4-5'),
        'medium',
      ),
    )

    let sendPromise: Promise<void> | null = null
    await act(async () => {
      sendPromise = result.current.sendMessage(SEND_PAYLOAD)
    })

    await act(async () => {
      emitAgentEvent({
        sessionId: SessionId('session-1'),
        event: {
          type: 'agent_start',
          runId: 'run-1',
          timestamp: 1,
        },
      })
      emitAgentEvent({
        sessionId: SessionId('session-1'),
        event: {
          type: 'message_start',
          messageId: 'assistant-1',
          role: 'assistant',
          timestamp: 2,
        },
      })
      emitAgentEvent({
        sessionId: SessionId('session-1'),
        event: {
          type: 'message_update',
          messageId: 'assistant-1',
          role: 'assistant',
          assistantMessageEvent: {
            type: 'text_delta',
            contentIndex: 0,
            delta: 'Working',
          },
          timestamp: 3,
        },
      })
    })

    expect(result.current.messages.at(-1)).toEqual(
      expect.objectContaining({
        id: 'assistant-1',
        role: 'assistant',
        parts: [{ type: 'text', content: 'Working' }],
      }),
    )

    await act(async () => {
      emitRunCompleted({ sessionId: SessionId('session-1') })
      await sendPromise
    })
  })

  it('uses canonical tool input from toolcall_start without waiting for follow-up events', async () => {
    const { result } = renderHook(() =>
      useAgentChat(
        SessionId('session-1'),
        createSession(),
        SupportedModelId('claude-sonnet-4-5'),
        'medium',
      ),
    )

    let sendPromise: Promise<void> | null = null
    await act(async () => {
      sendPromise = result.current.sendMessage(SEND_PAYLOAD)
    })

    await act(async () => {
      emitAgentEvent({
        sessionId: SessionId('session-1'),
        event: {
          type: 'agent_start',
          runId: 'run-1',
          timestamp: 1,
        },
      })
      emitAgentEvent({
        sessionId: SessionId('session-1'),
        event: {
          type: 'message_start',
          messageId: 'assistant-1',
          role: 'assistant',
          timestamp: 2,
        },
      })
      emitAgentEvent({
        sessionId: SessionId('session-1'),
        event: {
          type: 'message_update',
          messageId: 'assistant-1',
          role: 'assistant',
          assistantMessageEvent: {
            type: 'toolcall_start',
            contentIndex: 0,
            toolCallId: 'tool-2',
            toolName: 'read',
            input: { path: 'src/app.ts' },
          },
          timestamp: 3,
        },
      })
    })

    expect(result.current.messages.at(-1)).toEqual(
      expect.objectContaining({
        id: 'assistant-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            id: 'tool-2',
            name: 'read',
            arguments: '{"path":"src/app.ts"}',
            state: 'input-complete',
          },
        ],
      }),
    )

    await act(async () => {
      emitRunCompleted({ sessionId: SessionId('session-1') })
      await sendPromise
    })
  })

  it('claims stream-reduction ownership while mounted and releases it on unmount', () => {
    // Single ownership per session. While this pipeline is mounted it is the
    // only reducer of the session's events; the background-run monitor must
    // stand down, or every token is reduced twice (two store commits and two
    // transcript copies per delta) — the dominant cost of the streaming lag.
    const { unmount } = renderHook(() =>
      useAgentChat(
        SessionId('session-1'),
        createSession(),
        SupportedModelId('claude-sonnet-4-5'),
        'medium',
      ),
    )

    expect(markLivePipelineSessionMock).toHaveBeenCalledWith(SessionId('session-1'))
    expect(unmarkLivePipelineSessionMock).not.toHaveBeenCalled()

    unmount()

    // Released so a run that outlives the view falls back to the monitor.
    expect(unmarkLivePipelineSessionMock).toHaveBeenCalledWith(SessionId('session-1'))
  })

  it('applies a whole batch of deltas, in order, in one pass', async () => {
    const { result } = renderHook(() =>
      useAgentChat(
        SessionId('session-1'),
        createSession(),
        SupportedModelId('claude-sonnet-4-5'),
        'medium',
      ),
    )

    let sendPromise: Promise<void> | null = null
    await act(async () => {
      sendPromise = result.current.sendMessage(SEND_PAYLOAD)
    })

    await act(async () => {
      emitAgentEventBatch({
        sessionId: SessionId('session-1'),
        events: [
          { type: 'agent_start', runId: 'run-1', timestamp: 1 },
          {
            type: 'message_update',
            messageId: 'assistant-1',
            role: 'assistant',
            assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'Hel' },
            timestamp: 2,
          },
          {
            type: 'message_update',
            messageId: 'assistant-1',
            role: 'assistant',
            assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'lo ' },
            timestamp: 3,
          },
          {
            type: 'message_update',
            messageId: 'assistant-1',
            role: 'assistant',
            assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'world' },
            timestamp: 4,
          },
        ],
      })
    })

    expect(result.current.messages.at(-1)).toEqual(
      expect.objectContaining({
        id: 'assistant-1',
        role: 'assistant',
        parts: [{ type: 'text', content: 'Hello world' }],
      }),
    )

    await act(async () => {
      emitRunCompleted({ sessionId: SessionId('session-1') })
      await sendPromise
    })
  })
})
