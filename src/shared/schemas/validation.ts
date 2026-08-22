/**
 * Centralized Effect schemas for runtime boundary validation.
 *
 * Schemas here replace cast-heavy JSON.parse / IPC / external API boundaries.
 * Consumers should decode through `safeDecodeUnknown` / `decodeUnknownOrThrow`
 * from `src/shared/schema.ts`.
 */

import { Schema } from '@shared/schema'
import type { JsonArray, JsonObject, JsonValue } from '@shared/types/json'
import { THINKING_LEVELS } from '@shared/types/settings'
import type { ToolPermissionResolution } from '@shared/types/tool-permission'

const attachmentKindSchema = Schema.Literal('text', 'image', 'pdf')
const attachmentOriginSchema = Schema.Literal('user-file', 'auto-paste-text')

const jsonArraySchema: Schema.Schema<JsonArray> = Schema.suspend(() =>
  Schema.mutable(Schema.Array(jsonValueSchema)),
)

export const jsonObjectSchema: Schema.Schema<JsonObject> = Schema.suspend(() =>
  Schema.mutable(
    Schema.Record({
      key: Schema.String,
      value: jsonValueSchema,
    }),
  ),
)

export const jsonValueSchema: Schema.Schema<JsonValue> = Schema.suspend(() =>
  Schema.Union(
    Schema.String,
    Schema.Number,
    Schema.Boolean,
    Schema.Null,
    jsonArraySchema,
    jsonObjectSchema,
  ),
)

const jsonLooseRecordSchema = Schema.Record({
  key: Schema.String,
  value: Schema.Unknown,
})

export const preparedAttachmentSchema = Schema.Struct({
  id: Schema.String,
  kind: attachmentKindSchema,
  origin: Schema.optional(attachmentOriginSchema),
  name: Schema.String,
  path: Schema.String,
  mimeType: Schema.String,
  sizeBytes: Schema.Number,
  extractedText: Schema.String,
})

export const agentSendPayloadSchema = Schema.Struct({
  text: Schema.String,
  thinkingLevel: Schema.Literal(...THINKING_LEVELS),
  attachments: Schema.mutable(Schema.Array(preparedAttachmentSchema)),
  // Machine mode. MUST stay listed here: this schema is the IPC boundary and it
  // strips anything it does not declare, so an omitted field is dropped between
  // renderer and main with no error — the toggle would look wired and do nothing.
  planMode: Schema.optional(Schema.Boolean),
  // Per-message MCP selection (composer picker). Same IPC-boundary rule: an
  // undeclared field would be stripped and the picker would do nothing.
  mcpServers: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
})

export const toolPermissionResolutionSchema: Schema.Schema<ToolPermissionResolution> = Schema.Struct({
  request: Schema.Struct({
    toolCallId: Schema.String,
    toolName: Schema.String,
    input: jsonObjectSchema,
    title: Schema.optional(Schema.String),
    description: Schema.optional(Schema.String),
    model: Schema.optional(Schema.String),
  }),
  decision: Schema.Literal('approved', 'denied'),
})

export const projectPreferencesSchema = Schema.Struct({
  model: Schema.optional(Schema.String),
  thinkingLevel: Schema.optional(Schema.Literal(...THINKING_LEVELS)),
})

export const projectSettingsFileSchema = Schema.Struct(
  {
    preferences: Schema.optional(projectPreferencesSchema),
    pi: Schema.optional(jsonObjectSchema),
  },
  jsonLooseRecordSchema,
)
