import { useEffect } from 'react'
import { refreshUsageSnapshotsForAuthenticatedUser } from '@/features/auth/state/app-auth-store'
import { useBackgroundRunStore } from '@/features/chat/state/background-run-store'
import { useChatStore } from '@/features/chat/state/chat-store'
import { api } from '@/shared/lib/ipc'

/**
 * Mounted once at the workspace level. Tracks which sessions have
 * active background runs by listening to runtime start/end events
 * and the run-completed event. It also keeps a lightweight render snapshot
 * for active runs so route switches do not blank live tool/reasoning rows.
 *
 * When a background run completes, updates only the affected session's
 * metadata in the sidebar (timestamp) instead of reloading the full list.
 *
 * A run is considered ended ONLY by `agent:run-completed`, never by a
 * transport `agent_end`. Machine mode runs a sequence of independent task
 * runs, each emitting its own `agent_start`/`agent_end`; treating an
 * intermediate `agent_end` as terminal tore the background-run tracking
 * down between tasks, which flipped `hasActiveRun` to false mid-run and
 * routed hydration through the idle path — discarding streamed tool rows
 * that had not been persisted yet and leaving the UI stuck on "Thinking".
 * `agent:run-completed` is emitted once per whole run by every terminator
 * (classic, waggle, team, machine, cancel, error), so it is the only signal
 * aligned with the actual run boundary.
 */
export function useBackgroundRunMonitor(): void {
  const addActiveRun = useBackgroundRunStore((s) => s.addActiveRun)
  const applyRunRenderEventBatch = useBackgroundRunStore((s) => s.applyRunRenderEventBatch)
  const removeActiveRun = useBackgroundRunStore((s) => s.removeActiveRun)
  const initialize = useBackgroundRunStore((s) => s.initialize)
  const refreshSession = useChatStore((s) => s.refreshSession)

  useEffect(() => {
    void initialize()
  }, [initialize])

  // Track stream lifecycle globally
  useEffect(() => {
    const unsubEvent = api.onAgentEventBatch((payload) => {
      for (const event of payload.events) {
        if (event.type === 'agent_start') {
          addActiveRun(payload.sessionId)
        }
      }
      // Skips sessions a mounted chat pipeline already reduces (single
      // ownership per session) — see background-run-store.
      applyRunRenderEventBatch(payload.sessionId, payload.events)
    })

    const unsubCompleted = api.onRunCompleted((payload) => {
      removeActiveRun(payload.sessionId)
      // A mounted chat pipeline flushes its own completed-run snapshot
      // (flushDeferredSessionSnapshot); refreshing here too was the second of
      // the two back-to-back full-session hydrations at run end. The monitor
      // refreshes only sessions no pipeline owns.
      if (!useBackgroundRunStore.getState().livePipelineSessions.has(payload.sessionId)) {
        void refreshSession(payload.sessionId)
      }
      void refreshUsageSnapshotsForAuthenticatedUser()
    })

    return () => {
      unsubEvent()
      unsubCompleted()
    }
  }, [addActiveRun, applyRunRenderEventBatch, refreshSession, removeActiveRun])
}
