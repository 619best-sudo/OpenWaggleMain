import type { PlanReviewTask, PlanStepAttachment } from '@shared/types/plan-review'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { Textarea } from '@/shared/ui/Textarea'

/** Rows for the per-step notes box. Small on purpose — it is an aside, not the plan. */
const NOTE_TEXTAREA_ROWS = 2

const COMPLEXITY_STYLE: Record<PlanReviewTask['complexity'], string> = {
  low: 'bg-bg-hover text-text-tertiary',
  medium: 'bg-warning/15 text-warning',
  high: 'bg-error/15 text-error',
}

/** What the user is composing for one step, before it is sent. */
export interface PlanStepDraft {
  readonly notes: string
  readonly attachments: readonly PlanStepAttachment[]
}

export function emptyDraft(): PlanStepDraft {
  return { notes: '', attachments: [] }
}

export function draftHasEdits(draft: PlanStepDraft): boolean {
  return draft.notes.trim().length > 0 || draft.attachments.length > 0
}

interface PlanStepRowState {
  readonly isOpen: boolean
  readonly disabled: boolean
  /** True while this step's own file picker is staging files. */
  readonly staging: boolean
  /** Absent ⇒ attaching is disabled (nowhere to stage files to). */
  readonly projectPath?: string | null
  /**
   * The review is over — render as a record. Editing controls come off, but the
   * notes and files the user attached stay visible: they are the part of the
   * decision worth keeping on screen.
   */
  readonly readOnly?: boolean
}

interface PlanStepRowActions {
  readonly onToggle: () => void
  readonly onNotesChange: (notes: string) => void
  readonly onAttachFiles: () => void
  readonly onRemoveAttachment: (path: string) => void
}

interface PlanReviewStepRowProps {
  readonly task: PlanReviewTask
  /** Owning plan's title. Only shown when the plan set has more than one plan. */
  readonly planTitle?: string
  readonly draft: PlanStepDraft
  readonly state: PlanStepRowState
  readonly actions: PlanStepRowActions
}

/** Short "(1 note, 2 file(s))" tail shown on the collapsed toggle. */
function editsSummary(draft: PlanStepDraft) {
  const parts: string[] = []
  if (draft.notes.trim()) parts.push('1 note')
  if (draft.attachments.length) parts.push(`${draft.attachments.length} file(s)`)
  return parts.length ? ` (${parts.join(', ')})` : ''
}

/**
 * What the user pinned to this step, after the review is over.
 *
 * Worth keeping on screen: these notes and files are handed to this step alone
 * when it runs, so they explain why the step did what it did.
 */
