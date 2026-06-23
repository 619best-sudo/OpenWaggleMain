import type { SessionId } from '@shared/types/brand'
import type { TeammateDefinition } from '@shared/types/teammate'
import { create } from 'zustand'

export type TeamModeStatus = 'idle' | 'running'

interface TeamModeState {
  readonly activeTeammate: TeammateDefinition | null
  readonly configSessionId: SessionId | null
  readonly runningSessionId: SessionId | null
  readonly status: TeamModeStatus
  readonly armTeammate: (teammate: TeammateDefinition, sessionId: SessionId | null) => void
  readonly startRun: (sessionId: SessionId, teammate: TeammateDefinition) => void
  readonly finishRun: (sessionId: SessionId) => void
  readonly clear: () => void
}

export const useTeamModeStore = create<TeamModeState>((set) => ({
  activeTeammate: null,
  configSessionId: null,
  runningSessionId: null,
  status: 'idle',
  armTeammate(teammate, sessionId) {
    set({
      activeTeammate: teammate,
      configSessionId: sessionId,
      runningSessionId: null,
      status: 'idle',
    })
  },
  startRun(sessionId, teammate) {
    set({
      activeTeammate: teammate,
      configSessionId: sessionId,
      runningSessionId: sessionId,
      status: 'running',
    })
  },
  finishRun(sessionId) {
    set((state) => {
      if (state.runningSessionId !== sessionId) {
        return state
      }
      return {
        activeTeammate: state.activeTeammate,
        configSessionId: sessionId,
        runningSessionId: null,
        status: 'idle' as const,
      }
    })
  },
  clear() {
    set({
      activeTeammate: null,
      configSessionId: null,
      runningSessionId: null,
      status: 'idle',
    })
  },
}))
