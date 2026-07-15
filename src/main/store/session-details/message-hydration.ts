import { matchBy } from '@diegogbrisa/ts-match'
import { Schema, type SchemaType, safeDecodeUnknown } from '@shared/schema'
import { waggleMetadataSchema } from '@shared/schemas/waggle'
import type { Message } from '@shared/types/agent'
import { MessageId, SupportedModelId, ToolCallId } from '@shared/types/brand'
import { TOOL_PERMISSION_CUSTOM_TYPE } from '@shared/types/tool-permission'
import { isRecord } from '@shared/utils/validation'
import { createLogger } from '../../logger'
import { buildPiWorkingContextPath } from '../session-working-context'
import { MESSAGE_ENTRY_TYPE, TOOL_RESULT_KIND } from './constants'
import { describeError } from './errors'
import {
  normalizeModelId,
  parseJsonValue,
  sessionJsonObjectSchema,
  sessionJsonValueSchema,
} from './json'
import { CUSTOM_MESSAGE_ENTRY_TYPE } from '../sessions/constants'
import type { SessionNodeRow, SessionRow } from './types'

const logger = createLogger('session-details')

const toolCallRequestSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  args: sessionJsonObjectSchema,
  state: Schema.optional(Schema.Literal('input-complete')),
})

const toolCallResultSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  args: sessionJsonObjectSchema,
  result: sessionJsonValueSchema,
  isError: Schema.Boolean,
  duration: Schema.Number,
  details: Schema.optional(sessionJsonValueSchema),
})

const messagePartSchema = Schema.Union(
  Schema.Struct({ type: Schema.Literal('text'), text: Schema.String }),
  Schema.Struct({ type: Schema.Literal('reasoning'), text: Schema.String }),
  Schema.Struct({ type: Schema.Literal('thinking'), text: Schema.String }),
  Schema.Struct({
    type: Schema.Literal('attachment'),
    attachment: Schema.Struct({
      id: Schema.String,
      kind: Schema.Literal('text', 'image', 'pdf'),
      origin: Schema.optional(Schema.Literal('user-file', 'auto-paste-text')),
      name: Schema.String,
      path: Schema.String,
      mimeType: Schema.String,
      sizeBytes: Schema.Number,
      extractedText: Schema.String,
    }),
  }),
  Schema.Struct({ type: Schema.Literal('tool-call'), toolCall: toolCallRequestSchema }),
  Schema.Struct({ type: Schema.Literal('tool-result'), toolResult: toolCallResultSchema }),
)

const messageMetadataSchema = Schema.Struct({
  waggle: Schema.optional(waggleMetadataSchema),
})

const messageNodeContentSchema = Schema.Struct({
  parts: Schema.mutable(Schema.Array(messagePartSchema)),
  model: Schema.optional(Schema.NullOr(Schema.String)),
})

type ParsedPart = SchemaType<typeof messagePartSchema>
type ApprovedToolPermissionResolution = {
  readonly originalToolCallId: string
  readonly toolName: string
  readonly input: Readonly<Record<string, unknown>>
}

function transformPart(part: ParsedPart) {
  return matchBy(part, 'type')
    .with('text', (value) => ({ type: 'text', text: value.text }))
    .with('reasoning', (value) => ({ type: 'reasoning', text: value.text }))
    .with('thinking', (value) => ({ type: 'reasoning', text: value.text }))
    .with('attachment', (value) => ({ type: 'attachment', attachment: value.attachment }))
    .with('tool-call', (value) => ({
      type: 'tool-call',
      toolCall: {
        id: ToolCallId(value.toolCall.id),
        name: value.toolCall.name,
        args: value.toolCall.args,
        state: value.toolCall.state,
      },
    }))
    .with('tool-result', (value) => ({
      type: 'tool-result',
      toolResult: {
        id: ToolCallId(value.toolResult.id),
        name: value.toolResult.name,
        args: value.toolResult.args,
        result: value.toolResult.result,
        isError: value.toolResult.isError,
        duration: value.toolResult.duration,
        details: value.toolResult.details,
      },
    }))
    .exhaustive()
}

