import type { SessionId } from '@shared/types/brand'
import type { SupportedModelId } from '@shared/types/llm'
import type {
  PendingToolPermissionRequest,
  ToolPermissionResolution,
} from '@shared/types/tool-permission'
import type {
  PendingUserQuestionRequest,
  UserQuestionResolution,
} from '@shared/types/user-question'
import { ActiveRunManager } from './active-run-manager'

interface AgentRunMetadata {
  readonly model: SupportedModelId
}

const activeRuns = new ActiveRunManager<SessionId, AgentRunMetadata>()
const activeCompactions = new ActiveRunManager<SessionId, AgentRunMetadata>()
const activeWaggleRuns = new ActiveRunManager<SessionId, Record<string, never>>()
const activeMachineRuns = new ActiveRunManager<SessionId, AgentRunMetadata>()
const activeTeamRuns = new ActiveRunManager<SessionId, AgentRunMetadata>()
const pendingToolPermissionResolvers = new Map<
  SessionId,
  {
    readonly request: ToolPermissionResolution['request']
    readonly resolve: (resolution: ToolPermissionResolution) => void
    readonly reject: (error: Error) => void
  }
>()
const pendingUserQuestionResolvers = new Map<
  SessionId,
  {
    readonly request: PendingUserQuestionRequest
    readonly resolve: (resolution: UserQuestionResolution) => void
    readonly reject: (error: Error) => void
  }
>()

export { activeCompactions, activeMachineRuns, activeRuns, activeTeamRuns, activeWaggleRuns }

function rejectPendingResolver<T extends { readonly reject: (error: Error) => void }>(
  entry: T | undefined,
  message: string,
) {
  if (!entry) return
  entry.reject(new Error(message))
}

function attachAbortCleanup(
  signal: AbortSignal | undefined,
  cleanup: () => void,
) {
  if (!signal) {
    return () => undefined
  }
  const abortListener = () => cleanup()
  if (signal.aborted) {
    cleanup()
    return () => undefined
  }
  signal.addEventListener('abort', abortListener, { once: true })
  return () => {
    signal.removeEventListener('abort', abortListener)
  }
}

function matchesToolPermissionRequest(
  pending: ToolPermissionResolution['request'],
  incoming: ToolPermissionResolution['request'],
) {
  return (
    pending.toolCallId === incoming.toolCallId &&
    pending.toolName === incoming.toolName &&
    pending.model === incoming.model
  )
}

function matchesPendingUserQuestionRequest(
  pending: PendingUserQuestionRequest,
  incoming: PendingUserQuestionRequest,
) {
  return (
    pending.phase === incoming.phase &&
    pending.question === incoming.question &&
    pending.kind === incoming.kind &&
    pending.reason === incoming.reason &&
    pending.placeholder === incoming.placeholder &&
    pending.answerMode === incoming.answerMode &&
    JSON.stringify(pending.options ?? []) === JSON.stringify(incoming.options ?? [])
  )
}

export function beginToolPermissionRequest(
  sessionId: SessionId,
  request: ToolPermissionResolution['request'],
  signal?: AbortSignal,
): Promise<ToolPermissionResolution> {
  rejectPendingResolver(
    pendingToolPermissionResolvers.get(sessionId),
    'Tool permission request was replaced by a newer request.',
  )

  return new Promise<ToolPermissionResolution>((resolve, reject) => {
    const cleanupAbort = attachAbortCleanup(
      signal,
      () => {
        pendingToolPermissionResolvers.delete(sessionId)
        reject(new Error('aborted'))
      },
    )

    pendingToolPermissionResolvers.set(sessionId, {
      request,
      resolve: (resolution) => {
        cleanupAbort()
        pendingToolPermissionResolvers.delete(sessionId)
        resolve(resolution)
      },
      reject: (error) => {
        cleanupAbort()
        pendingToolPermissionResolvers.delete(sessionId)
        reject(error)
      },
    })
  })
}

export function resolvePendingToolPermission(
  sessionId: SessionId,
  resolution: ToolPermissionResolution,
): boolean {
  const pending = pendingToolPermissionResolvers.get(sessionId)
  if (!pending) {
    return false
  }
  if (!matchesToolPermissionRequest(pending.request, resolution.request)) {
    return false
  }
  pending.resolve(resolution)
  return true
}

