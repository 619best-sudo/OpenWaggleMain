import type { PendingPlanReviewRequest, PlanReviewResolution } from '@shared/types/plan-review'
import { useMemo, useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { usePlanStepDrafts } from '../hooks/use-plan-step-drafts'
import { PlanReviewFooter } from './PlanReviewFooter'
import { emptyDraft, PlanReviewStepRow } from './PlanReviewStepRow'

interface PlanReviewCardProps {
  readonly request: PendingPlanReviewRequest
  readonly onResolve: (resolution: PlanReviewResolution) => Promise<void>
  /**
   * Project root, required to stage attachments. `prepareAttachments` copies the
   * picked files into the project's attachment store and returns stable on-disk
   * paths — which is what the agent reads. Without a project there is nowhere to
   * stage them, so attaching is disabled.
   */
  readonly projectPath?: string | null
  readonly busy?: boolean
  readonly className?: string
  /**
   * Set once the review has been answered. The card then stays on screen as a
   * READ-ONLY record of the plan and of what the user decided, instead of
   * disappearing — the approved plan is what the rest of the run is doing, so
   * it is the most useful thing in the transcript, not the least.
   */
  readonly decision?: PlanReviewResolution['decision'] | null
}

/** Past-tense label + tone for a review that has been answered. */
const DECISION_BADGE: Record<PlanReviewResolution['decision'], { label: string; tone: string }> = {
  approved: { label: 'Approved', tone: 'bg-success/15 text-success' },
  revise: { label: 'Sent back for changes', tone: 'bg-warning/15 text-warning' },
  cancelled: { label: 'Cancelled', tone: 'bg-error/15 text-error' },
}

/** Flatten the plan set into one ordered step list, respecting `executionOrder`. */
function orderedSteps(planSet: PendingPlanReviewRequest['planSet']) {
  const order = planSet.executionOrder.length
    ? planSet.executionOrder
    : planSet.plans.map((plan) => plan.id)
  return order.flatMap((planId) => {
    const doc = planSet.plans.find((plan) => plan.id === planId)
    if (!doc) return []
    return [...doc.tasks]
      .sort((a, b) => a.order - b.order)
      .map((task) => ({ task, planTitle: doc.title }))
  })
}

/** Title, verdict badge, draft counter, and the note that drove a re-plan. */
function PlanReviewHeading({
  decision,
  revision,
  stepCount,
  priorComments,
}: {
  readonly decision: PlanReviewResolution['decision'] | null
  readonly revision: number
  readonly stepCount: number
  readonly priorComments?: string
}) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="font-medium text-text-primary">{decision ? 'Plan' : 'Review plan'}</div>
          {decision ? (
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[11px] uppercase tracking-wide',
                DECISION_BADGE[decision].tone,
              )}
            >
              {DECISION_BADGE[decision].label}
            </span>
          ) : null}
        </div>
        <div className="text-[12px] text-text-secondary">
          Draft {revision}
          {stepCount > 0 ? ` · ${stepCount} step${stepCount === 1 ? '' : 's'}` : ''}
        </div>
      </div>
      {priorComments ? (
        <div className="mt-2 rounded-lg bg-bg-hover px-3 py-2 text-[13px] text-text-secondary">
          <span className="font-medium text-text-primary">Your last note: </span>
          {priorComments}
        </div>
      ) : null}
    </>
  )
}

/** The revision request the user actually sent, kept on the answered card. */
function SubmittedComments({ comments }: { readonly comments: string }) {
  if (!comments.trim()) return null
  return (
    <div className="mt-3 rounded-lg bg-bg-hover px-3 py-2 text-[13px] text-text-secondary">
      <span className="font-medium text-text-primary">What you asked for: </span>
      {comments.trim()}
    </div>
  )
}

/**
 * The plan the agent drafted, shown for review before any of it runs.
 *
 * The user can approve it, send it back with comments to be re-planned, or
 * cancel. On any step they can add instructions and attach files — those ride on
 * the plan and are handed to that step alone when it executes, which is why they
 * are submitted with BOTH approve and revise (attaching a mockup shouldn't force
 * a wasted re-planning round).
 */
