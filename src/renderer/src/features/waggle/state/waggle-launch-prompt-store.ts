import type { SessionId } from '@shared/types/brand'
import { create } from 'zustand'

export interface PendingWaggleLaunchPrompt {
  readonly prompt: string
  readonly presetId: string
}

interface WaggleLaunchPromptState {
  readonly pendingBySessionId: Readonly<Record<string, PendingWaggleLaunchPrompt>>
  readonly queuePrompt: (sessionId: SessionId, presetId: string, prompt: string) => void
  readonly clearPrompt: (sessionId: SessionId) => void
}

export const useWaggleLaunchPromptStore = create<WaggleLaunchPromptState>((set) => ({
  pendingBySessionId: {},
  queuePrompt(sessionId, presetId, prompt) {
    set((state) => ({
      pendingBySessionId: {
        ...state.pendingBySessionId,
        [String(sessionId)]: { prompt, presetId },
      },
    }))
  },
  clearPrompt(sessionId) {
    set((state) => {
      const next = { ...state.pendingBySessionId }
      delete next[String(sessionId)]
      return { pendingBySessionId: next }
    })
  },
}))
