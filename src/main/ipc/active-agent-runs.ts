import type { SessionId } from '@shared/types/brand'
import type { SupportedModelId } from '@shared/types/llm'
import { ActiveRunManager } from './active-run-manager'

interface AgentRunMetadata {
  readonly model: SupportedModelId
}

const activeRuns = new ActiveRunManager<SessionId, AgentRunMetadata>()
const activeCompactions = new ActiveRunManager<SessionId, AgentRunMetadata>()
const activeWaggleRuns = new ActiveRunManager<SessionId, Record<string, never>>()
const activeTeamRuns = new ActiveRunManager<SessionId, AgentRunMetadata>()

export { activeCompactions, activeRuns, activeTeamRuns, activeWaggleRuns }

export function hasAnyActiveRun(sessionId: SessionId): boolean {
  return (
    activeRuns.has(sessionId) ||
    activeCompactions.has(sessionId) ||
    activeWaggleRuns.has(sessionId) ||
    activeTeamRuns.has(sessionId)
  )
}

export function cancelSessionRuns(sessionId: SessionId): boolean {
  const cancelledAgent = activeRuns.cancel(sessionId)
  const cancelledCompaction = activeCompactions.cancel(sessionId)
  const cancelledWaggle = activeWaggleRuns.cancel(sessionId)
  const cancelledTeam = activeTeamRuns.cancel(sessionId)
  return cancelledAgent || cancelledCompaction || cancelledWaggle || cancelledTeam
}

export function getAllActiveRunSessionIds(): SessionId[] {
  return [
    ...new Set([
      ...activeRuns.keys(),
      ...activeCompactions.keys(),
      ...activeWaggleRuns.keys(),
      ...activeTeamRuns.keys(),
    ]),
  ]
}

export function cancelAllSessionRuns(): SessionId[] {
  const sessionIds = getAllActiveRunSessionIds()
  activeRuns.cancelAll()
  activeCompactions.cancelAll()
  activeWaggleRuns.cancelAll()
  activeTeamRuns.cancelAll()
  return sessionIds
}
