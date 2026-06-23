import { SessionId } from '@shared/types/brand'
import type { WaggleCollaborationStatus } from '@shared/types/waggle'
import { useEffect, useState } from 'react'
import { useAgentChat } from '@/features/chat/hooks/useAgentChat'
import { useAutoSendQueue } from '@/features/chat/hooks/useAutoSendQueue'
import { useSendMessage } from '@/features/chat/hooks/useSendMessage'
import { useStreamingPhase } from '@/features/chat/hooks/useStreamingPhase'
import { createBranchDraftSelection } from '@/features/chat/lib/branch-from-message'
import { maybeOpenBranchSummaryPrompt } from '@/features/chat/lib/branch-summary-prompt-controller'
import { replaceComposerText } from '@/features/composer/lib/set-composer-text'
import { useComposerStore } from '@/features/composer/state'
import { useSkills } from '@/features/skills/hooks'
import { useTeamModeStore } from '@/features/teammates/state/team-mode-store'
import { useWaggleChat } from '@/features/waggle/hooks'
import {
  findWagglePresetForTuringSuggestion,
  getTuringFollowUpSuggestion,
  type TuringFollowUpSuggestion,
} from '@/features/waggle/lib/turing-follow-up'
import { useWaggleLaunchPromptStore, useWaggleStore } from '@/features/waggle/state'
import { api } from '@/shared/lib/ipc'
import { createRendererLogger } from '@/shared/lib/logger'
import { reportAutoSendQueueFailure } from '../lib/queue-failure-feedback'
import type { ChatPanelSections } from '../model'
import { useBranchSummaryWorkflow } from './useBranchSummaryWorkflow'
import { useChatPanelEnvironment } from './useChatPanelEnvironment'
import { useChatSendWorkflow } from './useChatSendWorkflow'
import { useComposerSection } from './useComposerSection'
import { useSessionCopyWorkflow } from './useSessionCopyWorkflow'
import { useSteerWorkflow } from './useSteerWorkflow'
import { useTranscriptSection } from './useTranscriptSection'

const logger = createRendererLogger('chat-panel')

