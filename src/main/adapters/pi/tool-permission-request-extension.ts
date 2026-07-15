import type { ExtensionFactory } from '@mariozechner/pi-coding-agent'
import type { ToolPermissionMode } from '@shared/types/settings'
import type { ToolPermissionRequestEnvelope } from '@shared/types/tool-permission'
import { registerEarlyToolAuthoringBridge } from './early-tool-authoring-bridge'
import { isCodeEditingTool, normalizeToolName, resolveToolRoute } from './tool-model-route'

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

interface ApprovedToolPermission {
  count: number
  expiresAt: number
}

const APPROVED_PERMISSION_TTL_MS = 2 * 60 * 1000
/**
 * Approvals are keyed by *normalized tool name*, not by exact arguments. When a
 * guarded tool is approved the run resumes and the orchestrator re-proposes the
 * tool; its arguments may differ slightly from the intercepted proposal (and for
 * routed mutation tools they are re-authored downstream anyway), so an
 * exact-argument match would spuriously re-prompt and the first edit would fail.
 * A tool-name-scoped, consume-once approval makes the resume deterministic.
 */
const approvedToolPermissions = new Map<string, ApprovedToolPermission>()
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
  const key = normalizeToolName(request.toolName)
  const existing = approvedToolPermissions.get(key)
  approvedToolPermissions.set(key, {
    count: (existing?.count ?? 0) + 1,
    expiresAt: now + APPROVED_PERMISSION_TTL_MS,
  })
}

function consumeApprovedToolPermission(toolName: string) {
  const now = Date.now()
  pruneExpiredApprovals(now)
  const key = normalizeToolName(toolName)
  const approval = approvedToolPermissions.get(key)
  if (!approval) {
    return false
  }
  if (approval.count <= 1) {
    approvedToolPermissions.delete(key)
  } else {
    approval.count -= 1
  }
  return true
}

/** Test/reset seam. */
export function clearApprovedToolPermissions() {
  approvedToolPermissions.clear()
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
  // Expose the early-authoring plan to the runtime so it can interrupt the
  // orchestrator before a routed mutation generates its whole payload.
  registerEarlyToolAuthoringBridge()

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
