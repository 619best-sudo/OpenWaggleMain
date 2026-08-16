import type { PendingUserQuestionRequest } from '@shared/types/user-question'
import { useEffect, useMemo, useState } from 'react'
import type { QuestionAnswerMode, QuestionChoiceMeta } from '../components/QuestionAnswerInput'

function resolveAnswerMode(request: PendingUserQuestionRequest): QuestionAnswerMode {
  if (request.answerMode) return request.answerMode
  return request.options?.length ? 'single-select' : 'text'
}

/**
 * The options a question offers, merged from both channels the harness sends.
 *
 * `options` carries the labels, `choices` carries the same labels with what
 * picking each one means and which one the agent recommends. Merging by label
 * means a label with no trade-off still shows, and a mismatch between the two
 * lists can never drop an option entirely.
 */
function deriveOptions(request: PendingUserQuestionRequest) {
  const choiceByLabel = new Map<string, QuestionChoiceMeta>()
  for (const choice of request.choices ?? []) {
    if (choice.label.trim().length === 0) continue
    choiceByLabel.set(choice.label, {
      ...(choice.description ? { description: choice.description } : {}),
      ...(choice.recommended ? { recommended: true } : {}),
    })
  }
  const labels = request.options?.length
    ? request.options
    : (request.choices ?? []).map((choice) => choice.label)
  const options = labels.filter((option) => option.trim().length > 0)
  return {
    options,
    choiceByLabel,
    recommendedLabel: options.find((option) => choiceByLabel.get(option)?.recommended),
  }
}

/**
 * The answer a user is composing for one question: which mode it renders in,
 * what they have typed or selected, and what that collapses to on submit.
 *
 * Extracted from `UserQuestionCard` so the card is frame, submit and the two
 * attachment slots. The card had already outgrown the function-length and
 * complexity caps with all of this inline, which is what made adding anything
 * else to it a change to an oversized function rather than a small edit.
 */
export function useQuestionAnswer(request: PendingUserQuestionRequest) {
  const mode = resolveAnswerMode(request)
  const { options, choiceByLabel, recommendedLabel } = useMemo(
    () => deriveOptions(request),
    [request],
  )
  const [textValue, setTextValue] = useState('')
  const [selectedValue, setSelectedValue] = useState(recommendedLabel ?? options[0] ?? '')
  const [selectedValues, setSelectedValues] = useState<string[]>([])

  useEffect(() => {
    setTextValue('')
    setSelectedValue(recommendedLabel ?? options[0] ?? '')
    setSelectedValues([])
  }, [options, recommendedLabel])

  /**
   * Collapse the current state into the answer string.
   *
   * In a select mode a TYPED answer wins. If the user went to the trouble of
   * writing something the agent did not offer, that is the answer — submitting
   * the pre-selected radio instead would silently discard it, which is worse
   * than having offered no box at all.
   */
  function compose() {
    const typed = textValue.trim()
    if (mode === 'text' || typed) return typed
    return mode === 'multi-select' ? selectedValues.join(', ') : selectedValue.trim()
  }

  /** Why an empty answer is not acceptable, phrased for the mode on screen. */
  function emptyAnswerMessage() {
    if (mode === 'multi-select') return 'Select at least one option, or type your own answer.'
    if (mode === 'single-select') return 'Select an option, or type your own answer.'
    return 'Enter a response to continue.'
  }

  function toggle(option: string, checked: boolean) {
    setSelectedValues((current) =>
      checked ? [...current, option] : current.filter((value) => value !== option),
    )
  }

  return {
    mode,
    options,
    choiceByLabel,
    textValue,
    selectedValue,
    selectedValues,
    setTextValue,
    setSelectedValue,
    toggle,
    compose,
    emptyAnswerMessage,
  }
}
