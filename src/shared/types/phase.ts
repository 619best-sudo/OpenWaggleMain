import type { SessionId } from './brand'
import type { JsonValue } from './json'
import type { PendingUserQuestionRequest } from './user-question'

export type AgentPhaseId = 'prepare' | 'plan' | 'perform' | 'perfect' | 'working'

export const PERSISTED_PHASE_TRANSCRIPT_CUSTOM_TYPE = 'openwaggle.phase-transcript'

export type PersistedPhaseStatus = 'pending' | 'running' | 'completed' | 'failed'
export type AgentPhaseStatus = PersistedPhaseStatus | 'interrupted'

export interface PersistedPhaseTranscriptTool {
  readonly toolCallId: string
  readonly toolName: string
  readonly status: 'running' | 'completed' | 'failed'
}

export interface PersistedPhaseTranscriptPhase {
  readonly id: Exclude<AgentPhaseId, 'working'>
  readonly label: string
  readonly activityText: string
  readonly status: PersistedPhaseStatus
  readonly elapsedMs: number
  readonly summary?: string
  readonly planJson?: JsonValue
  readonly planSet?: JsonValue
  readonly qaPlan?: JsonValue
  readonly pendingUserQuestion?: PendingUserQuestionRequest
  readonly tools: readonly PersistedPhaseTranscriptTool[]
}

export interface PersistedPhaseTranscript {
  readonly version: 1
  readonly phases: readonly PersistedPhaseTranscriptPhase[]
}

export type AgentPhaseLabel = string

export interface AgentPhaseState {
  readonly label: AgentPhaseLabel
  readonly startedAt: number
}

export interface AgentPhaseEventPayload {
  readonly sessionId: SessionId
  readonly phase: AgentPhaseState | null
}
