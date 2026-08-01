import type { UIMessage, UIMessagePart } from '@shared/types/chat-ui'
import type {
  ToolPermissionPayloadDetails,
  ToolPermissionRequestEnvelope,
} from '@shared/types/tool-permission'
import { normalizeToolResultPayload } from '@shared/utils/tool-result-state'

type JsonRecord = Record<string, unknown>

export interface PendingToolPermissionRequest extends ToolPermissionRequestEnvelope {
  readonly messageId: string
  readonly summary: string
  readonly complexityRating?: 'low' | 'medium' | 'high'
  readonly complexitySource?: string
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isToolPermissionDetails(value: unknown): value is ToolPermissionPayloadDetails {
  return (
    isRecord(value) &&
    value.kind === 'tool_permission_request' &&
    typeof value.toolName === 'string'
  )
}

function readTextSummary(content: unknown) {
  const normalized = normalizeToolResultPayload(content)
  if (!isRecord(normalized)) {
    return ''
  }
  const blocks = normalized.content
  if (!Array.isArray(blocks)) {
    return ''
  }
  return blocks
    .flatMap((block) =>
      isRecord(block) && block.type === 'text' && typeof block.text === 'string'
        ? [block.text]
        : [],
    )
    .join('\n')
    .trim()
}

function toPermissionRequest(
  part: Extract<UIMessagePart, { type: 'tool-result' }>,
  messageId: string,
): PendingToolPermissionRequest | null {
  const normalized = normalizeToolResultPayload(part.content)
  if (!isRecord(normalized) || !isToolPermissionDetails(normalized.details)) {
    return null
  }

  const details = normalized.details
  const request = isRecord(details.request) ? details.request : {}
  const permission = isRecord(request.permission) ? request.permission : {}
  const inputCandidate = isRecord(details.args)
    ? details.args
    : isRecord(details.input)
      ? details.input
      : null

  if (!inputCandidate) {
    return null
  }

  return {
    messageId,
    toolCallId: part.toolCallId,
    toolName: details.toolName,
    input: inputCandidate,
    title: typeof permission.title === 'string' ? permission.title : undefined,
    description: typeof permission.description === 'string' ? permission.description : undefined,
    model: typeof request.model === 'string' ? request.model : undefined,
    summary: readTextSummary(part.content),
  }
}

export function findLatestPendingToolPermissionRequest(
  messages: readonly UIMessage[],
  dismissedRequestIds: ReadonlySet<string>,
): PendingToolPermissionRequest | null {
  const latestMessage = messages.at(-1)
  if (!latestMessage) {
    return null
  }

  for (let partIndex = latestMessage.parts.length - 1; partIndex >= 0; partIndex -= 1) {
    const part = latestMessage.parts[partIndex]
    if (!part || part.type !== 'tool-result') {
      continue
    }
    if (dismissedRequestIds.has(part.toolCallId)) {
      continue
    }
    const request = toPermissionRequest(part, latestMessage.id)
    if (request) {
      return request
    }
  }
  return null
}
