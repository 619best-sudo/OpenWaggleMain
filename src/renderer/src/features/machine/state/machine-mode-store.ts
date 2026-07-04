import type { SessionId } from '@shared/types/brand'
import { create } from 'zustand'

export type MachineModeStatus = 'idle' | 'running'

interface MachineModeState {
  readonly enabled: boolean
  readonly configSessionId: SessionId | null
  readonly runningSessionId: SessionId | null
  readonly status: MachineModeStatus
  readonly setEnabled: (enabled: boolean, sessionId: SessionId | null) => void
  readonly startRun: (sessionId: SessionId) => void
  readonly finishRun: (sessionId: SessionId) => void
  readonly clear: () => void
}

export const useMachineModeStore = create<MachineModeState>((set) => ({
  enabled: false,
  configSessionId: null,
  runningSessionId: null,
  status: 'idle',
  setEnabled(enabled, sessionId) {
    if (!enabled) {
      set({
        enabled: false,
        configSessionId: null,
        runningSessionId: null,
        status: 'idle',
      })
      return
    }
    set({
      enabled: true,
      configSessionId: sessionId,
      runningSessionId: null,
      status: 'idle',
    })
  },
  startRun(sessionId) {
    set({
      enabled: true,
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
        enabled: state.enabled,
        configSessionId: sessionId,
        runningSessionId: null,
        status: 'idle' as const,
      }
    })
  },
  clear() {
    set({
      enabled: false,
      configSessionId: null,
      runningSessionId: null,
      status: 'idle',
    })
  },
}))