function stableJson(value: unknown): string {
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`
  }
  if (!isRecord(value)) {
    return JSON.stringify(String(value))
  }

  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`
}

function buildToolFingerprint(toolName: string, input: Readonly<Record<string, unknown>>) {
  return `${toolName.trim().toLowerCase()}::${stableJson(input)}`
}

function readApprovedToolPermissionResolution(
  row: SessionNodeRow,
): ApprovedToolPermissionResolution | null {
  if (row.pi_entry_type !== CUSTOM_MESSAGE_ENTRY_TYPE) {
    return null
  }

  const content = parseJsonValue(row.content_json)
  if (!isRecord(content) || content.customType !== TOOL_PERMISSION_CUSTOM_TYPE) {
    return null
  }

  const details = content.details
  if (
    !isRecord(details) ||
    details.kind !== 'tool-permission-resolution' ||
    details.decision !== 'approved'
  ) {
    return null
  }

  const toolCallId = typeof details.toolCallId === 'string' ? details.toolCallId : null
  const toolName = typeof details.toolName === 'string' ? details.toolName : null
  const input = isRecord(details.input) ? details.input : null
  if (!toolCallId || !toolName || !input) {
    return null
  }

  return {
    originalToolCallId: toolCallId,
    toolName,
    input,
  }
}

function remapMessageToolReferences(
  message: Message,
  toolCallIdMap: ReadonlyMap<string, string>,
): Message {
  if (toolCallIdMap.size === 0) {
    return message
  }

  let changed = false
  const parts = message.parts.map((part) => {
    if (part.type === 'tool-call') {
      const nextId = toolCallIdMap.get(part.toolCall.id)
      if (!nextId || nextId === part.toolCall.id) {
        return part
      }
      changed = true
      return {
        ...part,
        toolCall: {
          ...part.toolCall,
          id: ToolCallId(nextId),
        },
      }
    }

    if (part.type === 'tool-result') {
      const nextId = toolCallIdMap.get(part.toolResult.id)
      if (!nextId || nextId === part.toolResult.id) {
        return part
      }
      changed = true
      return {
        ...part,
        toolResult: {
          ...part.toolResult,
          id: ToolCallId(nextId),
        },
      }
    }

    return part
  })

  return changed ? { ...message, parts } : message
}

function consumeMatchingApprovedResolution(
  message: Message,
  pendingResolutions: ApprovedToolPermissionResolution[],
) {
  for (const part of message.parts) {
    if (part.type !== 'tool-call') {
      continue
    }

    const fingerprint = buildToolFingerprint(part.toolCall.name, part.toolCall.args)
    const matchIndex = pendingResolutions.findIndex(
      (resolution) => buildToolFingerprint(resolution.toolName, resolution.input) === fingerprint,
    )
    if (matchIndex < 0) {
      continue
    }

    const [resolution] = pendingResolutions.splice(matchIndex, 1)
    if (!resolution) {
      return null
    }

    return {
      originalToolCallId: resolution.originalToolCallId,
      resumedToolCallId: part.toolCall.id,
    }
  }

  return null
}

function hydrateMessageMetadata(raw: string) {
  const parsedMetadata = safeDecodeUnknown(messageMetadataSchema, parseJsonValue(raw) ?? {})
  if (!parsedMetadata.success || !parsedMetadata.data) {
    return undefined
  }

  return {
    ...parsedMetadata.data,
    waggle: parsedMetadata.data.waggle
      ? {
          ...parsedMetadata.data.waggle,
          agentModel: parsedMetadata.data.waggle.agentModel
            ? SupportedModelId(parsedMetadata.data.waggle.agentModel)
            : undefined,
        }
      : undefined,
  }
}

