import type { SessionId } from '@shared/types/brand'
import type { SessionDetail } from '@shared/types/session'
import { useComposerStore } from '@/features/composer/state'
import { useSessionStore } from '@/features/sessions/state'
import { api } from '@/shared/lib/ipc'
import {
  handleStoreError,
  isSameSessionId,
  mergeSummary,
  optionalSessionId,
  refreshSessionStoreForSession,
  removeSummary,
  toSessionId,
  toSummary,
} from './chat-store-helpers'
import type { ChatActions, ChatState } from './chat-store-types'

type ChatSet = (partial: Partial<ChatState> | ((state: ChatState) => Partial<ChatState>)) => void
type ChatGet = () => ChatState

function setError(set: ChatSet) {
  return (error: string) => set({ error })
}

/**
 * Loads the session list from summaries only.
 *
 * This used to call `listSessionDetails()`, which hydrates every node of every
 * session — the whole message history of the entire app — just to render a
 * sidebar list of titles. Full details are fetched lazily per session by
 * `refreshSession`, which is all any consumer of `sessionById` actually needs.
 */
async function loadSessions(set: ChatSet, get: ChatGet) {
  try {
    const all = await api.listSessions()
    const sessions = all.filter(
      (summary) => summary.title !== 'New session' || (summary.messageCount ?? 0) > 0,
    )

    const knownSessionIds = new Set(all.map((summary) => summary.id))
    const activeSessionId = get().activeSessionId
    const activeSessionExists = activeSessionId !== null && knownSessionIds.has(activeSessionId)

    // Drop cached details for sessions that no longer exist so the cache can't
    // grow unbounded or resurrect a deleted session.
    const sessionById = new Map<SessionId, SessionDetail>()
    for (const [id, detail] of get().sessionById) {
      if (knownSessionIds.has(id)) sessionById.set(id, detail)
    }

    const missingSessionIds = new Set(get().missingSessionIds)
    for (const id of knownSessionIds) {
      missingSessionIds.delete(id)
    }
    if (activeSessionId && !activeSessionExists) {
      missingSessionIds.add(activeSessionId)
    }

    const activeSession = activeSessionExists
      ? (sessionById.get(activeSessionId) ?? get().activeSession)
      : null

    set({
      sessions,
      sessionById,
      missingSessionIds,
      draftSession: activeSessionExists ? null : get().draftSession,
      activeSessionId: activeSessionExists ? activeSessionId : null,
      activeSession,
      error: null,
    })
    void useSessionStore.getState().loadSessions()
  } catch (err) {
    handleStoreError(err, 'load sessions', setError(set))
  }
}

async function createSession(projectPath: string, set: ChatSet, get: ChatGet) {
  try {
    const session = await api.createSession(projectPath)
    get().upsertSession(session)
    set({
      activeSessionId: session.id,
      activeSession: session,
      draftSession: null,
      missingSessionIds: new Set(
        [...get().missingSessionIds].filter((missingId) => missingId !== session.id),
      ),
      error: null,
    })
    void useSessionStore.getState().refreshSessionsAndWorkspace(toSessionId(session.id))
    return session.id
  } catch (err) {
    handleStoreError(err, 'create session', setError(set))
    throw err
  }
}

function setActiveSession(id: SessionId | null, set: ChatSet, get: ChatGet) {
  if (!id || get().missingSessionIds.has(id)) {
    set({ activeSessionId: null, activeSession: null, draftSession: null })
    void useSessionStore.getState().refreshSessionWorkspace(null)
    return
  }

  const cached = get().sessionById.get(id) ?? null
  set({ activeSessionId: id, activeSession: cached, draftSession: null })
  refreshSessionStoreForSession(id, id)

  if (!cached) {
    void get().refreshSession(id)
  }
}

/**
 * In-flight `getSessionDetail` calls, keyed by session.
 *
 * Opening a session fires this from several places at once (the route effect,
 * `setActiveSession`, and the post-run refresh). Each call re-reads and
 * re-hydrates every node of the session in the main process, so collapsing
 * concurrent duplicates removes most of the latency of clicking a long thread.
 */
const inFlightSessionDetailRefreshes = new Map<SessionId, Promise<void>>()

function refreshSession(id: SessionId, set: ChatSet, get: ChatGet) {
  const existing = inFlightSessionDetailRefreshes.get(id)
  if (existing) return existing

  const request = runSessionRefresh(id, set, get).finally(() => {
    inFlightSessionDetailRefreshes.delete(id)
  })
  inFlightSessionDetailRefreshes.set(id, request)
  return request
}

