import type { PendingUserQuestionRequest } from '@shared/types/user-question'
import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { Checkbox } from '@/shared/ui/Checkbox'
import { TextInput } from '@/shared/ui/TextInput'
import { Textarea } from '@/shared/ui/Textarea'

interface UserQuestionCardProps {
  readonly request: PendingUserQuestionRequest
  readonly onSubmit: (answer: string) => Promise<void>
  readonly busy?: boolean
  readonly className?: string
  readonly title?: string
  readonly helperText?: string
}

function resolveAnswerMode(request: PendingUserQuestionRequest) {
  if (request.answerMode) return request.answerMode
  return request.options?.length ? 'single-select' : 'text'
}

function normalizeTextAnswer(value: string) {
  return value.trim()
}

function normalizeMultiSelectAnswer(values: string[]) {
  return values.join(', ')
}

export function UserQuestionCard({
  request,
  onSubmit,
  busy = false,
  className,
  title = 'Need your input',
  helperText,
}: UserQuestionCardProps) {
  const mode = resolveAnswerMode(request)
  const options = useMemo(() => request.options?.filter((option) => option.trim().length > 0) ?? [], [request.options])
  const [textValue, setTextValue] = useState('')
  const [selectedValue, setSelectedValue] = useState(options[0] ?? '')
  const [selectedValues, setSelectedValues] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submittedAnswer, setSubmittedAnswer] = useState<string | null>(null)

  useEffect(() => {
    setTextValue('')
    setSelectedValue(options[0] ?? '')
    setSelectedValues([])
    setError(null)
    setIsSubmitting(false)
    setSubmittedAnswer(null)
  }, [options, request.question, request.answerMode, request.placeholder])

  async function handleSubmit() {
    const answer =
      mode === 'multi-select'
        ? normalizeMultiSelectAnswer(selectedValues)
        : mode === 'single-select'
          ? selectedValue.trim()
          : normalizeTextAnswer(textValue)

    if (!answer) {
      setError(
        mode === 'multi-select'
          ? 'Select at least one option.'
          : mode === 'single-select'
            ? 'Select an option.'
            : 'Enter a response to continue.',
      )
      return
    }

    setError(null)
    setSubmittedAnswer(answer)
    setIsSubmitting(true)
    try {
      await onSubmit(answer)
    } catch (submitError) {
      setSubmittedAnswer(null)
      setIsSubmitting(false)
      setError(submitError instanceof Error ? submitError.message : 'Failed to submit response.')
    }
  }

  function toggleOption(option: string, checked: boolean) {
    setSelectedValues((current) =>
      checked ? [...current, option] : current.filter((value) => value !== option),
    )
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[18px] bg-bg-primary p-[3px] shadow-sm ring-1 ring-border/40',
        className,
      )}
    >
      <div className="flex flex-col rounded-[15px] bg-bg-secondary/20 px-4 py-3.5 ring-1 ring-inset ring-border/20">
        <div className="text-[14px] font-medium leading-[1.5] text-text-tertiary">{title}</div>
        <div className="mt-1 text-[14px] leading-[1.5] text-text-primary">{request.question}</div>

        {request.reason ? (
          <div className="mt-1.5 text-[14px] leading-[1.5] text-text-secondary">{request.reason}</div>
        ) : null}

        <div className="mt-3.5">
          {mode === 'text' ? (
          options.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {options.map((option) => (
                <button
                  key={option}
                  type="button"
                  disabled={busy || isSubmitting}
                  onClick={() => setTextValue(option)}
                  className="rounded-[10px] border border-border/35 bg-bg-primary/70 px-2.5 py-1.5 text-[14px] leading-[1.5] text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-60"
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null
        ) : null}

        {mode === 'text' ? (
          textValue.includes('\n') || (request.placeholder?.length ?? 0) > 48 ? (
            <Textarea
              value={textValue}
              onChange={(event) => setTextValue(event.target.value)}
              placeholder={request.placeholder ?? 'Type your answer'}
              className="min-h-[88px]"
              resize="vertical"
              disabled={busy || isSubmitting}
            />
          ) : (
            <TextInput
              value={textValue}
              onChange={(event) => setTextValue(event.target.value)}
              placeholder={request.placeholder ?? 'Type your answer'}
              inputSize="md"
              disabled={busy || isSubmitting}
            />
          )
        ) : null}

        {mode === 'single-select' ? (
          <div className="flex flex-col gap-2">
            {options.map((option) => {
              const checked = selectedValue === option
              return (
                <button
                  key={option}
                  type="button"
                  disabled={busy || isSubmitting}
                  onClick={() => setSelectedValue(option)}
                  className={cn(
                    'flex items-center gap-2 rounded-[12px] border px-3 py-2 text-left transition-colors disabled:opacity-60',
                    checked
                      ? 'border-accent/45 bg-accent/8 text-text-primary'
                      : 'border-border/35 bg-bg-primary/65 text-text-secondary hover:bg-bg-hover hover:text-text-primary',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-4 items-center justify-center rounded-full border transition-colors',
                      checked ? 'border-accent bg-accent/15' : 'border-border/50',
                    )}
                  >
                    <span
                      className={cn(
                        'size-1.5 rounded-full transition-opacity',
                        checked ? 'bg-accent opacity-100' : 'opacity-0',
                      )}
                    />
                  </span>
                  <span className="text-[14px] leading-[1.5]">{option}</span>
                </button>
              )
            })}
          </div>
        ) : null}

        {mode === 'multi-select' ? (
          <div className="flex flex-col gap-2 rounded-[12px] border border-border/35 bg-bg-primary/65 p-3">
            {options.map((option) => (
              <Checkbox
                key={option}
                checked={selectedValues.includes(option)}
                onChange={(event) => toggleOption(option, event.target.checked)}
                disabled={busy || isSubmitting}
                label={option}
                labelClassName="text-[14px] leading-[1.5] text-text-primary"
              />
            ))}
          </div>
        ) : null}

        {submittedAnswer ? (
          <div className="mt-3.5 rounded-[12px] bg-bg-primary/50 px-3.5 py-3 ring-1 ring-inset ring-border/40">
            <div className="text-[14px] font-medium leading-[1.5] text-text-tertiary">
              Submitted Answer
            </div>
            <div className="mt-1 text-[14px] leading-[1.5] text-text-primary">{submittedAnswer}</div>
          </div>
        ) : null}
      </div>

      {error ? <div className="mt-2.5 text-[14px] leading-[1.5] text-error">{error}</div> : null}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/30 pt-3">
        <div className="text-[14px] leading-[1.5] text-text-tertiary">
          {submittedAnswer
            ? 'Answer submitted. Resuming the run in this same card.'
            : helperText ?? 'Answer here to resume the run immediately.'}
        </div>
        <Button
          variant="primary"
          size="sm"
          className="h-[32px] rounded-full px-4 text-[14px] font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
          onClick={() => {
            void handleSubmit()
          }}
          disabled={busy || isSubmitting}
        >
          {busy || isSubmitting ? 'Submitting...' : 'Continue'}
        </Button>
      </div>
    </div>
  </div>
)
}
