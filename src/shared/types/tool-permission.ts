import type { JsonObject, JsonValue } from './json'

export type ToolPermissionDecision = 'approved' | 'denied'
export const TOOL_PERMISSION_CUSTOM_TYPE = 'openwaggle.tool-permission-resolution'

export interface ToolPermissionRequestEnvelope {
  readonly toolCallId: string
  readonly toolName: string
  readonly input: Readonly<JsonObject>
  readonly title?: string
  readonly description?: string
  readonly model?: string
}

export interface ToolPermissionResolution {
  readonly request: ToolPermissionRequestEnvelope
  readonly decision: ToolPermissionDecision
}

export interface ToolPermissionPayloadDetails {
  readonly kind: 'tool_permission_request'
  readonly toolName: string
  readonly input?: Readonly<JsonObject>
  readonly args?: Readonly<JsonObject>
  readonly request?: {
    readonly model?: string
    readonly permission?: JsonValue
    readonly metadata?: Readonly<JsonObject>
  }
}
