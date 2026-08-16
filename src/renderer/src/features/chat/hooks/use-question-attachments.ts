import type { UserQuestionAttachment } from '@shared/types/user-question'
import { useCallback, useRef, useState } from 'react'

interface UseQuestionAttachmentsInput {
  /**
   * Project root the picked files are staged into. Absent ⇒ attaching fails with
   * a message, because there is nowhere to put the files.
   */
  readonly projectPath?: string | null
  /** Surfaced to the user by the card, which owns the single error slot. */
  readonly onError: (message: string | null) => void
}

/**
 * The files a user attaches to an `ask_user_question` answer.
 *
 * Kept out of the card for the same reason `usePlanStepDrafts` is: the card is
 * layout plus submit, and this owns the picked list, the hidden file input, and
 * the staging round trip.
 *
 * Staging goes through `window.api.prepareAttachments` — the same call the
 * composer and the plan-review card use. It copies the picked files into the
 * project's attachment store and returns stable on-disk paths, which is what the
 * agent actually reads. Handing over a raw drag-and-drop path would give the
 * agent a temp file that can be gone by the time it opens it.
 */
export function useQuestionAttachments({ projectPath, onError }: UseQuestionAttachmentsInput) {
  const [attachments, setAttachments] = useState<UserQuestionAttachment[]>([])
  const [staging, setStaging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  /**
   * Stable identity, and a no-op once already empty. Both halves matter: the
   * card resets on `useEffect(..., [request.question, resetFiles])`, so a fresh
   * `reset` identity per render re-runs that effect on every render, and a bare
   * `setAttachments([])` commits a brand-new array that can never compare equal
   * — together they spun the card in an endless render loop (measured at ~17k
   * renders in a 250ms window), which starved timers and pinned a core for as
   * long as a question card was on screen.
   */
  const reset = useCallback(() => {
    setAttachments((current) => (current.length === 0 ? current : []))
    setStaging(false)
  }, [])

  function openFilePicker() {
    fileInputRef.current?.click()
  }

  function removeAttachment(filePath: string) {
    setAttachments((current) => current.filter((att) => att.path !== filePath))
  }

  async function handleFilesPicked(fileList: FileList | null) {
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (!fileList?.length) return
    if (!projectPath) {
      onError('Open a project before attaching files.')
      return
    }

    setStaging(true)
    try {
      const prepared = await window.api.prepareAttachments(projectPath, Array.from(fileList))
      if (!prepared.length) {
        onError('Could not read the selected file(s).')
        return
      }
      setAttachments((current) => [
        ...current,
        ...prepared
          .filter((att) => !current.some((existing) => existing.path === att.path))
          .map((att) => ({ path: att.path, mimeType: att.mimeType })),
      ])
      onError(null)
    } catch (stagingError) {
      onError(
        stagingError instanceof Error
          ? stagingError.message
          : 'Could not attach the selected file(s).',
      )
    } finally {
      setStaging(false)
    }
  }

  return {
    attachments,
    staging,
    fileInputRef,
    reset,
    openFilePicker,
    removeAttachment,
    handleFilesPicked,
  }
}
