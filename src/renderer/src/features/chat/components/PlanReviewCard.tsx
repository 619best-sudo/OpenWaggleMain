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

/**
 * What the plan actually is, when there is exactly one of it.
 *
 * A plan set carries a title and a one-line summary that the card never showed —
 * it went straight from "Review plan · Draft 1 · 6 steps" into numbered steps,
 * so the reader had to infer the shape of the change from the steps themselves.
 * With several plans the generic heading stays, because each step row already
 * names its owning plan.
 */
function soloPlan(planSet: PendingPlanReviewRequest['planSet']) {
  if (planSet.plans.length !== 1) return null
  const plan = planSet.plans[0]
  if (!plan) return null
  const title = plan.title.trim()
  const summary = plan.summary.trim()
  return { ...(title ? { title } : {}), ...(summary ? { summary } : {}) }
}

/** Title, verdict badge, draft counter, and the note that drove a re-plan. */
function PlanReviewHeading({
  decision,
  revision,
  stepCount,
  priorComments,
  plan,
}: {
  readonly decision: PlanReviewResolution['decision'] | null
  readonly revision: number
  readonly stepCount: number
  readonly priorComments?: string
  readonly plan: { title?: string; summary?: string } | null
}) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate font-medium text-text-primary">
            {plan?.title ?? (decision ? 'Plan' : 'Review plan')}
          </div>
          {decision ? (
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide',
                DECISION_BADGE[decision].tone,
              )}
            >
              {DECISION_BADGE[decision].label}
            </span>
          ) : null}
        </div>
        <div className="shrink-0 text-[11px] text-text-secondary">
          Draft {revision}
          {stepCount > 0 ? ` · ${stepCount} step${stepCount === 1 ? '' : 's'}` : ''}
        </div>
      </div>
      {plan?.summary ? (
        <div className="mt-1 text-[12px] leading-[1.5] text-text-secondary">{plan.summary}</div>
      ) : null}
      {priorComments ? (
        <div className="mt-2 border-l-2 border-border/60 pl-2.5 text-[12px] leading-[1.5] text-text-secondary">
          <span className="text-text-tertiary">Your last note </span>
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
    <div className="mt-3.5 border-t border-border/30 pt-3 text-[12px] leading-[1.5] text-text-secondary">
      <span className="text-[11px] uppercase tracking-wide text-text-tertiary">
        What you asked for
      </span>
      <div className="mt-1">{comments.trim()}</div>
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
  const tasks = useMemo(() => orderedSteps(request.planSet), [request.planSet])
  const stepTasks = useMemo(() => tasks.map((entry) => entry.task), [tasks])
  // Declared after `stepTasks` so a reset during render seeds from the NEW
  // draft's steps, carrying the user's existing notes and attachments forward.
  const steps = usePlanStepDrafts({ tasks: stepTasks, projectPath, onError: setError })

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

  const multiPlan = request.planSet.plans.length > 1
  const plan = useMemo(() => soloPlan(request.planSet), [request.planSet])
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
      <div className="rounded-[15px] bg-bg-secondary/20 px-3.5 py-3 text-[13px] leading-[1.5] ring-1 ring-inset ring-border/20">
        <PlanReviewHeading
          decision={decision}
          revision={request.revision}
          stepCount={tasks.length}
          priorComments={request.priorComments}
          plan={plan}
        />

        <ol className="mt-3 space-y-3.5">
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
