import type { RunMode } from '@shared/types/background-run'
import type { SessionBranchId, SupportedModelId } from '@shared/types/brand'
import type { UIMessage } from '@shared/types/chat-ui'
import type { MachineExecutionState } from '@shared/types/machine'
import type {
  PersistedPhaseTranscriptPhase,
  PersistedPhaseTranscriptTool,
} from '@shared/types/phase'
import type { PendingUserQuestionRequest } from '@shared/types/user-question'
import type { WaggleAgentColor, WaggleMessageMetadata } from '@shared/types/waggle'
import type { CompletedPhase } from '@/features/chat/hooks/useStreamingPhase'

// ─── Turn Divider Props ──────────────────────────────────────

export interface TurnDividerProps {
  turnNumber: number
  agentLabel: string
  agentColor: WaggleAgentColor
  agentModel?: SupportedModelId
}

// ─── Waggle Info ──────────────────────────────────────────────

export interface WaggleInfo {
  agentLabel: string
  agentColor: WaggleAgentColor
}

export interface MessageChatRow {
  type: 'message'
  message: UIMessage
  isStreaming: boolean
  isRunActive: boolean
  showTurnDivider: boolean
  turnDividerProps?: TurnDividerProps
  assistantModel?: SupportedModelId
  waggle?: WaggleInfo
  waggleMeta?: WaggleMessageMetadata
}

export interface WaggleTurnChatRow {
  type: 'waggle-turn'
  id: string
  turnDividerProps: TurnDividerProps
  agentColor: WaggleAgentColor
  messages: MessageChatRow[]
}

export interface MachineTimelineChatRow {
  type: 'machine-timeline'
  id: string
  plan: MachineExecutionState
  variant?: 'primary' | 'summary'
}

export interface PhaseTimelineToolDetail extends PersistedPhaseTranscriptTool {
  readonly toolCall?: Extract<UIMessage['parts'][number], { type: 'tool-call' }>
  readonly toolResult?: Extract<UIMessage['parts'][number], { type: 'tool-result' }>
}

export interface PhaseTimelinePhaseRow
  extends Omit<PersistedPhaseTranscriptPhase, 'tools' | 'pendingUserQuestion'> {
  readonly tools: readonly PhaseTimelineToolDetail[]
  readonly pendingUserQuestion?: PendingUserQuestionRequest
}

export interface PhaseTimelineChatRow {
  type: 'phase'
  id: string
  sourceMessageId: string
  phase: PhaseTimelinePhaseRow
}

/**
 * The run's closing summary — the harness `run_summary`, composed from every
 * hop and the only part of a run addressed to the user.
 *
 * It needs a row of its own because it is not an assistant message: the harness
 * carries it on the phase transcript, not as a text part, so suppressing phase
 * cards used to drop it entirely. On a run that changed files that only cost a
 * closing line; on a read-only run the summary IS the deliverable, so the run
 * ended on a `deliver` tool card with the answer nowhere on screen.
 */
export interface ClosingSummaryChatRow {
  type: 'closing-summary'
  id: string
  summary: string
}

// ─── ChatRow Discriminated Union ──────────────────────────

export type ChatRow =
  | {
      type: 'interrupted-run'
      runId: string
      branchId: SessionBranchId
      runMode: RunMode
      model: SupportedModelId
      interruptedAt: number
    }
  | MessageChatRow
  | WaggleTurnChatRow
  | PhaseTimelineChatRow
  | ClosingSummaryChatRow
  | MachineTimelineChatRow
  | { type: 'branch-summary'; id: string; summary: string }
  | { type: 'compaction-summary'; id: string; summary: string; tokensBefore: number }
  | { type: 'phase-indicator'; label: string; elapsedMs: number }
  | {
      type: 'run-summary'
      phases: readonly CompletedPhase[]
      totalMs: number
      completedAtMs: number | null
    }
  | {
      type: 'error'
      error: Error
      lastUserMessage: string | null
      dismissedError: string | null
      sessionId: string | null
    }
