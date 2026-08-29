import type { SessionResumeState } from '@shared/types/resume'
import { useState } from 'react'
import { Button } from '@/shared/ui/Button'

interface ResumeRunBannerProps {
  readonly state: SessionResumeState
  readonly busy: boolean
  readonly onResume: (answer?: string) => void
  readonly onDismiss: () => void
}

/**
 * "This run stopped before it finished. Continue?"
 *
 * The wording is the harness's own `stop.reason` — written to be shown to the
 * user as-is, in the run's terms ("the run was stopped during write_edit (step 2
 * of 4)") rather than in the app's ("status: interrupted"). Restating it here in
 * our own words would drift from what actually happened.
 *
 * A run that stopped WAITING on an answer gets an input rather than a bare
 * button: continuing without one is refused downstream, because it would land
 * straight back on the same question.
 */
export function ResumeRunBanner({ state, busy, onResume, onDismiss }: ResumeRunBannerProps) {
  const [answer, setAnswer] = useState('')
  const canContinue = !busy && (!state.needsAnswer || answer.trim().length > 0)

  return (
    <div className="mx-auto mb-2 w-full max-w-[960px] px-5">
      <div className="home-panel-frame-soft rounded-xl border border-border bg-bg-secondary/70 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 text-[12px] text-text-secondary">
            <span className="font-semibold tracking-wide text-text-primary">Unfinished run</span>{' '}
            {state.reason}
            {state.remainingSteps > 0 ? (
              <span className="text-text-tertiary">
                {' '}
                — {state.remainingSteps} step{state.remainingSteps === 1 ? '' : 's'} left.
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {state.needsAnswer ? null : (
              <Button size="sm" disabled={!canContinue} onClick={() => onResume()}>
                {busy ? 'Continuing…' : 'Continue'}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onDismiss} disabled={busy}>
              Dismiss
            </Button>
          </div>
        </div>

        {state.needsAnswer ? (
          <div className="mt-3">
            {state.question ? (
              <div className="mb-2 text-[12px] text-text-primary">{state.question}</div>
            ) : null}
            <div className="flex items-center gap-2">
              <input
                className="min-w-0 flex-1 rounded-lg border border-border bg-bg-primary px-3 py-2 text-[12px] text-text-primary outline-none focus:border-text-tertiary"
                placeholder="Your answer"
                value={answer}
                disabled={busy}
                onChange={(event) => setAnswer(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && canContinue) onResume(answer.trim())
                }}
              />
              <Button size="sm" disabled={!canContinue} onClick={() => onResume(answer.trim())}>
                {busy ? 'Continuing…' : 'Continue'}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