export function hydrateSessionMessage(row: SessionNodeRow) {
  const parsedContent = safeDecodeUnknown(
    messageNodeContentSchema,
    parseJsonValue(row.content_json),
  )
  if (!parsedContent.success) {
    throw new Error(
      `Invalid message node content for ${row.id}: ${parsedContent.issues.join('; ')}`,
    )
  }

  const modelId = parsedContent.data.model ? normalizeModelId(parsedContent.data.model) : undefined

  return {
    id: MessageId(row.id),
    role: row.role ?? 'assistant',
    parts: parsedContent.data.parts.map(transformPart),
    model: modelId ? SupportedModelId(modelId) : undefined,
    metadata: hydrateMessageMetadata(row.metadata_json),
    createdAt: row.timestamp_ms,
  }
}

function getStringField(value: unknown, key: string) {
  if (!isRecord(value)) {
    return null
  }

  const field = value[key]
  return typeof field === 'string' && field.trim().length > 0 ? field : null
}

function getNumberField(value: unknown, key: string) {
  if (!isRecord(value)) {
    return null
  }

  const field = value[key]
  return typeof field === 'number' && Number.isFinite(field) ? field : null
}

export function hydrateStructuralSessionMessage(row: SessionNodeRow): Message | null {
  const content = parseJsonValue(row.content_json)
  const summary = getStringField(content, 'summary')
  if (!summary) {
    return null
  }

  if (row.kind === 'branch_summary') {
    return {
      id: MessageId(row.id),
      role: 'assistant',
      parts: [{ type: 'text', text: `Branch summary\n\n${summary}` }],
      metadata: { branchSummary: { summary } },
      createdAt: row.timestamp_ms,
    }
  }

  if (row.kind === 'compaction_summary') {
    const tokensBefore = getNumberField(content, 'tokensBefore')
    return {
      id: MessageId(row.id),
      role: 'assistant',
      parts: [{ type: 'text', text: `Compaction summary\n\n${summary}` }],
      ...(tokensBefore !== null
        ? { metadata: { compactionSummary: { summary, tokensBefore } } }
        : {}),
      createdAt: row.timestamp_ms,
    }
  }

  return null
}

export function hydrateSessionMessages(nodeRows: readonly SessionNodeRow[]) {
  const messages: Message[] = []
  const pendingApprovedResolutions: ApprovedToolPermissionResolution[] = []
  const remappedToolCallIds = new Map<string, string>()

  for (const row of nodeRows) {
    const approvedResolution = readApprovedToolPermissionResolution(row)
    if (approvedResolution) {
      pendingApprovedResolutions.push(approvedResolution)
      continue
    }

    if (row.kind === 'branch_summary' || row.kind === 'compaction_summary') {
      const structuralMessage = hydrateStructuralSessionMessage(row)
      if (structuralMessage) messages.push(structuralMessage)
      continue
    }

    if (row.kind === TOOL_RESULT_KIND) {
      messages.push(remapMessageToolReferences(hydrateSessionMessage(row), remappedToolCallIds))
      continue
    }

    if (
      row.pi_entry_type !== MESSAGE_ENTRY_TYPE &&
      row.kind !== 'user_message' &&
      row.kind !== 'assistant_message'
    ) {
      continue
    }

    if (row.role !== null) {
      const hydratedMessage = hydrateSessionMessage(row)
      const matchedResolution = consumeMatchingApprovedResolution(
        hydratedMessage,
        pendingApprovedResolutions,
      )
      if (matchedResolution) {
        remappedToolCallIds.set(
          matchedResolution.resumedToolCallId,
          matchedResolution.originalToolCallId,
        )
        continue
      }

      messages.push(remapMessageToolReferences(hydratedMessage, remappedToolCallIds))
    }
  }

  return messages
}

export function getActivePathRows(
  activeNodeId: string | null,
  nodeRows: readonly SessionNodeRow[],
) {
  return buildPiWorkingContextPath(activeNodeId, nodeRows, {
    getId: (row) => row.id,
    getParentId: (row) => row.parent_id,
    getKind: (row) => row.kind,
    getContentJson: (row) => row.content_json,
  })
}

export function logSessionHydrationFailure(sessionRow: SessionRow, error: unknown) {
  logger.warn('Failed to hydrate session-backed session', {
    sessionId: sessionRow.id,
    error: describeError(error),
  })
}
