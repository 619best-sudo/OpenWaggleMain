import type { JsonObject } from '@shared/types/json'
import { normalizeToolResultPayload } from '@shared/utils/tool-result-state'
import type { UIMessage, UIMessagePart } from '@shared/types/chat-ui'
import type { ToolPermissionPayloadDetails, ToolPermissionRequestEnvelope } from '@shared/types/tool-permission'

type JsonRecord = Record<string, unknown>
const DEBUG_SERVER_URL = 'http://127.0.0.1:7777/event'
const DEBUG_RUN_ID = 'post-fix'

function reportPermissionShiftDebug(
  hypothesisId: 'B',
  location: string,
  msg: string,
  data: Record<string, unknown>,
) {
  void fetch(DEBUG_SERVER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'permission-transcript-shift',
      runId: DEBUG_RUN_ID,
      hypothesisId,
      location,
      msg,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {})
}

export interface PendingToolPermissionRequest extends ToolPermissionRequestEnvelope {
  readonly messageId: string
  readonly summary: string
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isToolPermissionDetails(value: unknown): value is ToolPermissionPayloadDetails {
  return isRecord(value) && value.kind === 'tool_permission_request' && typeof value.toolName === 'string'
}

type ExtractedPermissionPayload = {
  readonly toolName: string
  readonly input: Readonly<JsonObject>
  readonly title?: string
  readonly description?: string
  readonly model?: string
}

function extractApprovalPermission(
  value: unknown,
  model?: string,
): ExtractedPermissionPayload | null {
  if (!isRecord(value) || value.kind !== 'user-approval' || typeof value.toolName !== 'string') {
    return null
  }

  const input = isRecord(value.input) ? value.input : null
  if (!input) {
    return null
  }

  return {
    toolName: value.toolName,
    input: input as JsonObject,
    title: typeof value.title === 'string' ? value.title : undefined,
    description: typeof value.description === 'string' ? value.description : undefined,
    model,
  }
}

function extractPermissionPayload(normalized: unknown): ExtractedPermissionPayload | null {
  if (!isRecord(normalized)) {
    return null
  }

  const details = isRecord(normalized.details) ? normalized.details : null
  if (isToolPermissionDetails(details)) {
    const request = isRecord(details.request) ? details.request : {}
    const permission = isRecord(request.permission) ? request.permission : {}
    const input = isRecord(details.args) ? details.args : isRecord(details.input) ? details.input : null

    if (!input) {
      return null
    }

    return {
      toolName: details.toolName,
      input: input as JsonObject,
      title: typeof permission.title === 'string' ? permission.title : undefined,
      description: typeof permission.description === 'string' ? permission.description : undefined,
      model: typeof request.model === 'string' ? request.model : undefined,
    }
  }

  const detailModel = details && typeof details.model === 'string' ? details.model : undefined
  const fromDetailsPermission = extractApprovalPermission(details?.permission, detailModel)
  if (fromDetailsPermission) {
    return fromDetailsPermission
  }

  const detailRequest = details && isRecord(details.request) ? details.request : null
  const requestModel = detailRequest && typeof detailRequest.model === 'string' ? detailRequest.model : undefined
  const fromDetailRequestPermission = extractApprovalPermission(detailRequest?.permission, requestModel)
  if (fromDetailRequestPermission) {
    return fromDetailRequestPermission
  }

  const topLevelRequest = isRecord(normalized.request) ? normalized.request : null
  const topLevelRequestModel =
    topLevelRequest && typeof topLevelRequest.model === 'string' ? topLevelRequest.model : undefined
  return extractApprovalPermission(topLevelRequest?.permission, topLevelRequestModel)
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
      isRecord(block) && block.type === 'text' && typeof block.text === 'string' ? [block.text] : [],
    )
    .join('\n')
    .trim()
}

function summarizeToolResultForDebug(content: unknown) {
  const normalized = normalizeToolResultPayload(content)
  if (!isRecord(normalized)) {
    return {
      normalizedType: typeof normalized,
      hasDetails: false,
      detailKind: null,
      detailToolName: null,
      topLevelKeys: [],
    }
  }

  const details = isRecord(normalized.details) ? normalized.details : null
  return {
    normalizedType: 'record',
    hasDetails: details !== null,
    detailKind: details && typeof details.kind === 'string' ? details.kind : null,
    detailToolName: details && typeof details.toolName === 'string' ? details.toolName : null,
    topLevelKeys: Object.keys(normalized).slice(0, 8),
  }
}

function toPermissionRequest(
  part: Extract<UIMessagePart, { type: 'tool-result' }>,
  messageId: string,
): PendingToolPermissionRequest | null {
  const normalized = normalizeToolResultPayload(part.content)
  const permissionPayload = extractPermissionPayload(normalized)
  if (!permissionPayload) {
    // #region debug-point B:non-matching-tool-result
    reportPermissionShiftDebug(
      'B',
      'tool-permission-request.ts:toPermissionRequest',
      '[DEBUG] Tool result did not match permission request envelope',
      {
        messageId,
        toolCallId: part.toolCallId,
        ...summarizeToolResultForDebug(part.content),
      },
    )
    // #endregion
    return null
  }

  return {
    messageId,
    toolCallId: part.toolCallId,
    toolName: permissionPayload.toolName,
    input: permissionPayload.input,
    title: permissionPayload.title,
    description: permissionPayload.description,
    model: permissionPayload.model,
    summary: readTextSummary(part.content),
  }
}

export function findLatestPendingToolPermissionRequest(
  messages: readonly UIMessage[],
  dismissedRequestIds: ReadonlySet<string>,
): PendingToolPermissionRequest | null {
  if (messages.length === 0) {
    // #region debug-point B:no-latest-message
    reportPermissionShiftDebug(
      'B',
      'tool-permission-request.ts:findLatestPendingToolPermissionRequest',
      '[DEBUG] No latest message while resolving pending tool permission',
      { messageCount: messages.length, dismissedCount: dismissedRequestIds.size },
    )
    // #endregion
    return null
  }

  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex]
    if (!message) {
      continue
    }

    const toolResultCount = message.parts.filter((part) => part.type === 'tool-result').length
    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.parts[partIndex]
      if (!part || part.type !== 'tool-result') {
        continue
      }
      if (dismissedRequestIds.has(part.toolCallId)) {
        continue
      }
      const request = toPermissionRequest(part, message.id)
      if (request) {
        // #region debug-point B:pending-request-found
        reportPermissionShiftDebug(
          'B',
          'tool-permission-request.ts:findLatestPendingToolPermissionRequest',
          '[DEBUG] Found pending tool permission request in transcript',
          {
            messageId: message.id,
            messageIndex,
            partIndex,
            partCount: message.parts.length,
            toolResultCount,
            toolCallId: request.toolCallId,
            toolName: request.toolName,
            dismissedCount: dismissedRequestIds.size,
          },
        )
        // #endregion
        return request
      }
    }
  }

  const latestMessage = messages.at(-1)
  // #region debug-point B:no-pending-request-found
  reportPermissionShiftDebug(
    'B',
    'tool-permission-request.ts:findLatestPendingToolPermissionRequest',
    '[DEBUG] No pending tool permission request found anywhere in transcript',
    {
      latestMessageId: latestMessage?.id ?? null,
      latestMessagePartCount: latestMessage?.parts.length ?? 0,
      dismissedCount: dismissedRequestIds.size,
      messageCount: messages.length,
    },
  )
  // #endregion
  return null
}
