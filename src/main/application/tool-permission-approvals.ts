/**
 * Tool-permission approval registry.
 *
 * A process-global, consume-once, TTL-scoped registry mapping a normalized tool
 * name to an approval count. The IPC layer registers an approval when the user
 * resolves a tool-permission request; the runtime consumes it (decrementing the
 * count) when the guarded tool is re-proposed after resume.
 *
 * Hoisted out of the Pi `tool-permission-request-extension` so the IPC layer does
 * not import from `adapters/pi/`. The registry is runtime-neutral; the Pi extension
 * consumes approvals, and any future turing-side permission bridge may do the same.
 */
import type { ToolPermissionRequestEnvelope } from '@shared/types/tool-permission'
import { normalizeToolName } from './tool-model-route'

const APPROVED_PERMISSION_TTL_MS = 2 * 60 * 1000

interface ApprovedToolPermission {
  count: number
  expiresAt: number
}

const approvedToolPermissions = new Map<string, ApprovedToolPermission>()

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

/**
 * Consume one approval for the tool, decrementing its count. Returns false when no
 * unexpired approval exists. Approvals are keyed by normalized tool name, not exact
 * arguments, so the resume is deterministic across re-proposed arguments.
 */
export function consumeApprovedToolPermission(toolName: string) {
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