export function useChatPanelSections(): ChatPanelSections {
  // ── Intent-driven scroll flag ──
  const [userDidSend, setUserDidSend] = useState(false)

  function onUserDidSendConsumed() {
    setUserDidSend(false)
  }

  const env = useChatPanelEnvironment()
  const { activeSessionId, activeSession, createSession, setActiveSession, refreshSession } =
    env.chat
  const {
    activeWorkspace,
    clearDraftBranchForSession,
    commandPaletteOpen,
    draftBranch,
    handleDismissInterruptedRun,
    handleOpenProject,
    handleSelectProjectPath,
    loadSessions,
    model,
    navigate,
    openSettings,
    projectPath,
    recentProjects,
    refreshSessionWorkspace,
    setDraftBranch,
    showToast,
    thinkingLevel,
  } = env

  const {
    messages,
    sendMessage,
    sendWaggleMessage,
    isLoading,
    status,
    stop,
    steer,
    error,
    withDeferredSnapshotRefresh,
    previewSteeredUserTurn,
    streamSignalVersion,
    compactionStatus,
  } = useAgentChat(activeSessionId, activeSession, model, thinkingLevel)

  const { handleSend, handleSendText, handleSendWaggle, handleSendTeam } = useSendMessage({
    activeSessionId,
    model,
    projectPath,
    thinkingLevel,
    createSession,
    sendMessage,
    sendWaggleMessage,
    sendTeamMessage: async (payload, teammate) => {
      if (!activeSessionId) {
        throw new Error('No active session for Team(New) send.')
      }
      await api.sendTeamMessage(activeSessionId, payload, model, teammate)
    },
  })

  async function handleStarterPrompt(content: string) {
    if (!model.trim()) {
      showToast('Select a model before sending.')
      return
    }

    try {
      await handleSendText(content)
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : String(sendError)
      logger.error('Failed to send starter prompt', { error: message })
      showToast(message)
    }
  }

  useWaggleChat(activeSessionId)
  const phase = useStreamingPhase(activeSessionId)
  const { catalog } = useSkills(projectPath)

  const waggleStoreStatus = useWaggleStore((s) => s.status)
  const waggleConfig = useWaggleStore((s) => s.activeConfig)
  const waggleActiveCollaborationId = useWaggleStore((s) => s.activeCollaborationId)
  const waggleConfigSessionId = useWaggleStore((s) => s.configSessionId)
  const setWaggleConfig = useWaggleStore((s) => s.setConfig)
  const clearWaggleConfig = useWaggleStore((s) => s.clearConfig)
  const startWaggleCollaboration = useWaggleStore((s) => s.startCollaboration)
  const stopWaggleCollaboration = useWaggleStore((s) => s.stopCollaboration)
  const queueWaggleLaunchPrompt = useWaggleLaunchPromptStore((s) => s.queuePrompt)
  const activeTeammate = useTeamModeStore((s) => s.activeTeammate)
  const teamConfigSessionId = useTeamModeStore((s) => s.configSessionId)
  const teamRunningSessionId = useTeamModeStore((s) => s.runningSessionId)
  const teamStatus = useTeamModeStore((s) => s.status)
  const armActiveTeammate = useTeamModeStore((s) => s.armTeammate)
  const clearActiveTeammate = useTeamModeStore((s) => s.clear)
  const startTeamRun = useTeamModeStore((s) => s.startRun)
  const finishTeamRun = useTeamModeStore((s) => s.finishRun)

  // Scope waggle status to the active session — other sessions see 'idle'
  const waggleOwningId = waggleActiveCollaborationId ?? waggleConfigSessionId
  const waggleStatus: WaggleCollaborationStatus =
    waggleOwningId && waggleOwningId !== activeSessionId ? 'idle' : waggleStoreStatus
  const teamOwningId = teamRunningSessionId ?? teamConfigSessionId
  const scopedActiveTeammate =
    teamOwningId && activeSessionId && teamOwningId !== activeSessionId ? null : activeTeammate

  useEffect(() => {
    return api.onRunCompleted(({ sessionId }) => {
      useTeamModeStore.getState().finishRun(sessionId)
    })
  }, [])

  const sessionCopy = useSessionCopyWorkflow({
    activeSessionId,
    activeWorkspace,
    draftBranchSourceNodeId: draftBranch?.sourceNodeId ?? null,
    model,
    projectPath,
    navigate,
    setActiveSession,
    loadSessions,
    refreshSession,
    refreshSessionWorkspace,
    showToast,
  })
  const branchSummary = useBranchSummaryWorkflow({
    activeSessionId,
    activeWorkspace,
    model,
    projectPath,
    navigate,
    loadSessions,
    refreshSession,
    refreshSessionWorkspace,
    clearDraftBranchForSession,
    showToast,
  })

  function handleForkFromMessage(messageId: string) {
    void sessionCopy.forkMessageToNewSession(messageId)
  }

  function handleCloneToNewSession() {
    void sessionCopy.cloneCurrentSessionToNewSession()
  }

  const sendWorkflow = useChatSendWorkflow({
    activeSessionId,
    branchSummary,
    clearDraftBranchForSession,
    draftBranch,
    handleSend,
    handleSendTeam,
    handleSendWaggle,
    model,
    phase,
    refreshSession,
    refreshSessionWorkspace,
    sessionCopy,
    setUserDidSend,
    armActiveTeammate,
    clearActiveTeammate,
    startTeamRun,
    finishTeamRun,
    clearWaggleConfig,
    setWaggleConfig,
    showToast,
    startWaggleCollaboration,
    stop,
    stopWaggleCollaboration,
    activeTeammate: scopedActiveTeammate,
    teamOwningId,
    teamStatus,
    waggleConfig,
    waggleOwningId,
    waggleStatus,
  })

  const { isSteering, handleSteer } = useSteerWorkflow({
    activeSessionId,
    steer,
    previewSteeredUserTurn,
    withDeferredSnapshotRefresh,
    handleSendWithWaggle: sendWorkflow.sendWithWaggle,
    showToast,
  })

  useAutoSendQueue({
    sessionId: activeSessionId,
    status,
    sendMessage: handleSend,
    paused: isSteering,
    onSendFailure: (payload, sendError) => {
      reportAutoSendQueueFailure({ logger, showToast }, activeSessionId, payload, sendError)
    },
  })

  function handleBranchFromMessage(messageId: string) {
    if (!activeSessionId) {
      return
    }

    const sessionId = SessionId(String(activeSessionId))
    const previousComposerText = useComposerStore.getState().input
    const selection = createBranchDraftSelection({
      messages,
      workspace: activeWorkspace,
      messageId,
    })
    const fallbackDraftText = selection.prefillText ?? ''
    setDraftBranch({ sessionId, sourceNodeId: selection.sourceNodeId })
    const draftComposerText = branchSummary.switchComposerToDraftBranch({
      sessionId,
      sourceNodeId: selection.sourceNodeId,
      fallbackText: fallbackDraftText,
    })
    maybeOpenBranchSummaryPrompt({
      sessionId,
      sourceNodeId: selection.sourceNodeId,
      restoreSelection: {
        branchId: activeWorkspace?.activeBranchId ?? null,
        nodeId: activeWorkspace?.activeNodeId ?? null,
      },
      previousComposerText,
      draftComposerText,
      activeWorkspace,
      projectPath,
    })
    void navigate({
      to: '/sessions/$sessionId',
      params: { sessionId: String(sessionId) },
      search: (previous) => ({
        ...previous,
        branch: undefined,
        node: String(selection.routeNodeId),
      }),
    })

    void refreshSessionWorkspace(sessionId, { nodeId: selection.routeNodeId })
  }

  const transcript = useTranscriptSection({
    messages,
    isLoading,
    isSteering,
    error,
    projectPath,
    recentProjects,
    activeSessionId,
    activeSession,
    model,
    waggleStatus,
    phase,
    handleOpenProject,
    handleSelectProjectPath,
    handleSendText: handleStarterPrompt,
    openSettings,
    handleDismissInterruptedRun,
    handleBranchFromMessage,
    handleForkFromMessage,
    userDidSend,
    onUserDidSendConsumed,
    streamSignalVersion,
  })

  const followUpSuggestion = getTuringFollowUpSuggestion({
    messages: transcript.messages,
    waggleStatus,
    config: waggleConfig,
  })

  async function handleUseFollowUpPrompt(suggestion: TuringFollowUpSuggestion) {
    replaceComposerText(suggestion.userPrompt)

    if (!projectPath || !activeSessionId) {
      showToast('Prompt added to composer.')
      return
    }

    try {
      const presets = await api.listWagglePresets(projectPath)
      const matchedPreset = findWagglePresetForTuringSuggestion(presets, suggestion)

      if (!matchedPreset) {
        showToast('Prompt added to composer. Start the recommended Waggle before sending.')
        return
      }

      setWaggleConfig(matchedPreset.config, activeSessionId)
      clearActiveTeammate()
      queueWaggleLaunchPrompt(activeSessionId, String(matchedPreset.id), suggestion.userPrompt)
      showToast(`"${matchedPreset.name}" is ready with the suggested user prompt.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('Failed to arm suggested Waggle follow-up', { error: message })
      showToast(`Prompt added, but the suggested Waggle was not armed: ${message}`)
    }
  }

  const composer = useComposerSection({
    isLoading,
    isSteering,
    status,
    compactionStatus,
    activeTeammate: scopedActiveTeammate,
    teamStatus,
    forkSelectorOpen: sessionCopy.forkSelectorOpen,
    forkTargets: sessionCopy.forkTargets,
    activeSessionId,
    waggleStatus,
    followUpSuggestion,
    commandPaletteOpen,
    slashSkills: catalog?.skills ?? [],
    phase,
    stop: sendWorkflow.cancelRun,
    showToast,
    handleSteer,
    handleSendWithWaggle: sendWorkflow.sendWithWaggle,
    handleUseFollowUpPrompt,
    handleStartWaggle: sendWorkflow.startWaggle,
    handleStartTeam: sendWorkflow.startTeam,
    handleStopCollaboration: sendWorkflow.stopCollaboration,
    handleClearTeamMode: clearActiveTeammate,
    handleSkipBranchSummary: branchSummary.skipBranchSummary,
    handleSummarizeBranch: () => {
      void branchSummary.materializeBranchSummary()
    },
    handleStartCustomBranchSummary: branchSummary.startCustomBranchSummary,
    handleCancelBranchSummary: branchSummary.cancelBranchSummary,
    handleOpenForkSelector: sessionCopy.openForkSelector,
    handleCloseForkSelector: sessionCopy.closeForkSelector,
    handleSelectForkTarget: sessionCopy.selectForkTarget,
    handleCloneToNewSession,
  })

  return {
    transcript,
    composer,
    diff: {
      projectPath,
      onSendMessage: handleSendText,
    },
  }
}
