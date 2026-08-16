import { SessionId } from '@shared/types/brand'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBackgroundRunStore } from '../background-run-store'

vi.mock('@/shared/lib/ipc', () => ({
  api: {
    listActiveRuns: vi.fn(async () => []),
  },
}))

const SESSION_A = SessionId('session-a')
const SESSION_B = SessionId('session-b')

function resetStore() {
  useBackgroundRunStore.setState({
    activeRunIds: new Set(),
    renderSnapshotsBySessionId: new Map(),
    livePipelineSessions: new Set(),
  })
}

function userMessage(id: string, content: string) {
  return {
    id,
    role: 'user',
    parts: [{ type: 'text', content }],
    createdAt: new Date(1),
  }
}

function assistantTextEvent(messageId: string, delta: string) {
  return {
    type: 'message_update',
    messageId,
    role: 'assistant',
    assistantMessageEvent: {
      type: 'text_delta',
      contentIndex: 0,
      delta,
    },
    timestamp: Date.now(),
  }
}

describe('useBackgroundRunStore', () => {
  beforeEach(() => {
    resetStore()
  })

  afterEach(() => {
    resetStore()
  })

  it('applies live render events only to the owning session snapshot', () => {
    useBackgroundRunStore.getState().setRunRenderMessages(SESSION_A, [
      userMessage('user-a', 'Prompt A'),
      {
        id: 'assistant-a',
        role: 'assistant',
        parts: [{ type: 'text', content: 'Session A answer' }],
        createdAt: new Date(2),
      },
    ])
    useBackgroundRunStore
      .getState()
      .setRunRenderMessages(SESSION_B, [userMessage('user-b', 'Prompt B')])

    useBackgroundRunStore
      .getState()
      .applyRunRenderEventBatch(SESSION_B, [assistantTextEvent('assistant-b', 'Session B answer')])

    expect(useBackgroundRunStore.getState().getRunRenderSnapshot(SESSION_A)?.messages).toEqual([
      userMessage('user-a', 'Prompt A'),
      {
        id: 'assistant-a',
        role: 'assistant',
        parts: [{ type: 'text', content: 'Session A answer' }],
        createdAt: new Date(2),
      },
    ])
    expect(useBackgroundRunStore.getState().getRunRenderSnapshot(SESSION_B)?.messages).toEqual([
      userMessage('user-b', 'Prompt B'),
      {
        id: 'assistant-b',
        role: 'assistant',
        parts: [{ type: 'text', content: 'Session B answer' }],
        createdAt: expect.any(Date),
      },
    ])
  })

  it('does not create a render snapshot from an event without a session-owned seed', () => {
    useBackgroundRunStore
      .getState()
      .setRunRenderMessages(SESSION_A, [userMessage('user-a', 'Prompt A')])

    useBackgroundRunStore
      .getState()
      .applyRunRenderEventBatch(SESSION_B, [assistantTextEvent('assistant-b', 'Session B answer')])

    expect(useBackgroundRunStore.getState().getRunRenderSnapshot(SESSION_B)).toBeNull()
    expect(useBackgroundRunStore.getState().getRunRenderSnapshot(SESSION_A)?.messages).toEqual([
      userMessage('user-a', 'Prompt A'),
    ])
  })

  it('folds a whole batch into one snapshot commit', () => {
    useBackgroundRunStore
      .getState()
      .setRunRenderMessages(SESSION_A, [userMessage('user-a', 'Prompt A')])

    useBackgroundRunStore
      .getState()
      .applyRunRenderEventBatch(SESSION_A, [
        assistantTextEvent('assistant-a', 'Ses'),
        assistantTextEvent('assistant-a', 'sion '),
        assistantTextEvent('assistant-a', 'A answer'),
      ])

    expect(useBackgroundRunStore.getState().getRunRenderSnapshot(SESSION_A)?.messages).toEqual([
      userMessage('user-a', 'Prompt A'),
      {
        id: 'assistant-a',
        role: 'assistant',
        parts: [{ type: 'text', content: 'Session A answer' }],
        createdAt: expect.any(Date),
      },
    ])
  })

  it('skips sessions a mounted chat pipeline already reduces', () => {
    // Single ownership: while the pipeline is mounted it reduces the stream and
    // writes the result back via setRunRenderMessages. The monitor applying the
    // same events here is the duplicate per-token reduction we removed.
    useBackgroundRunStore
      .getState()
      .setRunRenderMessages(SESSION_A, [userMessage('user-a', 'Prompt A')])
    useBackgroundRunStore.getState().markLivePipelineSession(SESSION_A)

    useBackgroundRunStore
      .getState()
      .applyRunRenderEventBatch(SESSION_A, [assistantTextEvent('assistant-a', 'ignored')])

    expect(useBackgroundRunStore.getState().getRunRenderSnapshot(SESSION_A)?.messages).toEqual([
      userMessage('user-a', 'Prompt A'),
    ])

    // Released on unmount, the monitor takes over the still-running stream.
    useBackgroundRunStore.getState().unmarkLivePipelineSession(SESSION_A)
    useBackgroundRunStore
      .getState()
      .applyRunRenderEventBatch(SESSION_A, [assistantTextEvent('assistant-a', 'applied')])

    expect(useBackgroundRunStore.getState().getRunRenderSnapshot(SESSION_A)?.messages).toHaveLength(
      2,
    )
  })
})
