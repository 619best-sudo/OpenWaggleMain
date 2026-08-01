import type { ExtensionFactory } from '@mariozechner/pi-coding-agent'
import type { ToolPermissionMode } from '@shared/types/settings'
import {
  consumeApprovedToolPermission,
  registerApprovedToolPermission,
} from '../../application/tool-permission-approvals'
import { isCodeEditingTool, normalizeToolName, resolveToolRoute } from '../../application/tool-model-route'

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

/**
 * Routing directive surfaced to the runtime. When `authorFinalArgs` is true the
 * patched pi-agent-core loop re-authors the tool's final arguments with `model`
 * before executing; when `reasonOverResult` is true the routed model reasons over
 * the tool result after execution (see `tool-model-route.ts`). Carried in-band so
 * the routed model is passed explicitly — never inferred from a prompt.
 */
interface ToolRouteDirective {
  readonly model: string
  readonly authorFinalArgs: boolean
  readonly reasonOverResult: boolean
}

const CODE_EDITING_GUARDED_TOOL_NAMES = ['edit', 'write', 'patch', 'multiedit'] as const

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
  return new Set(
    (toolNames ?? ['bash']).map((toolName) => normalizeToolName(toolName)).filter(Boolean),
  )
}

function shouldGuardTool(toolName: string, guardedToolNames: ReadonlySet<string>) {
  const normalizedToolName = normalizeToolName(toolName)
  if (guardedToolNames.has(normalizedToolName)) {
    return true
  }

  if (!isCodeEditingTool(toolName)) {
    return false
  }

  return CODE_EDITING_GUARDED_TOOL_NAMES.some((guardedToolName) =>
    guardedToolNames.has(guardedToolName),
  )
}

function shouldRequestPermission(toolName: string, permissionMode: ToolPermissionMode) {
  if (permissionMode === 'allow-all') {
    return false
  }

  if (permissionMode === 'ask-edit') {
    return isCodeEditingTool(toolName)
  }

  return true
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

function buildPermissionRequestResult(
  event: ToolCallEvent,
  input: JsonRecord,
  route: ToolRouteDirective,
) {
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
    model: route.model,
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
    // Routing travels with the pause so the same directive is available if a host
    // wants to act on it while suspended; on resume the runtime recomputes it too.
    route,
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
      route,
    },
    terminate: true,
  }
}

/**
 * Extension that converges permission-gating and model routing on a single seam.
 *
 * For every tool call it computes the route (`resolveToolRoute`). If the tool is
 * guarded and permission is required, it pauses with a permission request. Once
 * permission is satisfied (or not required), it emits the route directive so the
 * runtime can have the routed model author the final arguments before execution.
 * Both the permission and skip-permission paths therefore feed the *same* routed
 * execution logic.
 */
export function createToolPermissionRequestExtension(
  options: ToolPermissionRequestOptions = {},
): ExtensionFactory {
  const guardedToolNames = normalizeToolNames(options.toolNames)
  // NOTE: the early-authoring bridge (registerEarlyToolAuthoringBridge) is
  // intentionally NOT installed. Cutting the orchestrator stream as soon as a
  // mutation tool's path appears discards the payload the orchestrator was about
  // to author, leaving only intent args (e.g. `{ path }`). Correctness then
  // depends entirely on the routed model re-authoring a valid payload; when that
  // routing is unreliable, the promised fallback degrades to unusable intent-only
  // args and every edit/write fails to apply. Leaving the bridge unregistered
  // keeps the orchestrator as the author of a valid payload (strict validation),
  // with routed authoring still available downstream and a real fallback.

  return (pi) => {
    ;(pi.on as (event: 'tool_call', handler: ToolCallHandler) => void)(
      'tool_call',
      async (event) => {
        const route = resolveToolRoute(event.toolName)
        const input = isRecord(event.input) ? event.input : {}

        const permissionMode = (await options.getPermissionMode?.()) ?? 'ask'
        const requiresPermission =
          shouldGuardTool(event.toolName, guardedToolNames) &&
          shouldRequestPermission(event.toolName, permissionMode)

        if (requiresPermission && !consumeApprovedToolPermission(event.toolName)) {
          return buildPermissionRequestResult(event, input, route)
        }

        // Permission satisfied or not required. Surface the route whenever it
        // requests a routed phase — pre-execution authoring (`authorFinalArgs`)
        // and/or post-execution reasoning (`reasonOverResult`) — so the runtime
        // invokes the routed model. Otherwise let the tool run untouched.
        if (route.authorFinalArgs || route.reasonOverResult) {
          return { route }
        }

        return undefined
      },
    )
  }
}
