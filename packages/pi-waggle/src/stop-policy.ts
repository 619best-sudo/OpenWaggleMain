import type { AgentEndEvent } from '@mariozechner/pi-coding-agent'
import type { WaggleConfig, WaggleConsensusCheckResult } from '@openwaggle/waggle-core'
import {
  checkConsensus,
  decideNextWaggleTurn,
  getWaggleTurn,
  validateWaggleTurnOutput,
} from '@openwaggle/waggle-core'

const MAX_PREVIEWED_TOOL_NAMES = 3
const MAX_RECOVERABLE_ERROR_TURNS = 2
const QA_REQUIRED_SECTIONS = [
  'loop_verdict',
  'failure_categories',
  'top_blockers',
  'evidence_reviewed',
  'screenshots',
  'logs',
  'exact_next_cycle',
] as const
const RUNTIME_EVIDENCE_KEYWORDS =
  /\b(browser|playwright|devtools|command|build|dev server|console|log|screenshot|page|open|opened|click|clicked|loaded|rendered|pnpm|npm)\b/i
const CODE_MUTATION_TOOL_NAME_PATTERN =
  /\b(write|apply[_-]?patch|edit|replace|delete|create[_-]?file|move[_-]?file|rename)\b/i
const QA_IMPLEMENTATION_INTENT_PATTERN =
  /\b(?:i|we)\s+(?:need to|will|am going to|must)\s+(?:create|implement|add|write|edit|modify|fix|patch)\b.*(?:\.js|\.ts|\.tsx|\.jsx|\.html|\.css|file|component|server|button)\b|\blet'?s\s+(?:create|implement|add|write|edit|modify|fix|patch)\b.*(?:\.js|\.ts|\.tsx|\.jsx|\.html|\.css|file|component|server|button)\b/i

type PiAssistantMessage = Extract<AgentEndEvent['messages'][number], { readonly role: 'assistant' }>
type PiToolResultMessage = Extract<
  AgentEndEvent['messages'][number],
  { readonly role: 'toolResult' }
>

interface UnresolvedToolCall {
  readonly id: string
  readonly name: string
}

export interface PiWaggleTurnSummary {
  readonly responseText: string
  readonly hasToolCalls: boolean
  readonly toolCallNames: readonly string[]
  readonly unresolvedToolCalls: readonly UnresolvedToolCall[]
  readonly aborted: boolean
  readonly terminalError?: string
}

export interface PiWaggleStopPolicyState {
  readonly consecutiveErrorTurns: number
  readonly successfulTurnCount: number
  readonly lastAssistantTexts: readonly [string, string]
}

export interface PiWaggleStopPolicyDecision {
  readonly continue: boolean
  readonly state: PiWaggleStopPolicyState
  readonly turnSucceeded: boolean
  readonly consensus?: WaggleConsensusCheckResult
  readonly stop?: {
    readonly classification: 'complete' | 'stopped'
    readonly reason: string
  }
}

function isAssistantMessage(
  message: AgentEndEvent['messages'][number],
): message is PiAssistantMessage {
  return message.role === 'assistant'
}

function isToolResultMessage(
  message: AgentEndEvent['messages'][number],
): message is PiToolResultMessage {
  return message.role === 'toolResult'
}

function assistantText(message: PiAssistantMessage) {
  const parts = message.content.flatMap((part) => (part.type === 'text' ? [part.text] : []))
  return parts.join('\n').trim()
}

function summarizeToolNames(unresolvedToolCalls: readonly UnresolvedToolCall[]) {
  const unresolvedToolNames = unresolvedToolCalls
    .slice(0, MAX_PREVIEWED_TOOL_NAMES)
    .map((toolCall) => toolCall.name)
    .join(', ')
  const moreToolsCount = unresolvedToolCalls.length - MAX_PREVIEWED_TOOL_NAMES
  return moreToolsCount > 0
    ? `${unresolvedToolNames} (+${String(moreToolsCount)} more)`
    : unresolvedToolNames
}

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

function readSectionValue(text: string, section: string) {
  const pattern = new RegExp(
    `(?:^|\\n)\\s*(?:[-*]\\s*)?(?:\\*\\*)?${sectionLabelPattern(section)}(?:\\*\\*)?\\s*:\\s*(.*)$`,
    'im',
  )
  const match = pattern.exec(text)
  return match?.[1]?.trim() ?? null
}

