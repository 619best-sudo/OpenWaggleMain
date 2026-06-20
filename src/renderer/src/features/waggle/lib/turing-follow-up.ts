import type { UIMessage } from '@shared/types/chat-ui'
import type { WaggleConfig, WaggleCollaborationStatus, WagglePreset } from '@shared/types/waggle'

export interface TuringFollowUpSuggestion {
  readonly nextWaggle: string
  readonly examplePrompt: string
  readonly fallbackWaggle: string | null
}

function normalizePresetCandidate(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[`"'()]/g, ' ')
    .replace(/\bfallback\b/g, ' ')
    .replace(/\brequires?\b[\s\S]*$/i, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function presetSearchKeys(preset: Pick<WagglePreset, 'id' | 'name'>) {
  return [String(preset.id), preset.name]
    .map(normalizePresetCandidate)
    .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index)
}

const TURING_AGENT_LABELS = ['Context Reader', 'Installed Waggle Selector'] as const

function matchesField(line: string, label: string) {
  const match = line.match(new RegExp(`^-?\\s*${label}\\s*:\\s*(.+)$`, 'i'))
  return match?.[1]?.trim() ?? null
}

function getMessageText(message: UIMessage) {
  return message.parts
    .filter((part): part is Extract<UIMessage['parts'][number], { type: 'text' }> => part.type === 'text')
    .map((part) => part.content)
    .join('\n')
    .trim()
}

export function isTuringConfig(config: WaggleConfig | null) {
  if (!config || config.agents.length !== TURING_AGENT_LABELS.length) {
    return false
  }

  return TURING_AGENT_LABELS.every((label, index) => config.agents[index]?.label === label)
}

export function parseTuringFollowUpSuggestion(text: string): TuringFollowUpSuggestion | null {
  const lines = text.split(/\r?\n/)
  let nextWaggle: string | null = null
  let examplePrompt: string | null = null
  let fallbackWaggle: string | null = null

  for (const line of lines) {
    nextWaggle ||= matchesField(line, 'selected next waggle')
    examplePrompt ||= matchesField(line, 'example next prompt')
    fallbackWaggle ||= matchesField(line, 'fallback waggle(?: if needed)?')
  }

  if (!nextWaggle || !examplePrompt) {
    return null
  }

  return {
    nextWaggle,
    examplePrompt,
    fallbackWaggle,
  }
}

export function findWagglePresetForTuringSuggestion(
  presets: readonly WagglePreset[],
  suggestion: TuringFollowUpSuggestion,
): WagglePreset | null {
  const candidateTexts = [suggestion.nextWaggle, suggestion.fallbackWaggle]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(normalizePresetCandidate)

  for (const candidate of candidateTexts) {
    const exactMatch =
      presets.find((preset) => presetSearchKeys(preset).some((key) => key === candidate)) ?? null
    if (exactMatch) {
      return exactMatch
    }

    let bestMatch: WagglePreset | null = null
    let bestIndex = Number.POSITIVE_INFINITY
    let bestKeyLength = -1

    for (const preset of presets) {
      for (const key of presetSearchKeys(preset)) {
        const candidateIndex = candidate.indexOf(key)
        if (candidateIndex >= 0) {
          if (candidateIndex < bestIndex || (candidateIndex === bestIndex && key.length > bestKeyLength)) {
            bestMatch = preset
            bestIndex = candidateIndex
            bestKeyLength = key.length
          }
          continue
        }

        if (key.includes(candidate) && candidate.length > bestKeyLength) {
          bestMatch = preset
          bestIndex = 0
          bestKeyLength = candidate.length
        }
      }
    }

    if (bestMatch) {
      return bestMatch
    }
  }

  return null
}

export function getTuringFollowUpSuggestion(input: {
  readonly messages: readonly UIMessage[]
  readonly waggleStatus: WaggleCollaborationStatus
  readonly config: WaggleConfig | null
}): TuringFollowUpSuggestion | null {
  if (input.waggleStatus !== 'completed' || !isTuringConfig(input.config)) {
    return null
  }

  for (let index = input.messages.length - 1; index >= 0; index -= 1) {
    const message = input.messages[index]
    if (!message || message.role !== 'assistant') {
      continue
    }

    const suggestion = parseTuringFollowUpSuggestion(getMessageText(message))
    if (suggestion) {
      return suggestion
    }
  }

  return null
}
