import type { PlanReviewStepEdit, PlanStepAttachment } from '@shared/types/plan-review'
import { useRef, useState } from 'react'
import type { PlanStepDraft } from '../components/PlanReviewStepRow'
import { draftHasEdits, emptyDraft } from '../components/PlanReviewStepRow'

/** Per-step edits the user is composing, keyed by task id. */
type DraftEdits = Record<string, PlanStepDraft>

/**
 * Collapse the drafts into the wire shape, dropping steps the user never
 * touched. An empty `stepEdits` array is omitted by the caller so an untouched
 * approval stays a plain approval.
 */
function toStepEdits(drafts: DraftEdits): PlanReviewStepEdit[] {
  return Object.entries(drafts)
    .filter(([, draft]) => draftHasEdits(draft))
    .map(([taskId, draft]) => ({
      taskId,
      ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
      ...(draft.attachments.length ? { attachments: [...draft.attachments] } : {}),
    }))
}

interface UsePlanStepDraftsInput {
  /**
   * Project root the picked files are staged into. Absent ⇒ attaching fails with
   * a message, because there is nowhere to put the files.
   */
  readonly projectPath?: string | null
  /** Surfaced to the user by the card, which owns the single error slot. */
  readonly onError: (message: string | null) => void
}

/**
 * The per-step notes/attachments the user composes while reviewing a plan.
 *
 * Kept out of the card so the card is only layout + submit: this owns the draft
 * map, which step is expanded, the hidden file input, and the staging round trip
 * that turns picked files into stable on-disk paths.
 */
export function usePlanStepDrafts({ projectPath, onError }: UsePlanStepDraftsInput) {
  const [drafts, setDrafts] = useState<DraftEdits>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [staging, setStaging] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const attachTargetRef = useRef<string | null>(null)

  function reset() {
    setDrafts({})
    setExpanded(null)
    setStaging(null)
  }

  function updateDraft(taskId: string, patch: Partial<PlanStepDraft>) {
    setDrafts((prev) => ({ ...prev, [taskId]: { ...(prev[taskId] ?? emptyDraft()), ...patch } }))
  }

  function toggle(taskId: string) {
    setExpanded((prev) => (prev === taskId ? null : taskId))
  }

  function openFilePicker(taskId: string) {
    attachTargetRef.current = taskId
    fileInputRef.current?.click()
  }

  function removeAttachment(taskId: string, filePath: string) {
    updateDraft(taskId, {
      attachments: (drafts[taskId]?.attachments ?? []).filter((att) => att.path !== filePath),
    })
  }

  async function handleFilesPicked(fileList: FileList | null) {
    const taskId = attachTargetRef.current
    attachTargetRef.current = null
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (!taskId || !fileList?.length) return
    if (!projectPath) {
      onError('Open a project before attaching files to a step.')
      return
    }

    setStaging(taskId)
    try {
      // Stage through the same path the composer uses: the files are copied into
      // the project's attachment store and come back with stable on-disk paths,
      // which is what the agent reads when the step runs. A raw drag-and-drop
      // path could be a temp file that is gone by then.
      const prepared = await window.api.prepareAttachments(projectPath, Array.from(fileList))
      if (!prepared.length) {
        onError('Could not read the selected file(s).')
        return
      }
      const existing = drafts[taskId]?.attachments ?? []
      const picked: PlanStepAttachment[] = prepared
        .filter((att) => !existing.some((e) => e.path === att.path))
        .map((att) => ({ path: att.path, mimeType: att.mimeType }))
      updateDraft(taskId, { attachments: [...existing, ...picked] })
      onError(null)
    } catch (stagingError) {
      onError(
        stagingError instanceof Error
          ? stagingError.message
          : 'Could not attach the selected file(s).',
      )
    } finally {
      setStaging(null)
    }
  }

  return {
    drafts,
    expanded,
    staging,
    fileInputRef,
    stepEdits: toStepEdits(drafts),
    reset,
    toggle,
    updateDraft,
    openFilePicker,
    removeAttachment,
    handleFilesPicked,
  }
}
