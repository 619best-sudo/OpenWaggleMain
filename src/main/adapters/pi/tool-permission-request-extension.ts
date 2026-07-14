import type { ExtensionFactory } from '@mariozechner/pi-coding-agent'
import type { ToolPermissionRequestEnvelope } from '@shared/types/tool-permission'
import type { ToolPermissionMode } from '@shared/types/settings'
import { registerApprovedToolExecutionModel } from './tool-execution-model-state'
import { resolveToolExecutionModel } from './tool-model-route'

type JsonRecord = Record<string, unknown>
type ToolCallEvent = {
  readonly toolName: string
  readonly input: unknown
}
type ToolCallHandler = (event: ToolCallEvent) => Promise<unknown> | unknown

type ToolPermissionRequestOptions = {
  readonly toolNames?: readonly string[]
  readonly getPermissionMode?: () => Promise<ToolPermissionMode> | ToolPermissionMode
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

      const permissionMode = (await options.getPermissionMode?.()) ?? 'ask'
      const toolExecutionModel = resolveToolExecutionModel(event.toolName)
      if (permissionMode === 'allow-all') {
        registerApprovedToolExecutionModel(toolExecutionModel)
        return undefined
      }

      const input = isRecord(event.input) ? event.input : {}
      if (consumeApprovedToolPermission(event.toolName, input)) {
        return undefined
      }
      // #region debug-point B:tool-permission-route
      ;(() => {
        const fallbackUrl = 'http://127.0.0.1:7779/event'
        const fallbackSession = 'tool-model-routing'
        let debugServerUrl = fallbackUrl
        let debugSessionId = fallbackSession
        try {
          const fs = require('node:fs')
          const env = fs.readFileSync('.dbg/tool-model-routing.env', 'utf8') as string
          debugServerUrl = env.match(/DEBUG_SERVER_URL=(.+)/)?.[1] ?? fallbackUrl
          debugSessionId = env.match(/DEBUG_SESSION_ID=(.+)/)?.[1] ?? fallbackSession
        } catch {}
        void fetch(debugServerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: debugSessionId,
            runId: 'pre-fix',
            hypothesisId: 'B',
            location: 'tool-permission-request-extension.ts',
            msg: '[DEBUG] Guarded tool call routed for permission handling',
            data: {
              toolName: event.toolName,
              inputKeys: Object.keys(input),
              toolExecutionModel,
              permissionMode,
            },
            ts: Date.now(),
          }),
        }).catch(() => {})
      })()
      // #endregion
      const commandValue = (input as { command?: unknown }).command
      const command = typeof commandValue === 'string' ? commandValue : undefined
      const targetPath = readToolTarget(input)
      const permissionLabel = toTitle(event.toolName)
      const summary = command
        ? `Permission required before running ${event.toolName}: ${command}`
        : targetPath
          ? `Permission required before running ${event.toolName}: ${targetPath}`
          : `Permission required before running ${event.toolName}.`
      const permissionRequest = {
        model: toolExecutionModel,
        permission: {
          kind: 'user-approval' as const,
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
      }

      return {
        request: permissionRequest,
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
          request: permissionRequest,
        },
        terminate: true,
      }
    })
  }
}
