import type { PlanReviewTask, PlanStepAttachment } from '@shared/types/plan-review'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { Textarea } from '@/shared/ui/Textarea'

/** Rows for the per-step notes box. Small on purpose — it is an aside, not the plan. */
const NOTE_TEXTAREA_ROWS = 2

// NOTE: `task.complexity` is deliberately not rendered. It decides which model
// authors the step's files — an internal routing signal the reviewer cannot act
// on — and a coloured LOW/MEDIUM/HIGH badge on every row was the loudest thing
// in a list whose actual content is the titles. Same reasoning as the tool
// permission card.

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

/** Short "· note, 2 files" tail shown on the collapsed toggle. */
function editsSummary(draft: PlanStepDraft) {
  const parts: string[] = []
  if (draft.notes.trim()) parts.push('note')
  if (draft.attachments.length) {
    parts.push(`${draft.attachments.length} file${draft.attachments.length === 1 ? '' : 's'}`)
  }
  return parts.length ? ` · ${parts.join(', ')}` : ''
}

/**
 * The step's position, as a marker rather than a bordered row.
 *
 * The list used to give every step its own `border` + `rounded-lg` box, nested
 * inside the card's own two frames — three stacked surfaces for what is really
 * an ordered list. A numbered marker carries the same structure with none of
 * the weight, and lets the titles be the thing you see.
 */
function StepNumber({ order }: { readonly order: number }) {
  return (
    <span className="mt-px flex size-[20px] shrink-0 items-center justify-center rounded-full bg-bg-hover text-[11px] font-medium tabular-nums text-text-tertiary">
      {order}
    </span>
  )
}

/**
 * The files a step touches, split by what happens to them.
 *
 * `+`/`~` prefixes were a private notation nobody was told; "new" and "edit" is
 * the same information in words the reviewer already has. Created files carry
 * the accent because creating one is the decision worth catching in a plan you
 * are about to approve.
 */
function StepFiles({
  files,
  mutations,
}: {
  readonly files: readonly string[]
  readonly mutations: Readonly<Record<string, 'edit' | 'write'>>
}) {
  if (files.length === 0) return null
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {files.map((file) => {
        const isNew = mutations[file] === 'write'
        return (
          <span
            key={file}
            className={cn(
              'flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px]',
              isNew ? 'bg-accent/10 text-accent' : 'bg-code-card text-tool-call-file-text',
            )}
            title={file}
          >
            <span className="font-sans text-[10px] uppercase tracking-wide opacity-70">
              {isNew ? 'new' : 'edit'}
            </span>
            <span className="max-w-[260px] truncate">{file}</span>
          </span>
        )
      })}
    </div>
  )
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
    <li className="flex items-start gap-2.5">
      <StepNumber order={task.order} />
      <div className="min-w-0 flex-1 pb-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium text-text-primary">{task.title}</span>
          {planTitle ? <span className="text-[11px] text-text-tertiary">{planTitle}</span> : null}
        </div>
        <div className="mt-0.5 text-[13px] leading-[1.5] text-text-secondary">{task.summary}</div>

        <StepFiles files={task.files} mutations={task.fileMutations} />

        {task.verification ? (
          <div className="mt-1.5 text-[12px] leading-[1.45] text-text-secondary">
            <span className="text-text-tertiary">Done when </span>
            {task.verification}
          </div>
        ) : null}
        {task.risks ? (
          <div className="mt-1 text-[12px] leading-[1.45] text-warning">{task.risks}</div>
        ) : null}

        <StepAdditions
          draft={draft}
          state={{ isOpen, disabled, staging, projectPath, readOnly }}
          actions={{ onToggle, onNotesChange, onAttachFiles, onRemoveAttachment }}
          stepOrder={task.order}
        />
      </div>
    </li>
  )
}