async function runSessionRefresh(id: SessionId, set: ChatSet, get: ChatGet) {
  try {
    const session = await api.getSessionDetail(id)
    const wasActiveSession = isSameSessionId(get().activeSessionId, id)
    if (!session) {
      removeMissingSession(id, set)
      refreshMissingSessionTree(wasActiveSession)
      return
    }
    get().upsertSession(session)
    refreshSessionStoreForSession(id, get().activeSessionId)
  } catch (err) {
    handleStoreError(err, 'refresh session', setError(set))
  }
}

function removeMissingSession(id: SessionId, set: ChatSet) {
  set((state) => {
    const sessionById = new Map(state.sessionById)
    const missingSessionIds = new Set(state.missingSessionIds)
    sessionById.delete(id)
    missingSessionIds.add(id)
    return {
      sessionById,
      missingSessionIds,
      sessions: removeSummary(state.sessions, id),
      ...(state.activeSessionId === id
        ? { activeSessionId: null, activeSession: null, draftSession: null }
        : {}),
    }
  })
}

function refreshMissingSessionTree(wasActiveSession: boolean) {
  if (wasActiveSession) {
    void useSessionStore.getState().refreshSessionTree(null)
    return
  }
  void useSessionStore.getState().loadSessions()
}

function upsertSession(session: SessionDetail, set: ChatSet) {
  set((state) => {
    const sessionById = new Map(state.sessionById)
    const missingSessionIds = new Set(state.missingSessionIds)
    sessionById.set(session.id, session)
    missingSessionIds.delete(session.id)
    return {
      sessionById,
      missingSessionIds,
      sessions: mergeSummary(state.sessions, toSummary(session)),
      draftSession: state.activeSessionId === session.id ? null : state.draftSession,
      activeSession: state.activeSessionId === session.id ? session : state.activeSession,
      error: null,
    }
  })
}

async function deleteSession(id: SessionId, set: ChatSet, get: ChatGet) {
  const previous = get()
  removeMissingSession(id, set)

  try {
    await api.deleteSession(id)
    useComposerStore.getState().clearScopedDraftsForSession(String(id))
    void useSessionStore.getState().refreshSessionsAndTree(optionalSessionId(get().activeSessionId))
  } catch (err) {
    set({
      sessions: previous.sessions,
      sessionById: previous.sessionById,
      missingSessionIds: previous.missingSessionIds,
      draftSession: previous.draftSession,
      activeSessionId: previous.activeSessionId,
      activeSession: previous.activeSession,
    })
    handleStoreError(err, 'delete session', setError(set))
    throw err
  }
}

function updateSessionTitle(id: SessionId, title: string, set: ChatSet, get: ChatGet) {
  set((state) => {
    const existing = state.sessionById.get(id)
    if (!existing) {
      const now = Date.now()
      return {
        sessions: mergeSummary(state.sessions, {
          id,
          title,
          projectPath: null,
          messageCount: 1,
          createdAt: now,
          updatedAt: now,
        }),
      }
    }

    const session = { ...existing, title }
    const sessionById = new Map(state.sessionById)
    sessionById.set(id, session)
    return {
      sessionById,
      sessions: mergeSummary(state.sessions, toSummary(session)),
      activeSession: state.activeSessionId === id ? session : state.activeSession,
    }
  })
  refreshSessionStoreForSession(id, get().activeSessionId)
}

export function createChatActions(set: ChatSet, get: ChatGet): ChatActions {
  return {
    loadSessions: () => loadSessions(set, get),
    createSession: (projectPath) => createSession(projectPath, set, get),
    startDraftSession: (projectPath = null) => {
      set({ activeSessionId: null, activeSession: null, draftSession: { projectPath } })
      void useSessionStore.getState().refreshSessionWorkspace(null)
    },
    setActiveSessionId: (id) => get().setActiveSession(id),
    setActiveSession: (id) => setActiveSession(id, set, get),
    refreshSession: (id) => refreshSession(id, set, get),
    upsertSession: (session) => upsertSession(session, set),
    deleteSession: (id) => deleteSession(id, set, get),
    updateSessionTitle: (id, title) => updateSessionTitle(id, title, set, get),
    clearError: () => set({ error: null }),
  }
}
