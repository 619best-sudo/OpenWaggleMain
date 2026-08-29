import type { SessionId } from '@shared/types/brand'
import type { SupportedModelId } from '@shared/types/llm'
import type { SessionResumeState } from '@shared/types/resume'
import { useCallback, useEffect, useState } from 'react'

/**
 * Whether this session has a STOPPED run worth continuing, and how to continue it.
 *
 * The harness reports how every run stopped and, when it stopped short of its
 * plan, leaves behind a token that carries it forward. Before this, every one of
 * those stops threw the run away: the only thing a user could do with a run they
 * interrupted — or one the app was quit during — was type the whole task again
 * and pay for the reading pass a second time.
 *
 * Presence IS the signal. A run that settles writes a tombstone, so there is no
 * status to interpret: a non-null state means there is genuinely something left
 * to do, and a finished run cannot leave a stale Continue button behind it.
 */
export function useResumeRun(params: {
  readonly sessionId: SessionId | null
  readonly model: SupportedModelId
  readonly isRunning: boolean
  readonly onError?: (message: string) => void
}) {
  const { sessionId, model, isRunning, onError } = params
  const [resumeState, setResumeState] = useState<SessionResumeState | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!sessionId) {
      setResumeState(null)
      return
    }
    try {
      setResumeState(await window.api.getResumeState(sessionId))
    } catch {
      // A resume offer is an affordance, never a requirement: a failed lookup
      // means no banner, not a broken session.
      setResumeState(null)
    }
  }, [sessionId])

  // Re-check on session switch and whenever a run finishes — those are the only
  // two moments the answer can change. Dismissal is per session, so switching
  // away and back offers it again.
  useEffect(() => {
    setDismissed(false)
    void refresh()
  }, [refresh])

  useEffect(() => {
    const off = window.api.onRunCompleted((payload) => {
      if (payload.sessionId === sessionId) void refresh()
    })
    return off
  }, [sessionId, refresh])

  const resume = useCallback(
    async (answer?: string) => {
      if (!sessionId || busy) return
      if (!model.trim()) {
        onError?.('Select a model before continuing.')
        return
      }
      setBusy(true)
      try {
        await window.api.resumeRun(sessionId, model, answer)
        setResumeState(null)
      } catch (error) {
        onError?.(error instanceof Error ? error.message : 'Could not continue the run.')
      } finally {
        setBusy(false)
      }
    },
    [sessionId, model, busy, onError],
  )

  return {
    // Hidden while a run is in flight: continuing is only meaningful when
    // nothing is running, and the banner would otherwise sit under a live stream
    // offering to start a second one.
    resumeState: dismissed || isRunning ? null : resumeState,
    busy,
    resume,
    dismiss: useCallback(() => setDismissed(true), []),
  }
}