export function beginUserQuestionRequest(
  sessionId: SessionId,
  request: PendingUserQuestionRequest,
  signal?: AbortSignal,
): Promise<UserQuestionResolution> {
  rejectPendingResolver(
    pendingUserQuestionResolvers.get(sessionId),
    'User question was replaced by a newer request.',
  )

  return new Promise<UserQuestionResolution>((resolve, reject) => {
    const cleanupAbort = attachAbortCleanup(
      signal,
      () => {
        pendingUserQuestionResolvers.delete(sessionId)
        reject(new Error('aborted'))
      },
    )

    pendingUserQuestionResolvers.set(sessionId, {
      request,
      resolve: (resolution) => {
        cleanupAbort()
        pendingUserQuestionResolvers.delete(sessionId)
        resolve(resolution)
      },
      reject: (error) => {
        cleanupAbort()
        pendingUserQuestionResolvers.delete(sessionId)
        reject(error)
      },
    })
  })
}

export function resolvePendingUserQuestion(
  sessionId: SessionId,
  resolution: UserQuestionResolution,
): boolean {
  const pending = pendingUserQuestionResolvers.get(sessionId)
  if (!pending) {
    return false
  }
  if (!matchesPendingUserQuestionRequest(pending.request, resolution.request)) {
    return false
  }
  pending.resolve(resolution)
  return true
}

export function getPendingUserQuestion(sessionId: SessionId): PendingUserQuestionRequest | null {
  return pendingUserQuestionResolvers.get(sessionId)?.request ?? null
}

export function getPendingToolPermission(sessionId: SessionId): PendingToolPermissionRequest | null {
  const request = pendingToolPermissionResolvers.get(sessionId)?.request
  return request ? (request as PendingToolPermissionRequest) : null
}

export function hasAnyActiveRun(sessionId: SessionId): boolean {
  return (
    activeRuns.has(sessionId) ||
    activeCompactions.has(sessionId) ||
    activeWaggleRuns.has(sessionId) ||
    activeMachineRuns.has(sessionId) ||
    activeTeamRuns.has(sessionId)
  )
}

export function cancelSessionRuns(sessionId: SessionId): boolean {
  rejectPendingResolver(
    pendingToolPermissionResolvers.get(sessionId),
    'Tool permission request was cancelled.',
  )
  rejectPendingResolver(
    pendingUserQuestionResolvers.get(sessionId),
    'User question request was cancelled.',
  )
  const cancelledAgent = activeRuns.cancel(sessionId)
  const cancelledCompaction = activeCompactions.cancel(sessionId)
  const cancelledWaggle = activeWaggleRuns.cancel(sessionId)
  const cancelledMachine = activeMachineRuns.cancel(sessionId)
  const cancelledTeam = activeTeamRuns.cancel(sessionId)
  return cancelledAgent || cancelledCompaction || cancelledWaggle || cancelledMachine || cancelledTeam
}

export function getAllActiveRunSessionIds(): SessionId[] {
  return [
    ...new Set([
      ...activeRuns.keys(),
      ...activeCompactions.keys(),
      ...activeWaggleRuns.keys(),
      ...activeMachineRuns.keys(),
      ...activeTeamRuns.keys(),
    ]),
  ]
}

export function cancelAllSessionRuns(): SessionId[] {
  const sessionIds = getAllActiveRunSessionIds()
  for (const sessionId of pendingToolPermissionResolvers.keys()) {
    rejectPendingResolver(
      pendingToolPermissionResolvers.get(sessionId),
      'Tool permission request was cancelled.',
    )
  }
  for (const sessionId of pendingUserQuestionResolvers.keys()) {
    rejectPendingResolver(
      pendingUserQuestionResolvers.get(sessionId),
      'User question request was cancelled.',
    )
  }
  activeRuns.cancelAll()
  activeCompactions.cancelAll()
  activeWaggleRuns.cancelAll()
  activeMachineRuns.cancelAll()
  activeTeamRuns.cancelAll()
  return sessionIds
}
