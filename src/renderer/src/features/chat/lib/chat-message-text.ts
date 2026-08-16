import type { UIMessage } from '@shared/types/chat-ui'

/** Extract the concatenated text content from a UIMessage's text parts. */
export function getUIMessageText(message: UIMessage) {
  return message.parts
    .filter(
      (part): part is Extract<(typeof message.parts)[number], { type: 'text' }> =>
        part.type === 'text',
    )
    .map((part) => part.content)
    .join('\n\n')
}

/**
 * Identity-memoized {@link getUIMessageText}.
 *
 * Transcript resolution and row building re-walk every message on every stream
 * event (the `messages` array gets a fresh reference each token), and call this
 * helper several times per message — filter checks, hidden-prompt detection,
 * machine-request reordering, row summaries. That's O(total transcript text) of
 * string work per token, growing with session length.
 *
 * During streaming the messages array is prefix-stable: every message except the
 * one currently being typed keeps its object identity across events, so keying on
 * the message itself returns the cached text and only the active message pays for
 * a re-extraction. `UIMessage` objects are treated immutably (the stream reducer
 * always allocates a new object on change), so the cache never goes stale.
 */
const messageTextCache = new WeakMap<UIMessage, string>()

export function getUIMessageTextCached(message: UIMessage): string {
  const cached = messageTextCache.get(message)
  if (cached !== undefined) {
    return cached
  }
  const text = getUIMessageText(message)
  messageTextCache.set(message, text)
  return text
}

export function isInternalTeamOrchestrationPromptText(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return false
  }

  return (
    (/^Continue the .+ task as .+/i.test(normalized) &&
      normalized.includes(
        'Use the latest chat transcript as context and continue from the current state.',
      ) &&
      normalized.includes('End with these exact sections:')) ||
    (/^Review the latest chat transcript, verify the website if possible, and decide whether the task is complete\./i.test(
      normalized,
    ) &&
      normalized.includes(
        'Use Playwright whenever the app can run, then end with these exact sections:',
      ))
  )
}

export function isInternalMachinePlannerPromptText(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return false
  }

  return (
    normalized.startsWith('Machine mode is enabled.') &&
    normalized.includes('You are the planning agent for a sequential coding workflow.') &&
    normalized.includes('Return exactly one JSON object and no prose.') &&
    normalized.includes('User request:')
  )
}

export function isInternalToolHandoffAssistantText(text: string) {
  const normalized = text.trim()
  if (!normalized.startsWith('[TOOL_HANDOFF]')) {
    return false
  }

  const payloadText = normalized.slice('[TOOL_HANDOFF]'.length).trim()
  if (!payloadText.startsWith('{')) {
    return false
  }

  try {
    const parsed = JSON.parse(payloadText)
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      'type' in parsed &&
      parsed.type === 'tool_handoff'
    )
  } catch {
    return false
  }
}

export function getNonEmptyUserMessageText(message: UIMessage) {
  if (message.role !== 'user') {
    return null
  }

  const text = getUIMessageText(message)
  return text || null
}

export function countUserMessagesByText(messages: readonly UIMessage[]) {
  const countsByText = new Map<string, number>()
  for (const message of messages) {
    const text = getNonEmptyUserMessageText(message)
    if (!text) {
      continue
    }
    countsByText.set(text, (countsByText.get(text) ?? 0) + 1)
  }
  return countsByText
}

export function consumeUserMessageTextCount(countsByText: Map<string, number>, text: string) {
  const count = countsByText.get(text) ?? 0
  if (count === 0) {
    return false
  }
  countsByText.set(text, count - 1)
  return true
}
