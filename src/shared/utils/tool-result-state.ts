import { match, P } from '@diegogbrisa/ts-match'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isApprovalPermission(value: unknown): boolean {
  return isRecord(value) && value.kind === 'user-approval' && typeof value.toolName === 'string'
}

export function isToolPermissionRequestPayload(value: unknown): boolean {
  const normalized = normalizeToolResultPayload(value)
  if (!isRecord(normalized)) {
    return false
  }

  const details = normalized.details
  if (isRecord(details) && details.kind === 'tool_permission_request') {
    return true
  }

  if (isRecord(details) && isApprovalPermission(details.permission)) {
    return true
  }

  const detailRequest = isRecord(details) && isRecord(details.request) ? details.request : null
  if (detailRequest && isApprovalPermission(detailRequest.permission)) {
    return true
  }

  const request = isRecord(normalized.request) ? normalized.request : null
  return request ? isApprovalPermission(request.permission) : false
}

export function parseSerializedToolPayload(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value
  }

  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export function unwrapStructuredToolPayload(value: unknown): unknown {
  return match(value)
    .with({ kind: 'json', data: P.select() }, (data) => data)
    .with({ kind: 'text', text: P.select() }, (text) => text)
    .otherwise(() => value)
}

export function normalizeToolResultPayload(value: unknown): unknown {
  return unwrapStructuredToolPayload(parseSerializedToolPayload(value))
}

export function hasConcreteToolOutput(value: unknown): boolean {
  return value !== undefined && !isToolPermissionRequestPayload(value)
}
