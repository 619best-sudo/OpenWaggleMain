import type { AgentSendPayload } from '@shared/types/agent'
import type { SessionId } from '@shared/types/brand'
import type { MachineExecutionState } from '@shared/types/machine'
import type { SessionResumeState } from '@shared/types/resume'
import type { SkillDiscoveryItem } from '@shared/types/standards'
import type { TeammateDefinition } from '@shared/types/teammate'
import type { WaggleCollaborationStatus, WaggleConfig } from '@shared/types/waggle'
import type { LexicalNode } from 'lexical'
import { $createParagraphNode, $createTextNode, $getRoot, $isElementNode } from 'lexical'
import type { AgentChatStatus, AgentCompactionStatus } from '@/features/chat/hooks/useAgentChat'
import type { useStreamingPhase } from '@/features/chat/hooks/useStreamingPhase'
import { $createMcpMentionNode, $createSkillMentionNode } from '@/features/composer/components'
import { replaceComposerText } from '@/features/composer/lib/set-composer-text'
import { useComposerStore } from '@/features/composer/state'
import type { TuringFollowUpSuggestion } from '@/features/waggle/lib/turing-follow-up'
import { useUIStore } from '@/shell/ui-store'
import type { SessionForkTarget } from '../lib/session-fork-targets'
import type { ChatComposerSectionState } from '../model'

export interface ComposerSectionParams {
  readonly isLoading: boolean
  readonly isSteering: boolean
  readonly status: AgentChatStatus
  readonly compactionStatus: AgentCompactionStatus | null
  readonly machineModeEnabled: boolean
  readonly machineStatus: 'idle' | 'running'
  readonly machinePlan: MachineExecutionState | null
  readonly activeTeammate: TeammateDefinition | null
  readonly teamStatus: 'idle' | 'running'
  readonly activeSessionId: SessionId | null
  readonly waggleStatus: WaggleCollaborationStatus
  readonly followUpSuggestion: TuringFollowUpSuggestion | null
  readonly resumeState: SessionResumeState | null
  readonly resumeBusy: boolean
  readonly onResumeRun: (answer?: string) => void
  readonly onDismissResume: () => void
  readonly commandPaletteOpen: boolean
  readonly slashSkills: readonly SkillDiscoveryItem[]
  readonly forkSelectorOpen: boolean
  readonly forkTargets: readonly SessionForkTarget[]
  readonly phase: ReturnType<typeof useStreamingPhase>
  readonly stop: () => void
  readonly showToast: (message: string) => void
  readonly handleSteer: (messageId: string) => Promise<void>
  readonly handleSendWithWaggle: (payload: AgentSendPayload) => Promise<void>
  readonly handleUseFollowUpPrompt: (suggestion: TuringFollowUpSuggestion) => void
  readonly handleStartWaggle: (config: WaggleConfig) => void
  readonly handleStartTeam: (teammate: TeammateDefinition) => void
  readonly handleSetMachineModeEnabled: (enabled: boolean) => void
  readonly handleStopCollaboration: () => void
  readonly handleClearTeamMode: () => void
  readonly handleSkipBranchSummary: () => void
  readonly handleSummarizeBranch: () => void
  readonly handleStartCustomBranchSummary: () => void
  readonly handleCancelBranchSummary: () => void
  readonly handleOpenForkSelector: () => void
  readonly handleCloseForkSelector: () => void
  readonly handleSelectForkTarget: (target: SessionForkTarget) => void
  readonly handleCloneToNewSession: () => void
}

