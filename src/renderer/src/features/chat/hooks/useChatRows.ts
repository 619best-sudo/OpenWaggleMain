import type { SessionId } from '@shared/types/brand'
import type { UIMessage } from '@shared/types/chat-ui'
import type { SupportedModelId } from '@shared/types/llm'
import type { MachineExecutionState } from '@shared/types/machine'
import type { SessionInterruptedRun } from '@shared/types/session'
import type { AgentTransportPhaseEndEvent } from '@shared/types/stream'
import type { PendingUserQuestionRequest } from '@shared/types/user-question'
import type { WaggleMessageMetadata } from '@shared/types/waggle'
import type { useStreamingPhase } from '@/features/chat/hooks/useStreamingPhase'
import type { ChatRow } from '../lib/types-chat-row'
import { buildChatRows } from './useBuildChatRows'

export function useChatRows(inputs: {
  messages: UIMessage[]
  allMessages: UIMessage[]
  machinePlan: MachineExecutionState | null
  isLoading: boolean
  error: Error | undefined
  lastUserMessage: string | null
  dismissedError: string | null
  sessionId: SessionId | null
  model: SupportedModelId
  waggleMetadataLookup: Readonly<Record<string, WaggleMessageMetadata>>
  phase: ReturnType<typeof useStreamingPhase>
  interruptedRun?: SessionInterruptedRun
  pendingUserQuestionRequest?: PendingUserQuestionRequest | null
  livePhaseEvents?: readonly AgentTransportPhaseEndEvent[]
}): ChatRow[] {
  return buildChatRows({
    messages: inputs.messages,
    allMessages: inputs.allMessages,
    machinePlan: inputs.machinePlan,
    isLoading: inputs.isLoading,
    error: inputs.error,
    lastUserMessage: inputs.lastUserMessage,
    dismissedError: inputs.dismissedError,
    sessionId: inputs.sessionId,
    waggleMetadataLookup: inputs.waggleMetadataLookup,
    phase: inputs.phase,
    interruptedRun: inputs.interruptedRun,
    pendingUserQuestionRequest: inputs.pendingUserQuestionRequest,
    livePhaseEvents: inputs.livePhaseEvents,
  })
}
