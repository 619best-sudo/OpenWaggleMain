import { useMessageQueueStore } from '@/features/chat/state'
import { useBranchSummaryStore } from '@/features/chat/state/branch-summary-store'
import { CommandPalette } from '@/features/command-palette/components'
import {
  ActionDialog,
  BranchSummaryPrompt,
  CompactionStatusStrip,
  Composer,
  QueuedMessages,
} from '@/features/composer/components'
import { useScopedComposerDrafts } from '@/features/composer/hooks'
import { useApplyPendingWaggleLaunchPrompt } from '@/features/waggle/hooks'
import { WaggleCollaborationStatus as WaggleCollaborationStatusBanner } from '@/features/waggle/components'
import { Button } from '@/shared/ui/Button'
import type { ChatComposerSectionState } from '../model'
import { SessionForkSelector } from './SessionForkSelector'

interface ChatComposerStackProps {
  readonly section: ChatComposerSectionState
  readonly onOpenSessionTree?: () => void
}

function noOp() {}

export function ChatComposerStack({ section, onOpenSessionTree }: ChatComposerStackProps) {
  const {
    activeSessionId,
    waggleStatus,
    followUpSuggestion,
    commandPaletteOpen,
    slashSkills,
    forkSelectorOpen,
    forkTargets,
    isLoading,
    status,
    compactionStatus,
    activeTeammate,
    teamStatus,
    onStopCollaboration,
    onSelectSkill,
    onStartWaggle,
    onStartTeam,
    onClearTeamMode,
    onSendWithWaggle,
    onSteer,
    onCancel,
    onToast,
    onUseFollowUpPrompt,
    onSkipBranchSummary,
    onSummarizeBranch,
    onStartCustomBranchSummary,
    onCancelBranchSummary,
    onOpenForkSelector,
    onCloseForkSelector,
    onSelectForkTarget,
    onCloneToNewSession,
  } = section

  useScopedComposerDrafts(activeSessionId)
  useApplyPendingWaggleLaunchPrompt(activeSessionId)

  const enqueue = useMessageQueueStore((s) => s.enqueue)
  const branchSummaryMode = useBranchSummaryStore((s) => s.prompt?.mode ?? null)
  const composerDisabledForBranchSummary =
    branchSummaryMode === 'choice' || branchSummaryMode === 'summarizing'
  const composerPlaceholder =
    branchSummaryMode === 'custom' ? 'Custom instructions for the branch summary' : undefined

  return (
    <>
      <WaggleCollaborationStatusBanner
        currentSessionId={activeSessionId}
        onStop={waggleStatus !== 'idle' ? onStopCollaboration : noOp}
        followUpSuggestion={followUpSuggestion}
        onUseFollowUpPrompt={onUseFollowUpPrompt}
      />

      {activeTeammate ? (
        <div className="mx-auto mb-2 w-full max-w-[960px] px-5">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg-secondary/50 px-4 py-3">
            <div className="text-[13px] text-text-secondary">
              <span className="font-semibold text-text-primary">Team(New): {activeTeammate.name}</span>{' '}
              {teamStatus === 'running'
                ? 'is running in this session.'
                : 'is armed. Send your own prompt to use it.'}
            </div>
            <Button variant="ghost" size="sm" onClick={onClearTeamMode}>
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      {commandPaletteOpen && (
        <div className="mx-auto w-full max-w-[960px] px-5 pb-2">
          <CommandPalette
            slashSkills={slashSkills}
            onSelectSkill={onSelectSkill}
            onStartWaggle={onStartWaggle}
            onStartTeam={onStartTeam}
            onOpenSessionTree={onOpenSessionTree}
            onForkToNewSession={onOpenForkSelector}
            onCloneToNewSession={onCloneToNewSession}
          />
        </div>
      )}

      <SessionForkSelector
        open={forkSelectorOpen}
        targets={forkTargets}
        onSelect={onSelectForkTarget}
        onClose={onCloseForkSelector}
      />

      <div className="mx-auto w-full max-w-[960px] px-5 pb-5" data-chat-composer-form="true">
        {compactionStatus ? (
          <CompactionStatusStrip state={compactionStatus} onCancel={onCancel} />
        ) : null}
        <QueuedMessages
          sessionId={activeSessionId}
          onSteer={onSteer}
          isStreaming={status === 'streaming' || status === 'submitted'}
          isCompacting={status === 'compacting' || status === 'retrying'}
        />
        <BranchSummaryPrompt
          onNoSummary={onSkipBranchSummary}
          onSummarize={onSummarizeBranch}
          onCustomSummary={onStartCustomBranchSummary}
          onCancel={onCancelBranchSummary}
        />
        <Composer
          onSend={onSendWithWaggle}
          onEnqueue={(payload) => {
            if (activeSessionId) {
              enqueue(activeSessionId, payload)
            }
          }}
          onCancel={onCancel}
          isLoading={isLoading}
          mode={{
            disabled: composerDisabledForBranchSummary,
            placeholder: composerPlaceholder,
            requiresText: branchSummaryMode === 'custom',
            clearOnSubmit: branchSummaryMode !== 'custom',
            recordHistory: branchSummaryMode !== 'custom',
            allowEnqueue: branchSummaryMode !== 'custom',
            sendTitle: branchSummaryMode === 'custom' ? 'Summarize branch' : undefined,
          }}
          onToast={onToast}
        />
        <ActionDialog onToast={onToast} />
      </div>
    </>
  )
}
