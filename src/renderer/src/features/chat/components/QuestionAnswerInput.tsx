import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { Checkbox } from '@/shared/ui/Checkbox'
import { TextInput } from '@/shared/ui/TextInput'
import { Textarea } from '@/shared/ui/Textarea'

/** What a label means and whether the agent recommends it. */
export interface QuestionChoiceMeta {
  readonly description?: string
  readonly recommended?: boolean
}

export type QuestionAnswerMode = 'text' | 'single-select' | 'multi-select'

/**
 * A placeholder longer than this reads as a sentence rather than a hint, which
 * is the signal that the expected answer is prose — so the box becomes a
 * textarea rather than a single line.
 */
const LONG_PLACEHOLDER_CHARS = 48

interface QuestionAnswerInputState {
  readonly mode: QuestionAnswerMode
  readonly options: readonly string[]
  readonly choiceByLabel: ReadonlyMap<string, QuestionChoiceMeta>
  readonly placeholder?: string
  readonly allowFreeText: boolean
  readonly textValue: string
  readonly selectedValue: string
  readonly selectedValues: readonly string[]
  readonly disabled: boolean
}

interface QuestionAnswerInputActions {
  readonly onTextChange: (value: string) => void
  readonly onSelect: (option: string) => void
  readonly onToggle: (option: string, checked: boolean) => void
}

interface QuestionAnswerInputProps {
  readonly state: QuestionAnswerInputState
  readonly actions: QuestionAnswerInputActions
}

function SuggestionChips({ state, actions }: QuestionAnswerInputProps) {
  if (state.options.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {state.options.map((option) => (
        <Button
          key={option}
          type="button"
          variant="unstyled"
          disabled={state.disabled}
          onClick={() => actions.onTextChange(option)}
          className="rounded-[10px] border border-border/35 bg-bg-primary/70 px-2.5 py-1.5 text-[14px] leading-[1.5] text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-60"
        >
          {option}
        </Button>
      ))}
    </div>
  )
}

function TextAnswer({ state, actions }: QuestionAnswerInputProps) {
  const placeholder = state.placeholder ?? 'Type your answer'
  const wantsTextarea =
    state.textValue.includes('\n') || (state.placeholder?.length ?? 0) > LONG_PLACEHOLDER_CHARS
  if (wantsTextarea) {
    return (
      <Textarea
        value={state.textValue}
        onChange={(event) => actions.onTextChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-[88px]"
        resize="vertical"
        disabled={state.disabled}
      />
    )
  }
  return (
    <TextInput
      value={state.textValue}
      onChange={(event) => actions.onTextChange(event.target.value)}
      placeholder={placeholder}
      inputSize="md"
      disabled={state.disabled}
    />
  )
}

function SingleSelect({ state, actions }: QuestionAnswerInputProps) {
  return (
    <div className="flex flex-col gap-2">
      {state.options.map((option) => {
        const checked = state.selectedValue === option
        const meta = state.choiceByLabel.get(option)
        return (
          <Button
            key={option}
            type="button"
            variant="unstyled"
            disabled={state.disabled}
            onClick={() => actions.onSelect(option)}
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
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-1.5 text-[14px] leading-[1.5]">
                {option}
                {meta?.recommended ? (
                  <span className="rounded-full border border-accent/40 bg-accent/10 px-1.5 py-px text-[11px] leading-[1.4] text-accent">
                    Recommended
                  </span>
                ) : null}
              </span>
              {meta?.description ? (
                <span className="text-[13px] leading-[1.45] text-text-secondary">
                  {meta.description}
                </span>
              ) : null}
            </span>
          </Button>
        )
      })}
    </div>
  )
}

function MultiSelect({ state, actions }: QuestionAnswerInputProps) {
  return (
    <div className="flex flex-col gap-2 rounded-[12px] border border-border/35 bg-bg-primary/65 p-3">
      {state.options.map((option) => {
        const meta = state.choiceByLabel.get(option)
        return (
          <div key={option} className="flex flex-col gap-0.5">
            <Checkbox
              checked={state.selectedValues.includes(option)}
              onChange={(event) => actions.onToggle(option, event.target.checked)}
              disabled={state.disabled}
              label={meta?.recommended ? `${option} · Recommended` : option}
              labelClassName="text-[14px] leading-[1.5] text-text-primary"
            />
            {meta?.description ? (
              <span className="pl-6 text-[13px] leading-[1.45] text-text-secondary">
                {meta.description}
              </span>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

/**
 * The answer controls for a user question: the picker or box the mode calls for,
 * plus the free-text escape hatch that always sits alongside a picker.
 *
 * Split out of `UserQuestionCard` so the card is frame, state and submit. The
 * card had grown past the function-length and complexity caps with all three
 * modes inline, which is also what made adding anything to it (attachments) a
 * change to an already-oversized function.
 */
export function QuestionAnswerInput({ state, actions }: QuestionAnswerInputProps) {
  const props = { state, actions }
  return (
    <>
      {state.mode === 'text' ? (
        <div className="flex flex-col gap-2">
          <SuggestionChips {...props} />
          <TextAnswer {...props} />
        </div>
      ) : null}

      {state.mode === 'single-select' ? <SingleSelect {...props} /> : null}
      {state.mode === 'multi-select' ? <MultiSelect {...props} /> : null}

      {state.mode !== 'text' && state.allowFreeText ? (
        <div className="mt-3 flex flex-col gap-1.5">
          <div className="text-[13px] leading-[1.45] text-text-tertiary">
            None of these? Answer in your own words — it overrides the selection above.
          </div>
          <TextInput
            value={state.textValue}
            onChange={(event) => actions.onTextChange(event.target.value)}
            placeholder={state.placeholder ?? 'Type a different answer'}
            inputSize="md"
            disabled={state.disabled}
          />
        </div>
      ) : null}
    </>
  )
}
