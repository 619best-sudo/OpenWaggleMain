import type { SessionId } from '@shared/types/brand'
import type { UIMessage } from '@shared/types/chat-ui'
import type { AgentTransportEvent } from '@shared/types/stream'
import { create } from 'zustand'
import { applyAgentTransportEvent } from '@/features/chat/lib/chat-stream-state'
import { api } from '@/shared/lib/ipc'

interface ActiveRunRenderSnapshot {
  readonly messages: readonly UIMessage[]
  readonly updatedAt: number
}

interface BackgroundRunState {
  activeRunIds: Set<SessionId>
  renderSnapshotsBySessionId: Map<SessionId, ActiveRunRenderSnapshot>
  /**
   * Sessions whose live transcript a mounted chat pipeline is already reducing
   * (`setRunRenderMessages`). The background monitor must NOT also apply events
   * to those — until ownership was explicit, every stream event was reduced
   * twice (two store commits, two transcript copies per token) and text deltas
   * were applied to the snapshot a second time.
   */
  livePipelineSessions: Set<SessionId>
  addActiveRun: (id: SessionId) => void
  removeActiveRun: (id: SessionId) => void
  hasActiveRun: (id: SessionId) => boolean
  getRunRenderSnapshot: (id: SessionId) => ActiveRunRenderSnapshot | null
  setRunRenderMessages: (id: SessionId, messages: readonly UIMessage[]) => void
  markLivePipelineSession: (id: SessionId) => void
  unmarkLivePipelineSession: (id: SessionId) => void
  applyRunRenderEventBatch: (id: SessionId, events: readonly AgentTransportEvent[]) => void
  clearRunRenderSnapshot: (id: SessionId) => void
  initialize: () => Promise<void>
}

export const useBackgroundRunStore = create<BackgroundRunState>((set, get) => ({
  activeRunIds: new Set<SessionId>(),
  renderSnapshotsBySessionId: new Map<SessionId, ActiveRunRenderSnapshot>(),
  livePipelineSessions: new Set<SessionId>(),

  addActiveRun(id: SessionId) {
    set((state) => {
      if (state.activeRunIds.has(id)) return state
      const next = new Set(state.activeRunIds)
      next.add(id)
      return { activeRunIds: next }
    })
  },

  removeActiveRun(id: SessionId) {
    set((state) => {
      if (!state.activeRunIds.has(id)) return state
      const next = new Set(state.activeRunIds)
      next.delete(id)
      return { activeRunIds: next }
    })
  },

  hasActiveRun(id: SessionId) {
    return get().activeRunIds.has(id)
  },

  getRunRenderSnapshot(id: SessionId) {
    return get().renderSnapshotsBySessionId.get(id) ?? null
  },

  setRunRenderMessages(id: SessionId, messages: readonly UIMessage[]) {
    set((state) => {
      const next = new Map(state.renderSnapshotsBySessionId)
      next.set(id, {
        messages: [...messages],
        updatedAt: Date.now(),
      })
      // Ownership is NOT claimed here: it is tied to the chat pipeline's mount
      // lifetime (mark/unmark in useAgentChat.effects), not to snapshot writes.
      // Claiming on write would leak ownership whenever a snapshot flush lands
      // after unmount, permanently silencing the background monitor.
      return { renderSnapshotsBySessionId: next }
    })
  },

  markLivePipelineSession(id: SessionId) {
    set((state) => {
      if (state.livePipelineSessions.has(id)) return state
      const next = new Set(state.livePipelineSessions)
      next.add(id)
      return { livePipelineSessions: next }
    })
  },

  unmarkLivePipelineSession(id: SessionId) {
    set((state) => {
      if (!state.livePipelineSessions.has(id)) return state
      const next = new Set(state.livePipelineSessions)
      next.delete(id)
      return { livePipelineSessions: next }
    })
  },

  applyRunRenderEventBatch(id: SessionId, events: readonly AgentTransportEvent[]) {
    set((state) => {
      // The mounted chat pipeline already reduces this session's events (and
      // caches the result via setRunRenderMessages) — applying them here again
      // is the duplicate per-token reduction this store used to perform.
      if (state.livePipelineSessions.has(id)) {
        return state
      }
      const existing = state.renderSnapshotsBySessionId.get(id)
      if (!existing) {
        return state
      }
      let messages = [...existing.messages]
      for (const event of events) {
        messages = applyAgentTransportEvent(messages, event)
      }
      const next = new Map(state.renderSnapshotsBySessionId)
      next.set(id, {
        messages,
        updatedAt: Date.now(),
      })
      return { renderSnapshotsBySessionId: next }
    })
  },

  clearRunRenderSnapshot(id: SessionId) {
    set((state) => {
      if (!state.renderSnapshotsBySessionId.has(id)) return state
      const next = new Map(state.renderSnapshotsBySessionId)
      next.delete(id)
      return { renderSnapshotsBySessionId: next }
    })
  },

  async initialize() {
    const runs = await api.listActiveRuns()
    const ids = new Set<SessionId>(runs.map((r) => r.sessionId))
    set({ activeRunIds: ids })
  },
}))
