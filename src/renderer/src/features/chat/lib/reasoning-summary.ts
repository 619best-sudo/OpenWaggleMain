import type { UIMessage } from '@shared/types/chat-ui'
import { parseToolArgs } from './tool-args'
import { resolveActionText } from './tool-display'

const MAX_SUMMARIES = 3
const MAX_SUMMARY_LENGTH = 88
const CURATED_TOOL_HEADINGS = {
  bash: [
    'Running terminal command',
    'Executing script',
    'Running shell command',
    'Executing system task',
  ],
  read: [
    'Reading file contents',
    'Inspecting source code',
    'Loading file context',
    'Reading implementation details',
  ],
  edit: [
    'Applying code modifications',
    'Editing source file',
    'Updating file contents',
    'Modifying implementation',
  ],
  write: [
    'Writing new file',
    'Creating source file',
    'Generating code file',
    'Writing implementation',
  ],
  grep: [
    'Searching file contents',
    'Running regex search',
    'Searching codebase',
    'Finding text matches',
  ],
  find: [
    'Finding files by name',
    'Searching file paths',
    'Locating matching files',
    'Scanning directory tree',
  ],
  ls: [
    'Listing directory contents',
    'Reading directory structure',
    'Inspecting folder contents',
    'Checking directory items',
  ],
} as const

export interface ReasoningSummary {
  readonly id: string
  readonly text: string
  readonly isRunning: boolean
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function truncateOneLine(value: string, maxLength = MAX_SUMMARY_LENGTH) {
  if (value.length <= maxLength) {
    return value
  }
  return `${value.slice(0, maxLength - 1).trimEnd()}...`
}

function normalizeSummaryKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[`"'.,!?()[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function summarizeThinkingText(content: string) {
  const normalized = normalizeWhitespace(
    content.replace(/[`*_>#-]+/g, ' ').replace(/\[(.*?)\]\((.*?)\)/g, '$1'),
  )
  if (!normalized) {
    return 'Working through the request'
  }

  const lower = normalized.toLowerCase()
  if (/(search|find|grep|locat|trace)/.test(lower)) {
    return 'Searching the codebase'
  }
  if (/(inspect|review|read|open|check|understand|analy[sz]e)/.test(lower)) {
    return 'Inspecting the current context'
  }
  if (/(edit|change|update|modify|write|patch|refactor|implement)/.test(lower)) {
    return 'Preparing the change'
  }
  if (/(test|verify|validate|lint|typecheck)/.test(lower)) {
    return 'Verifying the result'
  }
  if (/(respond|answer|summarize|explain)/.test(lower)) {
    return 'Preparing the response'
  }
  if (/(plan|approach|decide|reason|think)/.test(lower)) {
    return 'Planning the next step'
  }

  return truncateOneLine(normalized)
}

function isToolRunning(state: string) {
  return state === 'input-streaming' || state === 'executing'
}

function isToolComplete(state: string) {
  return state === 'complete' || state === 'output-available'
}

function hashText(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash + value.charCodeAt(index)) >>> 0
  }
  return hash
}

function getCuratedToolHeading(
  part: Extract<UIMessage['parts'][number], { type: 'tool-call' }>,
) {
  if (part.name in CURATED_TOOL_HEADINGS) {
    const headings = CURATED_TOOL_HEADINGS[part.name as keyof typeof CURATED_TOOL_HEADINGS]
    return headings[hashText(part.id) % headings.length] ?? headings[0]
  }
  return null
}

function summarizeToolCall(part: Extract<UIMessage['parts'][number], { type: 'tool-call' }>) {
  const curatedHeading = getCuratedToolHeading(part)
  if (curatedHeading) {
    return curatedHeading
  }

  if (part.summary?.trim()) {
    return part.summary.trim()
  }

  const parsedArgs = parseToolArgs(part.arguments)
  const isError = part.state === 'error'
  const isRunning = isToolRunning(part.state)
  const awaitingResult = !isError && !isRunning && !isToolComplete(part.state)

  return resolveActionText({
    name: part.name,
    args: parsedArgs,
    awaitingResult,
    isError,
    isRunning,
  }).replace(/`/g, '')
}

function canSummarizeLinkedToolCall(
  part: Extract<UIMessage['parts'][number], { type: 'tool-call' }>,
) {
  return part.summary?.trim().length || part.state !== 'input-streaming'
}

function findLinkedToolCall(
  parts: readonly UIMessage['parts'][number][],
  thinkingIndex: number,
): Extract<UIMessage['parts'][number], { type: 'tool-call' }> | null {
  for (let index = thinkingIndex + 1; index < parts.length; index += 1) {
    const part = parts[index]
    if (!part) {
      break
    }
    if (part.type === 'tool-call') {
      return part
    }
    if (part.type === 'thinking' || part.type === 'text') {
      return null
    }
  }
  return null
}

export function buildReasoningSummaries(
  parts: readonly UIMessage['parts'][number][],
  isMessageStreaming = false,
) {
  const summaries: ReasoningSummary[] = []
  const seen = new Set<string>()

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]
    if (!part || part.type !== 'thinking' || part.content.trim().length === 0) {
      continue
    }

    const linkedToolCall = findLinkedToolCall(parts, index)
    const isRunning = linkedToolCall
      ? isToolRunning(linkedToolCall.state)
      : isMessageStreaming && index === parts.length - 1

    const text = truncateOneLine(
      linkedToolCall && canSummarizeLinkedToolCall(linkedToolCall)
        ? summarizeToolCall(linkedToolCall)
        : summarizeThinkingText(part.content),
    )
    const key = normalizeSummaryKey(text)
    if (!key || seen.has(key)) {
      continue
    }

    seen.add(key)
    summaries.push({
      id: part.stepId ?? `thinking-summary-${String(index)}`,
      text,
      isRunning,
    })

    if (summaries.length === MAX_SUMMARIES) {
      break
    }
  }

  return summaries
}
