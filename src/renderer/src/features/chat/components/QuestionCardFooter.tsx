import type { UserQuestionAttachment } from '@shared/types/user-question'
import { Button } from '@/shared/ui/Button'

interface SubmittedAnswerProps {
  readonly answer: string
  readonly attachments: readonly UserQuestionAttachment[]
}

/**
 * What the user answered, once they have.
 *
 * This REPLACES the inputs rather than sitting under them. The card stays on
 * screen as the record of the exchange, and the previous version kept the
 * (disabled) picker, the typed value, and a boxed copy of the same answer all
 * visible at once — the answer said three times, in a panel inside a panel
 * inside the card's own frame.
 *
 * So: no third surface. A hairline separates the question from the answer, the
 * label is a quiet caption, and the answer is plain text at the same weight as
 * the question it answers. Attached files are named chips, because the answer
 * to "send me the mockup" is a filename and nothing else needs saying.
 */
export function SubmittedAnswer({ answer, attachments }: SubmittedAnswerProps) {
  return (
    <div className="mt-3.5 border-t border-border/30 pt-3">
      <div className="text-[11px] uppercase tracking-wide text-text-tertiary">Your answer</div>
      {answer ? (
        <div className="mt-1 text-[13px] leading-[1.5] text-text-primary">{answer}</div>
      ) : null}
      {attachments.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {attachments.map((attachment) => (
            <span
              key={attachment.path}
              className="max-w-[240px] truncate rounded bg-bg-hover px-1.5 py-0.5 font-mono text-[10px] text-text-secondary"
              title={attachment.path}
            >
              {attachment.path.split('/').pop() ?? attachment.path}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

interface QuestionCardFooterProps {
  readonly disabled: boolean
  readonly helperText?: string
  readonly onSubmit: () => void
}

/**
 * The helper line and the single Continue action.
 *
 * Only rendered while the question is open. Once answered there is nothing left
 * to do here, and a permanently disabled button plus a "resuming…" line is two
 * more elements saying what the answer above already says.
 */
export function QuestionCardFooter({ disabled, helperText, onSubmit }: QuestionCardFooterProps) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/30 pt-3">
      <div className="text-[13px] leading-[1.5] text-text-tertiary">
        {helperText ?? 'Answer here to resume the run immediately.'}
      </div>
      <Button
        variant="primary"
        size="sm"
        className="h-[32px] rounded-full px-4 text-[13px] font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
        onClick={onSubmit}
        disabled={disabled}
      >
        {disabled ? 'Submitting...' : 'Continue'}
      </Button>
    </div>
  )
}
