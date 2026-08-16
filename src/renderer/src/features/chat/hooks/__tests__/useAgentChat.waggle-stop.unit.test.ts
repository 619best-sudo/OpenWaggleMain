// @vitest-environment jsdom

import { MessageId, SessionId, SupportedModelId } from '@shared/types/brand'
import type { SessionDetail } from '@shared/types/session'
import type { WaggleConfig } from '@shared/types/waggle'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  apiMock,
  createSessionWithMessages,
  emitAgentEvent,
  emitRunCompleted,
  installUseAgentChatTestLifecycle,
  runRenderSnapshots,
  SEND_PAYLOAD,
  useAgentChat,
} from './useAgentChat.test-utils'

const waggleConfig: WaggleConfig = {
  mode: 'sequential',
  agents: [
    {
      label: 'Advocate',
      model: SupportedModelId('openai/gpt-5.5'),
      roleDescription: 'Argues for the proposal',
      color: 'emerald',
    },
    {
      label: 'Critic',
      model: SupportedModelId('openai/gpt-5.5'),
      roleDescription: 'Challenges the proposal',
      color: 'violet',
    },
  ],
  stop: { primary: 'consensus', maxTurnsSafety: 4 },
}

function emitPartialAssistantOutput() {
  emitAgentEvent({
    sessionId: SessionId('session-1'),
    event: { type: 'agent_start', runId: 'waggle-run-1', timestamp: 1 },
  })
  emitAgentEvent({
    sessionId: SessionId('session-1'),
    event: {
      type: 'message_start',
      messageId: 'aborted-assistant-1',
      role: 'assistant',
      timestamp: 2,
    },
  })
  emitAgentEvent({
    sessionId: SessionId('session-1'),
    event: {
      type: 'message_update',
      messageId: 'aborted-assistant-1',
      role: 'assistant',
      assistantMessageEvent: {
        type: 'text_delta',
        contentIndex: 0,
        delta: 'Partial consensus text',
      },
      timestamp: 3,
    },
  })
}

function expectPartialAssistantVisible(messages: readonly unknown[]) {
  expect(messages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'aborted-assistant-1',
        role: 'assistant',
        parts: [{ type: 'text', content: 'Partial consensus text' }],
      }),
    ]),
  )
}

/**
 * The snapshot persisted after a stop. Aborting a run still writes the partial
 * assistant turn to the session (the provider emits the accumulated message with
 * `stopReason: 'aborted'`, and every run mode persists the resulting snapshot), so
 * a realistic post-stop snapshot CONTAINS the partial output.
 *
 * This matters because `hydrateIdleSession` treats the persisted snapshot as solely
 * authoritative on run completion — it deliberately does NOT merge the cached render
 * messages or the live cache, since the snapshot carries the handoff-stripped,
 * correctly-ordered canonical state.
 */
function createPersistedStoppedSession() {
  return createSessionWithMessages(2, [
    {
      id: MessageId('persisted-user-1'),
      role: 'user',
      createdAt: 1,
      parts: [{ type: 'text', text: SEND_PAYLOAD.text }],
    },
    {
      id: MessageId('aborted-assistant-1'),
      role: 'assistant',
      createdAt: 2,
      parts: [{ type: 'text', text: 'Partial consensus text' }],
    },
  ])
}

describe('useAgentChat Waggle stop', () => {
  installUseAgentChatTestLifecycle()

  it('keeps partial assistant output visible after a mid-turn stop snapshot refresh', async () => {
    const persistedUserOnlySession = createPersistedStoppedSession()
    apiMock.getSessionDetail.mockResolvedValue(persistedUserOnlySession)

    const { result, rerender } = renderHook(
      ({ session }: { readonly session: SessionDetail }) =>
        useAgentChat(
          SessionId('session-1'),
          session,
          SupportedModelId('claude-sonnet-4-5'),
          'medium',
        ),
      { initialProps: { session: createSessionWithMessages(1, []) } },
    )

    let sendPromise: Promise<void> | null = null
    await act(async () => {
      sendPromise = result.current.sendWaggleMessage(SEND_PAYLOAD, waggleConfig)
      await Promise.resolve()
    })

    await act(async () => {
      emitPartialAssistantOutput()
    })
    expectPartialAssistantVisible(result.current.messages)

    await act(async () => {
      result.current.stop()
      emitRunCompleted({ sessionId: SessionId('session-1') })
      await sendPromise
      rerender({ session: persistedUserOnlySession })
      await Promise.resolve()
    })

    expectPartialAssistantVisible(result.current.messages)
  })

  it('restores partial assistant output after remounting from thread history', async () => {
    const persistedUserOnlySession = createPersistedStoppedSession()
    apiMock.getSessionDetail.mockResolvedValue(persistedUserOnlySession)

    const firstMount = renderHook(
      ({ session }: { readonly session: SessionDetail }) =>
        useAgentChat(
          SessionId('session-1'),
          session,
          SupportedModelId('claude-sonnet-4-5'),
          'medium',
        ),
      { initialProps: { session: createSessionWithMessages(1, []) } },
    )

    let sendPromise: Promise<void> | null = null
    await act(async () => {
      sendPromise = firstMount.result.current.sendWaggleMessage(SEND_PAYLOAD, waggleConfig)
      await Promise.resolve()
    })

    await act(async () => {
      emitPartialAssistantOutput()
    })

    await act(async () => {
      firstMount.result.current.stop()
      emitRunCompleted({ sessionId: SessionId('session-1') })
      await sendPromise
      firstMount.rerender({ session: persistedUserOnlySession })
      await Promise.resolve()
    })

    expect(runRenderSnapshots.get('session-1')?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'aborted-assistant-1',
          role: 'assistant',
        }),
      ]),
    )

    firstMount.unmount()

    const remount = renderHook(() =>
      useAgentChat(
        SessionId('session-1'),
        persistedUserOnlySession,
        SupportedModelId('claude-sonnet-4-5'),
        'medium',
      ),
    )

    expectPartialAssistantVisible(remount.result.current.messages)
  })

  it('treats the persisted snapshot as authoritative and does not merge the cached render snapshot', async () => {
    // The persisted snapshot — not the cached render snapshot — is the source of
    // truth once a run is idle, so a cached partial turn is NOT resurrected on top
    // of an empty snapshot. In the real app the deferred-snapshot-refresh guard
    // keeps hydration from running against a stale snapshot in this window, and the
    // aborted turn is always persisted, so nothing is lost in storage.
    const emptyPersistedSession = createSessionWithMessages(1, [])
    runRenderSnapshots.set('session-1', {
      updatedAt: 1,
      messages: [
        {
          id: 'optimistic-user-1',
          role: 'user',
          parts: [{ type: 'text', content: SEND_PAYLOAD.text }],
          createdAt: new Date(1),
        },
        {
          id: 'aborted-assistant-1',
          role: 'assistant',
          parts: [{ type: 'text', content: 'Partial consensus text' }],
          createdAt: new Date(2),
        },
      ],
    })

    const { result } = renderHook(() =>
      useAgentChat(
        SessionId('session-1'),
        emptyPersistedSession,
        SupportedModelId('claude-sonnet-4-5'),
        'medium',
      ),
    )

    expect(result.current.messages.map((message) => message.id)).not.toContain(
      'aborted-assistant-1',
    )
  })
})
