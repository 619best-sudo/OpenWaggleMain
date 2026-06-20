import type { WaggleConfig } from './config'
import { getWaggleTurn } from './turn-policy'

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function sectionLabelPattern(section: string) {
  const words = section
    .trim()
    .toLocaleLowerCase()
    .split(/[\s_-]+/)
    .filter((word) => word.length > 0)

  if (words.length === 0) {
    return escapeRegExp(section.trim().toLocaleLowerCase())
  }

  return words.map((word) => escapeRegExp(word)).join('[\\s_-]+')
}

function hasSectionLabel(text: string, section: string) {
  const pattern = new RegExp(
    `(?:^|\\n)\\s*(?:[-*]\\s*)?(?:\\*\\*)?${sectionLabelPattern(section)}(?:\\*\\*)?\\s*:`,
    'i',
  )
  return pattern.test(text)
}

export interface WaggleTurnOutputValidationResult {
  readonly valid: boolean
  readonly missingSections: readonly string[]
}

export function validateWaggleTurnOutput(input: {
  readonly config: WaggleConfig
  readonly turnNumber: number
  readonly responseText: string
}): WaggleTurnOutputValidationResult {
  const turn = getWaggleTurn(input.config, input.turnNumber)
  const requiredSections = turn.agent.outputContract?.requiredSections ?? []
  if (requiredSections.length === 0) {
    return { valid: true, missingSections: [] }
  }

  const normalizedText = input.responseText.trim()
  if (!normalizedText) {
    return { valid: false, missingSections: requiredSections }
  }

  const missingSections = requiredSections.filter((section) => !hasSectionLabel(normalizedText, section))
  return { valid: missingSections.length === 0, missingSections }
}