function isNoneValue(value: string | null) {
  if (!value) {
    return true
  }
  return /^(?:none|n\/a|na|null)$/i.test(value.trim())
}

function isQaRuntimeContract(config: WaggleConfig, turnNumber: number) {
  const requiredSections = getWaggleTurn(config, turnNumber).agent.outputContract?.requiredSections ?? []
  return QA_REQUIRED_SECTIONS.every((section) => requiredSections.includes(section))
}

function validateQaRuntimeTurn(
  responseText: string,
  toolCallNames: readonly string[],
): string | null {
  const loopVerdict = readSectionValue(responseText, 'loop_verdict')
  const failureCategories = readSectionValue(responseText, 'failure_categories')
  const evidenceReviewed = readSectionValue(responseText, 'evidence_reviewed')
  const screenshots = readSectionValue(responseText, 'screenshots')
  const logs = readSectionValue(responseText, 'logs')

  if (toolCallNames.some((name) => CODE_MUTATION_TOOL_NAME_PATTERN.test(name))) {
    return 'QA turn must not use code-mutation tools; route implementation fixes back to builders.'
  }

  if (QA_IMPLEMENTATION_INTENT_PATTERN.test(responseText)) {
    return 'QA turn must not present file creation or implementation steps as QA work.'
  }

  if (isNoneValue(evidenceReviewed)) {
    return 'QA turn must include real evidence_reviewed details instead of "none".'
  }

  const normalizedVerdict = loopVerdict?.trim().toLocaleLowerCase() ?? ''
  const approved = normalizedVerdict === 'approved'

  if (!approved && isNoneValue(failureCategories)) {
    return 'QA turn cannot use failure_categories: none when the loop verdict is not approved.'
  }

  if (approved) {
    if (isNoneValue(screenshots) && isNoneValue(logs)) {
      return 'Approved QA turns must include at least one screenshot or log artifact.'
    }

    if (!RUNTIME_EVIDENCE_KEYWORDS.test(evidenceReviewed ?? '')) {
      return 'Approved QA turns must describe concrete runtime evidence such as browser actions, commands, screenshots, or logs.'
    }
  }

  return null
}

function unresolvedToolCalls(messages: readonly AgentEndEvent['messages'][number][]) {
  const unresolvedById = new Map<string, { readonly name: string }>()

  for (const message of messages) {
    if (!isAssistantMessage(message)) {
      continue
    }

    for (const part of message.content) {
      if (part.type === 'toolCall') {
        unresolvedById.set(part.id, { name: part.name })
      }
    }
  }

  for (const message of messages) {
    if (!isToolResultMessage(message)) {
      continue
    }
    unresolvedById.delete(message.toolCallId)
  }

  return [...unresolvedById.entries()].map(([id, data]) => ({ id, ...data }))
}

function allToolCallNames(messages: readonly AgentEndEvent['messages'][number][]) {
  const names: string[] = []

  for (const message of messages) {
    if (!isAssistantMessage(message)) {
      continue
    }

    for (const part of message.content) {
      if (part.type === 'toolCall') {
        names.push(part.name)
      }
    }
  }

  return names
}

function assistantTurnWasAborted(assistantMessages: readonly PiAssistantMessage[]) {
  return assistantMessages.some((message) => message.stopReason === 'aborted')
}

function terminalErrorMessage(assistantMessages: readonly PiAssistantMessage[]) {
  for (let index = assistantMessages.length - 1; index >= 0; index -= 1) {
    const message = assistantMessages[index]
    if (!message) {
      continue
    }

    if (message.stopReason === 'error') {
      return message.errorMessage ?? 'Pi assistant run ended with error.'
    }
  }
  return undefined
}

export function createPiWaggleStopPolicyState(): PiWaggleStopPolicyState {
  return {
    consecutiveErrorTurns: 0,
    successfulTurnCount: 0,
    lastAssistantTexts: ['', ''],
  }
}