export function useComposerSection(params: ComposerSectionParams): ChatComposerSectionState {
  const {
    isLoading,
    isSteering,
    status,
    compactionStatus,
    machineModeEnabled,
    machineStatus,
    machinePlan,
    activeTeammate,
    teamStatus,
    activeSessionId,
    waggleStatus,
    followUpSuggestion,
    resumeState,
    resumeBusy,
    onResumeRun,
    onDismissResume,
    commandPaletteOpen,
    slashSkills,
    forkSelectorOpen,
    forkTargets,
    phase,
    stop,
    showToast,
    handleSteer,
    handleSendWithWaggle,
    handleUseFollowUpPrompt,
    handleStartWaggle,
    handleStartTeam,
    handleSetMachineModeEnabled,
    handleStopCollaboration,
    handleClearTeamMode,
    handleSkipBranchSummary,
    handleSummarizeBranch,
    handleStartCustomBranchSummary,
    handleCancelBranchSummary,
    handleOpenForkSelector,
    handleCloseForkSelector,
    handleSelectForkTarget,
    handleCloneToNewSession,
  } = params

  /**
   * Insert a mention badge into the composer at the palette trigger, preserving
   * the rest of the draft. The text-content listener in KeyboardPlugin opens
   * the palette when the draft ends with `/` or `#` (or is exactly that
   * character), and the trigger that opened it is stored in `useUIStore`. We
   * strip just that trigger — bare or `… /`-style trailing — instead of
   * clearing the editor (the old root.clear() wiped everything the user had
   * typed). When the preceding character isn't whitespace (e.g. `green/`) we
   * also prepend a space: the run pipeline's skill-reference regex requires a
   * word boundary before `/`/`#`, so the badge would otherwise render fine but
   * the run would silently skip it. Returns false when no Lexical editor is
   * mounted (fallback path).
   */
  function insertMentionIntoEditor(buildMention: () => LexicalNode): boolean {
    const composerStore = useComposerStore.getState()
    const editor = composerStore.lexicalEditor
    if (!editor) return false
    // The trigger character opens the palette; we strip the matching one from
    // the editor. Default to `/` if nothing was recorded (e.g. some race where
    // the store was cleared before the click landed).
    const trigger = useUIStore.getState().commandPaletteTrigger ?? '/'

    editor.update(() => {
      const root = $getRoot()
      const textNodes = root.getAllTextNodes()
      const lastText = textNodes[textNodes.length - 1]
      let needsLeadingSpace = false
      if (lastText) {
        const content = lastText.getTextContent()
        if (content === trigger) {
          lastText.remove()
        } else if (content.endsWith(` ${trigger}`)) {
          lastText.spliceText(content.length - 2, 2, '')
        } else if (content.length > 0 && !/\s/.test(content[content.length - 1])) {
          // The user typed the trigger directly after a word (e.g. "green#") —
          // strip the trigger and remember to inject a space so the parser can
          // match.
          if (content.endsWith(trigger)) {
            lastText.setTextContent(content.slice(0, -1))
          }
          needsLeadingSpace = true
        }
      }
      const lastChild = root.getLastChild()
      const paragraph = $isElementNode(lastChild) ? lastChild : $createParagraphNode()
      if (paragraph !== lastChild) {
        root.append(paragraph)
      }
      paragraph.append(
        ...(needsLeadingSpace ? [$createTextNode(' ')] : []),
        buildMention(),
        $createTextNode(' '),
      )
      root.selectEnd()
    })
    editor.focus()
    return true
  }

  /** Plain-text fallback when no Lexical editor is available. */
  function appendMentionToFallbackInput(mentionText: string) {
    const composerStore = useComposerStore.getState()
    const current = composerStore.input
    const trigger = useUIStore.getState().commandPaletteTrigger ?? '/'
    // Strip the trigger the same way the editor path does — exact trigger, a
    // trailing `… /`/`… #`, or the glued-on `green/`/`green#` case.
    let base: string
    if (current === trigger) base = ''
    else if (current.endsWith(` ${trigger}`)) base = current.slice(0, -2)
    else if (current.endsWith(trigger)) base = current.slice(0, -1)
    else base = current
    const nextInput = `${base}${base.length > 0 && !/\s$/.test(base) ? ' ' : ''}${mentionText}`
    composerStore.setInput(nextInput)
    composerStore.setCursorIndex(nextInput.length)
  }

  function handleSelectSkill(skillId: string, skillName?: string) {
    const inserted = insertMentionIntoEditor(() =>
      $createSkillMentionNode(skillId, skillName ?? skillId),
    )
    if (!inserted) appendMentionToFallbackInput(`/${skillId} `)
  }

  function handleSelectMcp(serverName: string) {
    const inserted = insertMentionIntoEditor(() => $createMcpMentionNode(serverName))
    if (!inserted) appendMentionToFallbackInput(`/${serverName} `)
  }

  function onUseFollowUpPrompt(suggestion: TuringFollowUpSuggestion) {
    replaceComposerText(suggestion.userPrompt)
    handleUseFollowUpPrompt(suggestion)
  }

  return {
    activeSessionId,
    machineModeEnabled,
    machineStatus,
    machinePlan,
    waggleStatus,
    followUpSuggestion,
    resumeState,
    resumeBusy,
    onResumeRun,
    onDismissResume,
    commandPaletteOpen,
    slashSkills,
    forkSelectorOpen,
    forkTargets,
    isLoading: isLoading || isSteering || phase.current !== null,
    status,
    compactionStatus,
    activeTeammate,
    teamStatus,
    onStopCollaboration: handleStopCollaboration,
    onSelectSkill: handleSelectSkill,
    onSelectMcp: handleSelectMcp,
    onStartWaggle: handleStartWaggle,
    onStartTeam: handleStartTeam,
    onSetMachineModeEnabled: handleSetMachineModeEnabled,
    onClearTeamMode: handleClearTeamMode,
    onSendWithWaggle: handleSendWithWaggle,
    onSteer: handleSteer,
    onCancel: stop,
    onToast: showToast,
    onUseFollowUpPrompt,
    onSkipBranchSummary: handleSkipBranchSummary,
    onSummarizeBranch: handleSummarizeBranch,
    onStartCustomBranchSummary: handleStartCustomBranchSummary,
    onCancelBranchSummary: handleCancelBranchSummary,
    onOpenForkSelector: handleOpenForkSelector,
    onCloseForkSelector: handleCloseForkSelector,
    onSelectForkTarget: handleSelectForkTarget,
    onCloneToNewSession: handleCloneToNewSession,
  }
}