export function PlanReviewCard({
  request,
  onResolve,
  projectPath,
  busy = false,
  className,
  decision = null,
}: PlanReviewCardProps) {
  const [comments, setComments] = useState('')
  const [submitting, setSubmitting] = useState<PlanReviewResolution['decision'] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reviewId, setReviewId] = useState(request.planReviewId)
  const steps = usePlanStepDrafts({ projectPath, onError: setError })

  // A new draft arrives with its own ids; carrying stale per-step edits across
  // revisions would attach a file to whichever step happens to reuse an id.
  // Reset during render rather than in an effect so the fresh draft never shows
  // a frame of the previous draft's edits — and so the guarantee holds even if a
  // caller renders this card without re-keying it per draft.
  if (reviewId !== request.planReviewId) {
    setReviewId(request.planReviewId)
    setComments('')
    setSubmitting(null)
    setError(null)
    steps.reset()
  }

  const tasks = useMemo(() => orderedSteps(request.planSet), [request.planSet])
  const multiPlan = request.planSet.plans.length > 1
  // Once answered the card is a record, not a form: everything is inert, so a
  // stale card can never submit a second, unresolvable verdict for this draft.
  const resolved = decision !== null
  const disabled = busy || submitting !== null || resolved

  async function submit(decision: PlanReviewResolution['decision']) {
    if (decision === 'revise' && comments.trim().length === 0) {
      setError('Say what should change before sending the plan back.')
      return
    }
    setError(null)
    setSubmitting(decision)
    try {
      await onResolve({
        planReviewId: request.planReviewId,
        decision,
        ...(decision === 'revise' && comments.trim() ? { comments: comments.trim() } : {}),
        ...(steps.stepEdits.length ? { stepEdits: steps.stepEdits } : {}),
      })
    } catch (submitError) {
      setSubmitting(null)
      setError(
        submitError instanceof Error ? submitError.message : 'Could not submit the plan review.',
      )
    }
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[18px] bg-bg-primary p-[3px] shadow-sm ring-1 ring-border/40',
        className,
      )}
      data-testid="plan-review-card"
    >
      <div className="rounded-[15px] bg-bg-secondary/20 px-3.5 py-3 text-[14px] leading-[1.5] ring-1 ring-inset ring-border/20">
        <PlanReviewHeading
          decision={decision}
          revision={request.revision}
          stepCount={tasks.length}
          priorComments={request.priorComments}
        />

        <ol className="mt-3 space-y-2">
          {tasks.map(({ task, planTitle }) => (
            <PlanReviewStepRow
              key={task.id}
              task={task}
              {...(multiPlan ? { planTitle } : {})}
              draft={steps.drafts[task.id] ?? emptyDraft()}
              state={{
                isOpen: steps.expanded === task.id,
                disabled,
                staging: steps.staging === task.id,
                projectPath,
                readOnly: resolved,
              }}
              actions={{
                onToggle: () => steps.toggle(task.id),
                onNotesChange: (notes) => steps.updateDraft(task.id, { notes }),
                onAttachFiles: () => steps.openFilePicker(task.id),
                onRemoveAttachment: (path) => steps.removeAttachment(task.id, path),
              }}
            />
          ))}
        </ol>

        {resolved ? (
          <SubmittedComments comments={comments} />
        ) : (
          <PlanReviewFooter
            comments={comments}
            onCommentsChange={setComments}
            submitting={submitting}
            disabled={disabled}
            revisionsRemaining={request.revisionsRemaining}
            editedCount={steps.stepEdits.length}
            error={error}
            onSubmit={(nextDecision) => void submit(nextDecision)}
          />
        )}
      </div>

      {resolved ? null : (
        <input
          ref={steps.fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            void steps.handleFilesPicked(event.target.files)
          }}
          data-testid="plan-review-file-input"
        />
      )}
    </div>
  )
}