export function summarizePiWaggleTurnMessages(
  messages: readonly AgentEndEvent['messages'][number][],
): PiWaggleTurnSummary {
  const assistantMessages = messages.filter(isAssistantMessage)
  const responseText = assistantMessages.map(assistantText).join('\n\n').trim()
  const hasToolCalls = assistantMessages.some((message) =>
    message.content.some((part) => part.type === 'toolCall'),
  )

  const unresolved = unresolvedToolCalls(messages)
  const terminalError = terminalErrorMessage(assistantMessages)

  return {
    responseText,
    hasToolCalls,
    toolCallNames: allToolCallNames(messages),
    unresolvedToolCalls: unresolved,
    aborted: assistantTurnWasAborted(assistantMessages),
    ...(terminalError ? { terminalError } : {}),
  }
}

function recoverableErrorDecision(
  state: PiWaggleStopPolicyState,
  reason: string,
): PiWaggleStopPolicyDecision {
  const nextConsecutiveErrorTurns = state.consecutiveErrorTurns + 1
  const nextState: PiWaggleStopPolicyState = {
    ...state,
    consecutiveErrorTurns: nextConsecutiveErrorTurns,
  }

  if (nextConsecutiveErrorTurns >= MAX_RECOVERABLE_ERROR_TURNS) {
    return {
      continue: false,
      state: nextState,
      turnSucceeded: false,
      stop: { classification: 'stopped', reason },
    }
  }

  return {
    continue: true,
    state: nextState,
    turnSucceeded: false,
  }
}

export function evaluatePiWaggleStopPolicy(input: {
  readonly config: WaggleConfig
  readonly turnNumber: number
  readonly summary: PiWaggleTurnSummary
  readonly state: PiWaggleStopPolicyState
  readonly agentLabel: string
}): PiWaggleStopPolicyDecision {
  if (input.summary.aborted) {
    return {
      continue: false,
      state: input.state,
      turnSucceeded: false,
      stop: {
        classification: 'stopped',
        reason: 'Waggle stopped because the assistant turn was aborted.',
      },
    }
  }

  if (input.summary.terminalError) {
    return recoverableErrorDecision(input.state, input.summary.terminalError)
  }

  if (input.summary.unresolvedToolCalls.length > 0) {
    const tools = summarizeToolNames(input.summary.unresolvedToolCalls)
    return {
      continue: false,
      state: input.state,
      turnSucceeded: false,
      stop: {
        classification: 'stopped',
        reason: `Waggle stopped because ${input.agentLabel} has unresolved tool calls (${tools}).`,
      },
    }
  }

  if (input.summary.responseText.length === 0 && !input.summary.hasToolCalls) {
    return recoverableErrorDecision(input.state, 'Agent turn produced no useful output.')
  }

  const outputValidation = validateWaggleTurnOutput({
    config: input.config,
    turnNumber: input.turnNumber,
    responseText: input.summary.responseText,
  })
  if (!outputValidation.valid) {
    return recoverableErrorDecision(
      input.state,
      `Agent turn is missing required output contract sections: ${outputValidation.missingSections.join(', ')}.`,
    )
  }

  if (isQaRuntimeContract(input.config, input.turnNumber)) {
    const qaValidationError = validateQaRuntimeTurn(
      input.summary.responseText,
      input.summary.toolCallNames,
    )
    if (qaValidationError) {
      return recoverableErrorDecision(input.state, qaValidationError)
    }
  }

  const nextState: PiWaggleStopPolicyState = {
    consecutiveErrorTurns: 0,
    successfulTurnCount: input.state.successfulTurnCount + 1,
    lastAssistantTexts: [input.state.lastAssistantTexts[1], input.summary.responseText],
  }

  if (input.config.stop.primary === 'consensus') {
    const consensus = checkConsensus(
      nextState.lastAssistantTexts,
      input.turnNumber + 1,
      input.config.stop.maxTurnsSafety,
    )
    if (consensus.reached) {
      return {
        continue: false,
        state: nextState,
        turnSucceeded: true,
        consensus,
        stop: {
          classification: 'complete',
          reason: `Consensus reached: ${consensus.reason}`,
        },
      }
    }
  }

  const turnDecision = decideNextWaggleTurn(input.config, { turnNumber: input.turnNumber })
  if (!turnDecision.continue) {
    return {
      continue: false,
      state: nextState,
      turnSucceeded: true,
      stop: {
        classification: 'complete',
        reason: `Reached maximum turns (${String(nextState.successfulTurnCount)})`,
      },
    }
  }

  return {
    continue: true,
    state: nextState,
    turnSucceeded: true,
  }
}