function ResolvedStepEdits({ draft }: { readonly draft: PlanStepDraft }) {
  return (
    <div className="mt-1.5 space-y-1 border-l-2 border-accent/40 pl-2">
      {draft.notes.trim() ? (
        <div className="text-[12px] text-text-secondary">
          <span className="text-text-primary">Your instructions:</span> {draft.notes.trim()}
        </div>
      ) : null}
      {draft.attachments.length ? (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[12px] text-text-primary">Attached:</span>
          {draft.attachments.map((att) => (
            <span
              key={att.path}
              className="max-w-[220px] truncate rounded bg-bg-hover px-1.5 py-0.5 font-mono text-[11px] text-text-secondary"
              title={att.path}
            >
              {att.path.split('/').pop()}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * The instructions and files the user pins to one step — the editor while the
 * review is open, the record once it is answered.
 */
function StepAdditions({
  draft,
  state,
  actions,
  stepOrder,
}: {
  readonly draft: PlanStepDraft
  readonly state: Required<Pick<PlanStepRowState, 'isOpen' | 'disabled' | 'staging' | 'readOnly'>> &
    Pick<PlanStepRowState, 'projectPath'>
  readonly actions: PlanStepRowActions
  readonly stepOrder: number
}) {
  const { isOpen, disabled, staging, projectPath, readOnly } = state
  const hasEdits = draftHasEdits(draft)

  if (readOnly) return hasEdits ? <ResolvedStepEdits draft={draft} /> : null

  return (
    <>
      <Button
        type="button"
        variant="unstyled"
        className="mt-1.5 text-[12px] text-accent underline-offset-2 hover:underline"
        onClick={actions.onToggle}
        disabled={disabled}
      >
        {isOpen ? 'Hide' : hasEdits ? 'Edit your additions' : 'Add instructions or files'}
        {hasEdits && !isOpen ? editsSummary(draft) : ''}
      </Button>

      {isOpen ? (
        <div className="mt-2 space-y-2">
          <Textarea
            value={draft.notes}
            onChange={(event) => actions.onNotesChange(event.target.value)}
            placeholder="Extra instructions for this step only…"
            rows={NOTE_TEXTAREA_ROWS}
            disabled={disabled}
            aria-label={`Instructions for step ${stepOrder}`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={actions.onAttachFiles}
              disabled={disabled || staging || !projectPath}
              title={projectPath ? undefined : 'Open a project to attach files'}
            >
              {staging ? 'Attaching…' : 'Attach files'}
            </Button>
            {draft.attachments.map((att) => (
              <span
                key={att.path}
                className="flex items-center gap-1 rounded bg-bg-hover px-1.5 py-0.5 text-[11px] text-text-secondary"
              >
                <span className="max-w-[220px] truncate font-mono" title={att.path}>
                  {att.path.split('/').pop()}
                </span>
                <Button
                  type="button"
                  variant="unstyled"
                  aria-label={`Remove ${att.path}`}
                  className="text-text-tertiary hover:text-text-primary"
                  onClick={() => actions.onRemoveAttachment(att.path)}
                  disabled={disabled}
                >
                  ×
                </Button>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </>
  )
}

/**
 * One step of a drafted plan, with the affordance to add instructions and files
 * that ride on this step alone into its own execution.
 */
export function PlanReviewStepRow({
  task,
  planTitle,
  draft,
  state,
  actions,
}: PlanReviewStepRowProps) {
  const { isOpen, disabled, staging, projectPath, readOnly = false } = state
  const { onToggle, onNotesChange, onAttachFiles, onRemoveAttachment } = actions

  return (
    <li className="rounded-lg border border-border px-3 py-2">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-[12px] tabular-nums text-text-tertiary">{task.order}.</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-text-primary">{task.title}</span>
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[11px] uppercase tracking-wide',
                COMPLEXITY_STYLE[task.complexity],
              )}
            >
              {task.complexity}
            </span>
            {planTitle ? <span className="text-[11px] text-text-tertiary">{planTitle}</span> : null}
          </div>
          <div className="mt-0.5 text-[13px] text-text-secondary">{task.summary}</div>

          {task.files.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {task.files.map((file) => (
                <span
                  key={file}
                  className="rounded bg-code-card px-1.5 py-0.5 font-mono text-[11px] text-tool-call-file-text"
                  title={`${file} (${task.fileMutations[file] ?? 'edit'})`}
                >
                  {task.fileMutations[file] === 'write' ? '+ ' : '~ '}
                  {file}
                </span>
              ))}
            </div>
          ) : null}
          {task.verification ? (
            <div className="mt-1 text-[12px] text-text-secondary">
              <span className="text-text-primary">Done when:</span> {task.verification}
            </div>
          ) : null}
          {task.risks ? (
            <div className="mt-0.5 text-[12px] text-warning">Risk: {task.risks}</div>
          ) : null}

          <StepAdditions
            draft={draft}
            state={{ isOpen, disabled, staging, projectPath, readOnly }}
            actions={{ onToggle, onNotesChange, onAttachFiles, onRemoveAttachment }}
            stepOrder={task.order}
          />
        </div>
      </div>
    </li>
  )
}
