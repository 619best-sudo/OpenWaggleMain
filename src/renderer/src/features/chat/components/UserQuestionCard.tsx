import type {
  PendingUserQuestionRequest,
  UserQuestionAttachment,
} from '@shared/types/user-question'
import { useEffect, useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { useQuestionAnswer } from '../hooks/use-question-answer'
import { useQuestionAttachments } from '../hooks/use-question-attachments'
import { QuestionAnswerInput } from './QuestionAnswerInput'
import { AttachmentFileInput, AttachmentPicker, ShownAttachments } from './QuestionAttachments'
import { QuestionCardFooter, SubmittedAnswer } from './QuestionCardFooter'

interface UserQuestionCardProps {
  readonly request: PendingUserQuestionRequest
  readonly onSubmit: (
    answer: string,
    attachments: readonly UserQuestionAttachment[],
  ) => Promise<void>
  readonly busy?: boolean
  readonly className?: string
  readonly title?: string
  readonly helperText?: string
  /** Project root, required to stage attachments into the project's store. */
  readonly projectPath?: string | null
}

interface ValidateSubmissionInput {
  readonly request: PendingUserQuestionRequest
  readonly text: string
  readonly attachmentCount: number
  readonly emptyAnswerMessage: string
}

/** Why this submission cannot go through yet, or null. */
function validateSubmission({
  request,
  text,
  attachmentCount,
  emptyAnswerMessage,
}: ValidateSubmissionInput) {
  const wanted = request.requestAttachments
  if (wanted?.mode === 'required' && attachmentCount === 0) {
    return wanted.hint
      ? `Attach ${wanted.hint} to continue.`
      : 'Attach the file this question needs to continue.'
  }
  // With files attached, empty text is fine — the files ARE the answer.
  if (text || attachmentCount > 0) return null
  return emptyAnswerMessage
}

/** The question's own settings merged with what the user has entered so far. */
function buildAnswerState(
  request: PendingUserQuestionRequest,
  answer: ReturnType<typeof useQuestionAnswer>,
  disabled: boolean,
) {
  return {
    mode: answer.mode,
    options: answer.options,
    choiceByLabel: answer.choiceByLabel,
    ...(request.placeholder ? { placeholder: request.placeholder } : {}),
    allowFreeText: request.allowFreeText !== false,
    textValue: answer.textValue,
    selectedValue: answer.selectedValue,
    selectedValues: answer.selectedValues,
    disabled,
  }
}

export function UserQuestionCard({
  request,
  onSubmit,
  busy = false,
  className,
  title = 'Need your input',
  helperText,
  projectPath,
}: UserQuestionCardProps) {
  const answer = useQuestionAnswer(request)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<{
    answer: string
    attachments: readonly UserQuestionAttachment[]
  } | null>(null)
  const files = useQuestionAttachments({ projectPath, onError: setError })
  const { reset: resetFiles } = files

  useEffect(() => {
    setError(null)
    setIsSubmitting(false)
    setSubmitted(null)
    resetFiles()
  }, [request.question, resetFiles])

  async function handleSubmit() {
    const text = answer.compose()
    const invalid = validateSubmission({
      request,
      text,
      attachmentCount: files.attachments.length,
      emptyAnswerMessage: answer.emptyAnswerMessage(),
    })
    if (invalid) {
      setError(invalid)
      return
    }
    const attachments = [...files.attachments]
    setError(null)
    setSubmitted({ answer: text, attachments })
    setIsSubmitting(true)
    try {
      await onSubmit(text, attachments)
    } catch (submitError) {
      setSubmitted(null)
      setIsSubmitting(false)
      setError(submitError instanceof Error ? submitError.message : 'Failed to submit response.')
    }
  }

  const disabled = busy || isSubmitting
  const answerState = buildAnswerState(request, answer, disabled)
  const answerActions = {
    onTextChange: answer.setTextValue,
    onSelect: answer.setSelectedValue,
    onToggle: answer.toggle,
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[16px] border border-prompt-border bg-prompt-bg',
        // A prompt BLOCKS the run: it is not one more card in the transcript,
        // so it takes its own tinted ground and a saturated left edge rather
        // than the neutral surface every other block shares.
        'border-l-[3px] border-l-prompt-accent',
        className,
      )}
    >
      <div className="flex flex-col px-4 py-3.5">
        <div className="text-[12px] font-semibold uppercase tracking-[0.06em] leading-[1.5] text-prompt-heading">
          {title}
        </div>
        <div className="mt-1 text-[13px] leading-[1.5] text-text-primary">{request.question}</div>

        {request.reason ? (
          <div className="mt-1.5 text-[13px] leading-[1.5] text-text-secondary">
            {request.reason}
          </div>
        ) : null}

        <ShownAttachments attachments={request.attachments ?? []} />

        {submitted ? (
          <SubmittedAnswer answer={submitted.answer} attachments={submitted.attachments} />
        ) : (
          <>
            <div className="mt-3.5">
              <QuestionAnswerInput state={answerState} actions={answerActions} />

              {request.requestAttachments ? (
                <AttachmentPicker
                  request={request.requestAttachments}
                  attachments={files.attachments}
                  staging={files.staging}
                  disabled={disabled}
                  projectPath={projectPath}
                  onOpenPicker={files.openFilePicker}
                  onRemove={files.removeAttachment}
                />
              ) : null}
            </div>

            {error ? (
              <div className="mt-2.5 text-[13px] leading-[1.5] text-error">{error}</div>
            ) : null}

            <QuestionCardFooter
              disabled={disabled}
              {...(helperText ? { helperText } : {})}
              onSubmit={() => {
                void handleSubmit()
              }}
            />
          </>
        )}
      </div>

      {request.requestAttachments && !submitted ? (
        <AttachmentFileInput
          request={request.requestAttachments}
          inputRef={files.fileInputRef}
          onFilesPicked={(picked) => {
            void files.handleFilesPicked(picked)
          }}
        />
      ) : null}
    </div>
  )
}
