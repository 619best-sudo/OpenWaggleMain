import type { ExtensionFactory } from '@mariozechner/pi-coding-agent'
import type { ToolPermissionRequestEnvelope } from '@shared/types/tool-permission'

type JsonRecord = Record<string, unknown>
type ToolCallEvent = {
  readonly toolName: string
  readonly input: unknown
}
type ToolCallHandler = (event: ToolCallEvent) => Promise<unknown> | unknown

type ToolPermissionRequestOptions = {
  readonly toolNames?: readonly string[]
}

interface ApprovedToolPermission {
  readonly fingerprint: string
  readonly expiresAt: number
}

const APPROVED_PERMISSION_TTL_MS = 2 * 60 * 1000
const approvedToolPermissions = new Map<string, ApprovedToolPermission>()

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toTitle(value: string) {
  return value
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function normalizeToolNames(toolNames: readonly string[] | undefined) {
  return new Set((toolNames ?? ['bash']).map((toolName) => toolName.trim().toLowerCase()).filter(Boolean))
}

function readToolTarget(input: JsonRecord) {
  const pathValue = input.path
  if (typeof pathValue === 'string' && pathValue.trim().length > 0) {
    return pathValue
  }
  const filePathValue = input.filePath
  if (typeof filePathValue === 'string' && filePathValue.trim().length > 0) {
    return filePathValue
  }
  return undefined
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

function buildToolPermissionFingerprint(toolName: string, input: unknown) {
  return `${toolName.trim().toLowerCase()}::${stableJson(input)}`
}

function pruneExpiredApprovals(now = Date.now()) {
  for (const [key, approval] of approvedToolPermissions) {
    if (approval.expiresAt <= now) {
      approvedToolPermissions.delete(key)
    }
  }
}

export function registerApprovedToolPermission(request: ToolPermissionRequestEnvelope) {
  const now = Date.now()
  pruneExpiredApprovals(now)
  const fingerprint = buildToolPermissionFingerprint(request.toolName, request.input)
  approvedToolPermissions.set(fingerprint, {
    fingerprint,
    expiresAt: now + APPROVED_PERMISSION_TTL_MS,
  })
}

function consumeApprovedToolPermission(toolName: string, input: unknown) {
  const now = Date.now()
  pruneExpiredApprovals(now)
  const fingerprint = buildToolPermissionFingerprint(toolName, input)
  const approval = approvedToolPermissions.get(fingerprint)
  if (!approval) {
    return false
  }
  approvedToolPermissions.delete(fingerprint)
  return true
}

export function createToolPermissionRequestExtension(
  options: ToolPermissionRequestOptions = {},
): ExtensionFactory {
  const guardedToolNames = normalizeToolNames(options.toolNames)

  return (pi) => {
    ;(pi.on as (event: 'tool_call', handler: ToolCallHandler) => void)('tool_call', async (event) => {
      if (!guardedToolNames.has(event.toolName.trim().toLowerCase())) {
        return undefined
      }

      const input = isRecord(event.input) ? event.input : {}
      if (consumeApprovedToolPermission(event.toolName, input)) {
        return undefined
      }
      const commandValue = (input as { command?: unknown }).command
      const command = typeof commandValue === 'string' ? commandValue : undefined
      const targetPath = readToolTarget(input)
      const permissionLabel = toTitle(event.toolName)
      const summary = command
        ? `Permission required before running ${event.toolName}: ${command}`
        : targetPath
          ? `Permission required before running ${event.toolName}: ${targetPath}`
          : `Permission required before running ${event.toolName}.`

      return {
        request: {
          permission: {
            kind: 'user-approval',
            toolName: event.toolName,
            title: `Approve ${permissionLabel}`,
            description: targetPath
              ? `OpenWaggle requested permission before reading ${targetPath}.`
              : `OpenWaggle requested permission before running ${event.toolName}.`,
            input,
          },
          metadata: {
            source: 'openwaggle-tool-permission-request',
          },
        },
        content: [
          {
            type: 'text' as const,
            text: summary,
          },
        ],
        details: {
          kind: 'tool_permission_request',
          toolName: event.toolName,
          input,
        },
        terminate: true,
      }
    })
  }
}
