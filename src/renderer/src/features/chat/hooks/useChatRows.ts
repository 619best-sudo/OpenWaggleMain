import type { SessionId } from '@shared/types/brand'
import type { UIMessage } from '@shared/types/chat-ui'
import type { SupportedModelId } from '@shared/types/llm'
import type { MachineExecutionState } from '@shared/types/machine'
import type { SessionInterruptedRun } from '@shared/types/session'
import type { AgentTransportPhaseEndEvent } from '@shared/types/stream'
import type { PendingUserQuestionRequest } from '@shared/types/user-question'
import type { WaggleMessageMetadata } from '@shared/types/waggle'
import { useMemo } from 'react'
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
  // Row building is O(messages × parts) and the result is handed to memoized
  // row components — recomputing it on every render would both burn CPU and
  // defeat those memos by handing out fresh row objects each time.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dependencies are listed field-by-field on purpose; `inputs` is a fresh object literal every render.
  return useMemo(
    () =>
      buildChatRows({
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
      }),
    [
      inputs.messages,
      inputs.allMessages,
      inputs.machinePlan,
      inputs.isLoading,
      inputs.error,
      inputs.lastUserMessage,
      inputs.dismissedError,
      inputs.sessionId,
      inputs.waggleMetadataLookup,
      // `phase` is a fresh handle object on every render; depend on the fields
      // row building actually reads so the memo can hold.
      //
      // Deliberately NOT `elapsedMs` / `totalElapsedMs`: those tick once a
      // second while a phase runs, and no row renders them (the indicator shows
      // label + loader; the run summary computes its total once, at completion).
      // Depending on them rebuilt every row once a second on top of the
      // per-batch rebuilds while streaming.
      inputs.phase.current?.label,
      inputs.phase.completed,
      inputs.phase.completedAtMs,
      inputs.interruptedRun,
      inputs.pendingUserQuestionRequest,
      inputs.livePhaseEvents,
    ],
  )
}
