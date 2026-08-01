import type { PlanReviewResolution } from '@shared/types/plan-review'
import { Button } from '@/shared/ui/Button'
import { Textarea } from '@/shared/ui/Textarea'

/** Rows for the plan-level revision comments box. */
const COMMENTS_TEXTAREA_ROWS = 2

type Decision = PlanReviewResolution['decision']

interface PlanReviewFooterProps {
  readonly comments: string
  readonly onCommentsChange: (comments: string) => void
  /** Which decision is in flight, if any. */
  readonly submitting: Decision | null
  readonly disabled: boolean
  readonly revisionsRemaining: number
  /** How many steps carry user notes/attachments — sent on approve AND revise. */
  readonly editedCount: number
  readonly error: string | null
  readonly onSubmit: (decision: Decision) => void
}

/** "2 steps with your additions" / "3 revisions left" — whichever is the news. */
function statusLabel(editedCount: number, revisionsRemaining: number) {
  if (editedCount > 0) {
    return `${editedCount} step${editedCount === 1 ? '' : 's'} with your additions — sent either way`
  }
  return `${revisionsRemaining} revision${revisionsRemaining === 1 ? '' : 's'} left`
}

/**
 * The decision bar: comments plus the three ways a review can end.
 *
 * "Send back" needs a comment (re-planning with no instruction just reproduces
 * the same plan); approve and cancel stay available at the revision budget so
 * the user is never stuck with a plan they cannot act on.
 */
export function PlanReviewFooter({
  comments,
  onCommentsChange,
  submitting,
  disabled,
  revisionsRemaining,
  editedCount,
  error,
  onSubmit,
}: PlanReviewFooterProps) {
  const noRevisionsLeft = revisionsRemaining <= 0

  return (
    <div className="mt-3 space-y-2">
      <Textarea
        value={comments}
        onChange={(event) => onCommentsChange(event.target.value)}
        placeholder={
          noRevisionsLeft
            ? 'No revisions left — approve or cancel.'
            : 'What should change about this plan? (required to send it back)'
        }
        rows={COMMENTS_TEXTAREA_ROWS}
        disabled={disabled || noRevisionsLeft}
        aria-label="Plan revision comments"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="h-[32px] rounded-full px-3.5 text-[14px] font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
          onClick={() => onSubmit('approved')}
          disabled={disabled}
        >
          {submitting === 'approved' ? 'Starting…' : 'Approve & run'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-[32px] rounded-full px-3.5 text-[14px]"
          onClick={() => onSubmit('revise')}
          disabled={disabled || noRevisionsLeft}
          title={noRevisionsLeft ? 'No revisions remaining' : undefined}
        >
          {submitting === 'revise' ? 'Re-planning…' : 'Send back'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-[32px] rounded-full px-3.5 text-[14px] hover:bg-bg-hover hover:text-text-primary"
          onClick={() => onSubmit('cancelled')}
          disabled={disabled}
        >
          Cancel
        </Button>
        <span className="text-[12px] text-text-tertiary">
          {statusLabel(editedCount, revisionsRemaining)}
        </span>
      </div>
      {error ? <div className="text-[13px] text-error">{error}</div> : null}
    </div>
  )
}
