import { matchBy } from '@diegogbrisa/ts-match'
import type { SessionBranchId, SessionId } from '@shared/types/brand'
import { isLightThemeMode } from '@shared/types/settings'
import { formatElapsed } from '@/features/chat/hooks/useStreamingPhase'
import { usePreferencesStore } from '@/features/settings/state'
import { TurnDivider } from '@/features/waggle/components'
import { cn } from '@/shared/lib/cn'
import loaderGif from '../../../../../assets/loader.gif'
import lightLoaderGif from '../../../../../assets/loader-light.gif'
import type { ChatRow } from '../lib/types-chat-row'
import { BranchSummaryCard } from './BranchSummaryCard'
import { ChatErrorDisplay } from './ChatErrorDisplay'
import { CompactionSummaryCard } from './CompactionSummaryCard'
import { InterruptedRunNotice } from './InterruptedRunNotice'
import { MachineTimelineBubble } from './MachineTimelineBubble'
import { MessageBubble } from './MessageBubble'
import { PhaseTimelineCard } from './PhaseTimelineCard'
import { RunSummary } from './RunSummary'

interface ChatRowRendererProps {
  row: ChatRow
  sessionId: SessionId | null
  onOpenSettings?: () => void
  onRetry?: (content: string) => void
  onDismissError: (message: string) => void
  onDismissInterruptedRun?: (runId: string, branchId: SessionBranchId) => void
  onApproveMachinePlan?: () => Promise<void>
  onDiscardMachinePlan?: () => Promise<void>
  onBranchFromMessage?: (messageId: string) => void
  onForkFromMessage?: (messageId: string) => void
  pendingUserQuestionRequest?: import('@shared/types/user-question').PendingUserQuestionRequest | null
  onResolveUserQuestion?: (
    resolution: {
      request: import('@shared/types/user-question').PendingUserQuestionRequest
      answer: string
    },
  ) => Promise<void>
}

export function ChatRowRenderer({
  row,
  sessionId,
  onDismissError,
  onDismissInterruptedRun,
  onApproveMachinePlan,
  onDiscardMachinePlan,
  onBranchFromMessage,
  onForkFromMessage,
  pendingUserQuestionRequest,
  onResolveUserQuestion,
}: ChatRowRendererProps) {
  const themeMode = usePreferencesStore((state) => state.settings.themeMode)
  const phaseLoaderSrc = isLightThemeMode(themeMode) ? lightLoaderGif : loaderGif

  return matchBy(row, 'type')
    .with('interrupted-run', (value) => (
      <InterruptedRunNotice
        runId={value.runId}
        branchId={value.branchId}
        runMode={value.runMode}
        model={value.model}
        interruptedAt={value.interruptedAt}
        onDismiss={onDismissInterruptedRun}
      />
    ))
    .with('message', (value) => (
      <div className="flex flex-col gap-6">
        {value.showTurnDivider && value.turnDividerProps && (
          <TurnDivider
            turnNumber={value.turnDividerProps.turnNumber}
            agentLabel={value.turnDividerProps.agentLabel}
            agentColor={value.turnDividerProps.agentColor}
          />
        )}
        <MessageBubble
          message={value.message}
          sessionId={sessionId}
          waggle={value.waggle}
          run={{
            isStreaming: value.isStreaming,
            isRunActive: value.isRunActive,
            assistantModel: value.assistantModel,
          }}
          actions={{ onBranchFromMessage, onForkFromMessage }}
        />
      </div>
    ))
    .with('waggle-turn', (value) => (
      <section
        className="home-panel-frame-soft flex flex-col gap-2 rounded-lg bg-bg-secondary/15 p-2"
        data-waggle-turn={value.id}
      >
        <TurnDivider
          turnNumber={value.turnDividerProps.turnNumber}
          agentLabel={value.turnDividerProps.agentLabel}
          agentColor={value.turnDividerProps.agentColor}
        />

        <div className="flex flex-col">
          {value.messages.map((messageRow, index) => (
            <div
              key={messageRow.message.id}
              className={cn(
                'px-2 py-2',
                index > 0 && 'home-divider-t pt-2',
                index === 0 && 'rounded-md',
                index === 0 && 'bg-bg-secondary/20',
              )}
            >
              <MessageBubble
                message={messageRow.message}
                sessionId={sessionId}
                waggle={messageRow.waggle}
                run={{
                  isStreaming: messageRow.isStreaming,
                  isRunActive: messageRow.isRunActive,
                  assistantModel: messageRow.assistantModel,
                }}
                presentation={{ hideAgentLabel: true }}
                actions={{ onBranchFromMessage, onForkFromMessage }}
              />
            </div>
          ))}
        </div>
      </section>
    ))
    .with('phase', (value) => (
      <PhaseTimelineCard
        row={value}
        pendingUserQuestionRequest={pendingUserQuestionRequest}
        onResolveUserQuestion={onResolveUserQuestion}
      />
    ))
    .with('machine-timeline', (value) => (
      <MachineTimelineBubble
        plan={value.plan}
        variant={value.variant}
        onApprove={onApproveMachinePlan ?? (async () => {})}
        onDiscard={onDiscardMachinePlan ?? (async () => {})}
      />
    ))
    .with('branch-summary', (value) => (
      <BranchSummaryCard
        id={value.id}
        summary={value.summary}
        onBranchFromMessage={onBranchFromMessage}
      />
    ))
    .with('compaction-summary', (value) => (
      <CompactionSummaryCard
        id={value.id}
        summary={value.summary}
        tokensBefore={value.tokensBefore}
        onBranchFromMessage={onBranchFromMessage}
      />
    ))
    .with('phase-indicator', (value) => (
      <div className="flex items-center gap-2 py-3">
        <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-bg-secondary/20">
          <img
            src={phaseLoaderSrc}
            alt=""
            aria-hidden="true"
            data-phase-loader="true"
            className="size-7 object-contain"
          />
        </div>
        <span className="text-sm text-text-secondary">{value.label}...</span>
        {value.elapsedMs > 0 ? (
          <span className="text-sm text-text-tertiary tabular-nums">
            {formatElapsed(value.elapsedMs)}
          </span>
        ) : null}
      </div>
    ))
    .with('run-summary', (value) => (
      <RunSummary
        phases={value.phases}
        totalMs={value.totalMs}
        completedAtMs={value.completedAtMs}
      />
    ))
    .with('error', (value) => (
      <ChatErrorDisplay
        error={value.error}
        dismissedError={value.dismissedError}
        sessionId={value.sessionId}
        onDismiss={onDismissError}
      />
    ))
    .exhaustive()
}
