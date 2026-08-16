import { SessionId } from '@shared/types/brand'
import type { SessionDetail } from '@shared/types/session'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatStore } from '../chat-store'

/**
 * Integration tests for the renderer session read model.
 * Full sessions are cached locally so session navigation can select the
 * target transcript synchronously without waiting on per-click IPC.
 */

const mockApi = {
  listSessionDetails: vi.fn(),
  listSessions: vi.fn(async () => []),
  getSessionTree: vi.fn(async () => null),
  getSessionWorkspace: vi.fn(async () => null),
  getSessionDetail: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
}

vi.mock('@/shared/lib/ipc', () => ({
  api: {
    listSessionDetails: (...args: unknown[]) => mockApi.listSessionDetails(...args),
    listSessions: (...args: unknown[]) => mockApi.listSessions(...args),
    getSessionTree: (...args: unknown[]) => mockApi.getSessionTree(...args),
    getSessionWorkspace: (...args: unknown[]) => mockApi.getSessionWorkspace(...args),
    getSessionDetail: (...args: unknown[]) => mockApi.getSessionDetail(...args),
    createSession: (...args: unknown[]) => mockApi.createSession(...args),
    deleteSession: (...args: unknown[]) => mockApi.deleteSession(...args),
  },
}))

vi.mock('@/shared/lib/logger', () => ({
  createRendererLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

function resetStore() {
  useChatStore.setState({
    sessions: [],
    sessionById: new Map<SessionId, SessionDetail>(),
    missingSessionIds: new Set<SessionId>(),
    draftSession: null,
    activeSessionId: null,
    activeSession: null,
    error: null,
  })
}

function toSummary(session: ReturnType<typeof makeSessionDetail>) {
  return {
    id: session.id,
    title: session.title,
    projectPath: session.projectPath,
    messageCount: session.messages.length,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  }
}

function makeSessionDetail(id: SessionId, title = 'Session') {
  return {
    id,
    title,
    projectPath: '/repo',
    messages: [],
    createdAt: 100,
    updatedAt: 100,
  }
}

describe('useChatStore integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
  })

  afterEach(() => {
    resetStore()
  })

  it('starts with null activeSessionId', () => {
    expect(useChatStore.getState().activeSessionId).toBeNull()
  })

  it('creates a session and marks it active', async () => {
    const session = makeSessionDetail(SessionId('session-1'), 'New session')
    mockApi.createSession.mockResolvedValue(session)

    const id = await useChatStore.getState().createSession('/repo')
    await Promise.resolve()
    await Promise.resolve()

    expect(id).toBe('session-1')
    expect(useChatStore.getState().activeSessionId).toBe('session-1')
    expect(mockApi.createSession).toHaveBeenCalledWith('/repo')
    expect(mockApi.getSessionWorkspace).toHaveBeenCalledWith(SessionId('session-1'), undefined)
  })

  it('sets activeSessionId synchronously', () => {
    const id = SessionId('session-2')
    const session = makeSessionDetail(id)
    useChatStore.getState().upsertSession(session)

    useChatStore.getState().setActiveSessionId(id)

    expect(useChatStore.getState().activeSessionId).toBe(id)
    expect(useChatStore.getState().activeSession).toBe(session)
  })

  it('refreshes the active workspace when switching sessions', async () => {
    const id = SessionId('session-2')
    const session = makeSessionDetail(id)
    useChatStore.getState().upsertSession(session)

    useChatStore.getState().setActiveSession(id)
    await Promise.resolve()
    await Promise.resolve()

    expect(mockApi.getSessionWorkspace).toHaveBeenCalledWith(id, undefined)
  })

  it('startDraftSession clears activeSessionId and keeps the target project path', () => {
    useChatStore.getState().setActiveSessionId(SessionId('session-3'))
    useChatStore.getState().startDraftSession('/repo/draft')
    expect(useChatStore.getState().activeSessionId).toBeNull()
    expect(useChatStore.getState().draftSession).toEqual({ projectPath: '/repo/draft' })
  })

  it('lists sessions from summaries and fetches a session detail lazily on click', async () => {
    const first = makeSessionDetail(SessionId('session-first'), 'First')
    const second = makeSessionDetail(SessionId('session-second'), 'Second')
    mockApi.listSessions.mockResolvedValue([toSummary(first), toSummary(second)])
    mockApi.getSessionDetail.mockResolvedValue(second)

    await useChatStore.getState().loadSessions()
    useChatStore.getState().setActiveSessionId(second.id)

    expect(useChatStore.getState().sessions.map((session) => session.id)).toEqual([
      first.id,
      second.id,
    ])
    // The list never hydrates full transcripts — only the opened session does.
    expect(mockApi.listSessionDetails).not.toHaveBeenCalled()
    expect(mockApi.getSessionDetail).toHaveBeenCalledExactlyOnceWith(second.id)

    await vi.waitFor(() => {
      expect(useChatStore.getState().activeSession).toBe(second)
    })
  })

  it('reuses an already-cached session detail instead of refetching on click', async () => {
    const session = makeSessionDetail(SessionId('session-cached'), 'Cached')
    mockApi.listSessions.mockResolvedValue([toSummary(session)])
    useChatStore.getState().upsertSession(session)

    await useChatStore.getState().loadSessions()
    useChatStore.getState().setActiveSessionId(session.id)

    expect(useChatStore.getState().activeSession).toBe(session)
    expect(mockApi.getSessionDetail).not.toHaveBeenCalled()
  })

  it('throws and preserves state on createSession failure', async () => {
    mockApi.createSession.mockRejectedValue(new Error('quota exceeded'))

    await expect(useChatStore.getState().createSession('/tmp/repo')).rejects.toThrow(
      'quota exceeded',
    )

    expect(useChatStore.getState().activeSessionId).toBeNull()
  })
})
