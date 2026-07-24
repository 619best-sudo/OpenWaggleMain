import { SessionId } from '@shared/types/brand'
import type { AgentTransportPhaseEndEvent } from '@shared/types/stream'
import type { PendingUserQuestionRequest } from '@shared/types/user-question'
import type { WaggleCollaborationStatus } from '@shared/types/waggle'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAgentChat } from '@/features/chat/hooks/useAgentChat'
import { useAutoSendQueue } from '@/features/chat/hooks/useAutoSendQueue'
import { useSendMessage } from '@/features/chat/hooks/useSendMessage'
import { useStreamingPhase } from '@/features/chat/hooks/useStreamingPhase'
import { createBranchDraftSelection } from '@/features/chat/lib/branch-from-message'
import { maybeOpenBranchSummaryPrompt } from '@/features/chat/lib/branch-summary-prompt-controller'
import { replaceComposerText } from '@/features/composer/lib/set-composer-text'
import { useComposerStore } from '@/features/composer/state'
import { parseMachineExecutionState } from '@/features/machine/lib/machine-ui-state'
import { useMachineModeStore } from '@/features/machine/state/machine-mode-store'
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
import {
  findLatestPendingToolPermissionRequest,
  type PendingToolPermissionRequest,
} from '../lib/tool-permission-request'
import type { ChatPanelSections } from '../model'
import { useBranchSummaryWorkflow } from './useBranchSummaryWorkflow'
import { useChatPanelEnvironment } from './useChatPanelEnvironment'
import { useChatSendWorkflow } from './useChatSendWorkflow'
import { useComposerSection } from './useComposerSection'
import { useSessionCopyWorkflow } from './useSessionCopyWorkflow'
import { useSteerWorkflow } from './useSteerWorkflow'
import { useTranscriptSection } from './useTranscriptSection'

const logger = createRendererLogger('chat-panel')
const TOOL_PERMISSION_REQUEST_EVENT = 'openwaggle:tool-permission:request'
const TOOL_PERMISSION_RESOLVED_EVENT = 'openwaggle:tool-permission:resolved'
const USER_QUESTION_REQUEST_EVENT = 'openwaggle:user-question:request'
const USER_QUESTION_RESOLVED_EVENT = 'openwaggle:user-question:resolved'

function isPendingToolPermissionRequest(value: unknown): value is PendingToolPermissionRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    'toolCallId' in value &&
    'toolName' in value &&
    'input' in value &&
    typeof value.toolCallId === 'string' &&
    typeof value.toolName === 'string'
  )
}

function toLivePendingToolPermissionRequest(value: unknown): PendingToolPermissionRequest | null {
  if (!isPendingToolPermissionRequest(value)) {
    return null
  }
  return {
    ...value,
    messageId: typeof value.messageId === 'string' ? value.messageId : `live:${value.toolCallId}`,
    summary: typeof value.summary === 'string' ? value.summary : '',
  }
}

function isPendingUserQuestionRequest(value: unknown): value is PendingUserQuestionRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    'phase' in value &&
    'question' in value &&
    typeof value.phase === 'string' &&
    typeof value.question === 'string'
  )
}

export function useChatPanelSections(): ChatPanelSections {
  // ── Intent-driven scroll flag ──
  const [userDidSend, setUserDidSend] = useState(false)
  const [dismissedToolPermissionIds, setDismissedToolPermissionIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [toolPermissionBusy, setToolPermissionBusy] = useState(false)
  const [toolPermissionError, setToolPermissionError] = useState<string | null>(null)
  const [suppressedToolPermissionId, setSuppressedToolPermissionId] = useState<string | null>(null)
  const [livePendingToolPermissionRequest, setLivePendingToolPermissionRequest] =
    useState<PendingToolPermissionRequest | null>(null)
  const [liveCompletedPhases, setLiveCompletedPhases] = useState<
    readonly AgentTransportPhaseEndEvent[]
  >([])
  const [pendingUserQuestionRequest, setPendingUserQuestionRequest] =
    useState<PendingUserQuestionRequest | null>(null)
  const pendingToolPermissionVersionRef = useRef(0)
  const pendingUserQuestionVersionRef = useRef(0)

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
    resolveToolPermission,
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

  const { handleSend, handleSendText, handleSendMachine, handleSendWaggle, handleSendTeam } =
    useSendMessage({
      activeSessionId,
      model,
      projectPath,
      thinkingLevel,
      createSession,
      sendMessage,
      sendMachineMessage: async (payload) => {
        if (!activeSessionId) {
          throw new Error('No active session for Machine mode.')
        }
        await api.sendMachineMessage(activeSessionId, payload, model)
      },
      sendWaggleMessage,
      sendTeamMessage: async (payload, teammate) => {
        if (!activeSessionId) {
          throw new Error('No active session for Team send.')
        }
        await api.sendTeamMessage(activeSessionId, payload, model, teammate)
      },
      onMachineSessionResolved: (sessionId) => {
        useMachineModeStore.getState().startRun(sessionId)
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
  const machineModeEnabled = useMachineModeStore((s) => s.enabled)
  const machineConfigSessionId = useMachineModeStore((s) => s.configSessionId)
  const machineRunningSessionId = useMachineModeStore((s) => s.runningSessionId)
  const machineStoreStatus = useMachineModeStore((s) => s.status)
  const setMachineModeEnabled = useMachineModeStore((s) => s.setEnabled)
  const startMachineRun = useMachineModeStore((s) => s.startRun)
  const finishMachineRun = useMachineModeStore((s) => s.finishRun)
  const clearMachineMode = useMachineModeStore((s) => s.clear)

  // Scope waggle status to the active session — other sessions see 'idle'
  const waggleOwningId = waggleActiveCollaborationId ?? waggleConfigSessionId
  const waggleStatus: WaggleCollaborationStatus =
    waggleOwningId && waggleOwningId !== activeSessionId ? 'idle' : waggleStoreStatus
  const teamOwningId = teamRunningSessionId ?? teamConfigSessionId
  const scopedActiveTeammate =
    teamOwningId && activeSessionId && teamOwningId !== activeSessionId ? null : activeTeammate
  const machineOwningId = machineRunningSessionId ?? machineConfigSessionId
  const scopedMachineModeEnabled =
    machineOwningId && activeSessionId && machineOwningId !== activeSessionId
      ? false
      : machineModeEnabled
  const activeBranchState = activeWorkspace?.activeBranchState
  const machinePlan =
    activeBranchState && activeBranchState.branchId === activeWorkspace?.activeBranchId
      ? parseMachineExecutionState(activeBranchState.uiStateJson)
      : null
  const machineStatus =
    machineOwningId && activeSessionId && machineOwningId !== activeSessionId
      ? 'idle'
      : machineStoreStatus

  useEffect(() => {
    return api.onRunCompleted(({ sessionId }) => {
      useTeamModeStore.getState().finishRun(sessionId)
      useMachineModeStore.getState().finishRun(sessionId)
      if (activeSessionId && sessionId === activeSessionId) {
        pendingToolPermissionVersionRef.current += 1
        setLivePendingToolPermissionRequest(null)
        pendingUserQuestionVersionRef.current += 1
        setPendingUserQuestionRequest(null)
      }
    })
  }, [activeSessionId])

  useEffect(() => {
    const sessionId = activeSessionId
    pendingToolPermissionVersionRef.current += 1
    setLivePendingToolPermissionRequest(null)
    setLiveCompletedPhases([])
    pendingUserQuestionVersionRef.current += 1
    setPendingUserQuestionRequest(null)
    if (sessionId === null) {
      return
    }
  }, [activeSessionId])

  useEffect(() => {
    if (!activeSessionId) {
      return
    }

    const phaseOrder = ['prepare', 'plan', 'perform', 'perfect'] as const

    return api.onAgentEvent(({ sessionId, event }) => {
      if (sessionId !== activeSessionId) {
        return
      }

      if (event.type === 'agent_start') {
        setLiveCompletedPhases([])
        return
      }

      if (event.type !== 'phase_end') {
        return
      }

      setLiveCompletedPhases((current) => {
        const next = [...current.filter((phase) => phase.phaseId !== event.phaseId), event]
        next.sort(
          (left, right) => phaseOrder.indexOf(left.phaseId) - phaseOrder.indexOf(right.phaseId),
        )
        return next
      })
    })
  }, [activeSessionId])

  useEffect(() => {
    if (!activeSessionId) {
      return
    }

    let cancelled = false
    const requestVersion = pendingUserQuestionVersionRef.current
    void api
      .getPendingUserQuestion(activeSessionId)
      .then((request) => {
        if (!cancelled && pendingUserQuestionVersionRef.current === requestVersion) {
          setPendingUserQuestionRequest(request)
        }
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [activeSessionId])

  useEffect(() => {
    if (!activeSessionId) {
      return
    }

    let cancelled = false
    const requestVersion = pendingToolPermissionVersionRef.current
    void api
      .getPendingToolPermission(activeSessionId)
      .then((request) => {
        if (!cancelled && pendingToolPermissionVersionRef.current === requestVersion) {
          setLivePendingToolPermissionRequest(toLivePendingToolPermissionRequest(request))
        }
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [activeSessionId])

  useEffect(() => {
    if (!activeSessionId) {
      return
    }

    return api.onAgentEvent(({ sessionId, event }) => {
      if (sessionId !== activeSessionId || event.type !== 'custom') {
        return
      }

      // #region debug-point R:permission-custom-event
      if (
        event.name === TOOL_PERMISSION_REQUEST_EVENT ||
        event.name === TOOL_PERMISSION_RESOLVED_EVENT
      ) {
        void fetch('http://127.0.0.1:7777/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: 'permission-flow',
            runId: 'pre-fix',
            hypothesisId: '2',
            location: 'use-chat-panel-controller.ts:onAgentEvent',
            msg: '[DEBUG] Renderer received tool permission custom event',
            data: {
              activeSessionId: String(activeSessionId),
              sessionId: String(sessionId),
              name: event.name,
              value:
                event.name === TOOL_PERMISSION_REQUEST_EVENT &&
                isPendingToolPermissionRequest(event.value)
                  ? {
                      toolCallId: event.value.toolCallId,
                      toolName: event.value.toolName,
                    }
                  : null,
            },
            ts: Date.now(),
          }),
        }).catch(() => {})
      }
      // #endregion

      if (event.name === USER_QUESTION_REQUEST_EVENT && isPendingUserQuestionRequest(event.value)) {
        pendingUserQuestionVersionRef.current += 1
        setPendingUserQuestionRequest(event.value)
        return
      }

      if (
        event.name === TOOL_PERMISSION_REQUEST_EVENT &&
        isPendingToolPermissionRequest(event.value)
      ) {
        pendingToolPermissionVersionRef.current += 1
        setLivePendingToolPermissionRequest(toLivePendingToolPermissionRequest(event.value))
        return
      }

      if (event.name === TOOL_PERMISSION_RESOLVED_EVENT) {
        pendingToolPermissionVersionRef.current += 1
        setLivePendingToolPermissionRequest(null)
        return
      }

      if (event.name === USER_QUESTION_RESOLVED_EVENT) {
        pendingUserQuestionVersionRef.current += 1
        setPendingUserQuestionRequest(null)
      }
    })
  }, [activeSessionId])

  useEffect(() => {
    if (!activeSessionId) {
      return
    }

    return api.onAgentEvent(({ sessionId, event }) => {
      if (
        sessionId !== activeSessionId ||
        event.type !== 'custom' ||
        !event.name.startsWith('machine:')
      ) {
        return
      }

      if (event.name === 'machine:run-start') {
        useMachineModeStore.getState().startRun(activeSessionId)
      }

      if (event.name === 'machine:run-end') {
        useMachineModeStore.getState().finishRun(activeSessionId)
      }

      void refreshSessionWorkspace(activeSessionId)
    })
  }, [activeSessionId, refreshSessionWorkspace])

  async function handleApproveMachinePlan() {
    if (!activeSessionId) {
      showToast('No active session for machine approval.')
      return
    }

    try {
      startMachineRun(activeSessionId)
      await api.approveMachinePlan(activeSessionId)
      await refreshSessionWorkspace(activeSessionId)
    } catch (error) {
      finishMachineRun(activeSessionId)
      showToast(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleDiscardMachinePlan() {
    if (!activeSessionId) {
      showToast('No active session for machine plan changes.')
      return
    }

    try {
      await api.discardMachinePlan(activeSessionId)
      await refreshSessionWorkspace(activeSessionId)
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error))
    }
  }

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
    handleSendMachine,
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
    setMachineModeEnabled,
    startMachineRun,
    finishMachineRun,
    clearMachineMode,
    clearWaggleConfig,
    setWaggleConfig,
    showToast,
    startWaggleCollaboration,
    stop,
    stopWaggleCollaboration,
    machineModeEnabled: scopedMachineModeEnabled,
    machineOwningId,
    machineStatus,
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
    machinePlan,
    model,
    waggleStatus,
    phase,
    handleOpenProject,
    handleSelectProjectPath,
    handleSendText: handleStarterPrompt,
    handleApproveMachinePlan,
    handleDiscardMachinePlan,
    openSettings,
    handleDismissInterruptedRun,
    pendingUserQuestionRequest,
    livePhaseEvents: liveCompletedPhases,
    handleResolveUserQuestion: async (resolution) => {
      if (!activeSessionId) {
        throw new Error('No active session for user question resolution.')
      }
      await api.resolveUserQuestion(activeSessionId, resolution)
    },
    handleBranchFromMessage,
    handleForkFromMessage,
    userDidSend,
    onUserDidSendConsumed,
    streamSignalVersion,
  })

  const latestToolPermissionRequest = findLatestPendingToolPermissionRequest(
    transcript.messages,
    dismissedToolPermissionIds,
  )
  const visibleToolPermissionRequest =
    livePendingToolPermissionRequest ?? latestToolPermissionRequest
  const pendingToolPermissionRequest =
    visibleToolPermissionRequest &&
    visibleToolPermissionRequest.toolCallId !== suppressedToolPermissionId
      ? visibleToolPermissionRequest
      : null

  const latestToolPermissionId = visibleToolPermissionRequest?.toolCallId ?? null

  useEffect(() => {
    if (!pendingToolPermissionRequest) {
      setToolPermissionBusy(false)
      setToolPermissionError(null)
    }
  }, [pendingToolPermissionRequest])

  useEffect(() => {
    if (latestToolPermissionId && latestToolPermissionId !== suppressedToolPermissionId) {
      setToolPermissionError(null)
    }
  }, [latestToolPermissionId, suppressedToolPermissionId])

  const dismissCurrentToolPermission = useMemo(
    () => () => {
      if (!latestToolPermissionId) {
        return
      }
      setSuppressedToolPermissionId(latestToolPermissionId)
      setToolPermissionBusy(false)
      setToolPermissionError(null)
    },
    [latestToolPermissionId],
  )

  async function handleResolveToolPermission(decision: 'approved' | 'denied') {
    if (!activeSessionId || !pendingToolPermissionRequest) {
      showToast('No pending tool permission request.')
      return
    }

    const currentRequest = pendingToolPermissionRequest

    setSuppressedToolPermissionId(currentRequest.toolCallId)
    setToolPermissionBusy(true)
    setToolPermissionError(null)
    // #region debug-point A:renderer-permission-submit
    void fetch('http://127.0.0.1:7779/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'tool-model-routing',
        runId: 'pre-fix',
        hypothesisId: 'A',
        location: 'use-chat-panel-controller.ts:handleResolveToolPermission',
        msg: '[DEBUG] Renderer submitted tool permission resolution',
        data: {
          decision,
          toolCallId: currentRequest.toolCallId,
          toolName: currentRequest.toolName,
          model: currentRequest.model ?? null,
        },
        ts: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
    try {
      await resolveToolPermission({
        request: {
          toolCallId: currentRequest.toolCallId,
          toolName: currentRequest.toolName,
          input: currentRequest.input,
          title: currentRequest.title,
          description: currentRequest.description,
          model: currentRequest.model,
        },
        decision,
      })
      setDismissedToolPermissionIds((current) => {
        const next = new Set(current)
        next.add(currentRequest.toolCallId)
        return next
      })
      setToolPermissionBusy(false)
    } catch (permissionError) {
      const message =
        permissionError instanceof Error ? permissionError.message : String(permissionError)
      setSuppressedToolPermissionId((current) =>
        current === currentRequest.toolCallId ? null : current,
      )
      setToolPermissionBusy(false)
      setToolPermissionError(message)
      showToast(message)
    }
  }

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
    machineModeEnabled: scopedMachineModeEnabled,
    machineStatus,
    machinePlan,
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
    handleSetMachineModeEnabled: sendWorkflow.setMachineModeEnabled,
    handleApproveMachinePlan,
    handleDiscardMachinePlan,
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
    transcript: {
      ...transcript,
      pendingToolPermissionRequest,
      toolPermissionBusy,
      toolPermissionError,
      onDismissToolPermission: dismissCurrentToolPermission,
      onApproveToolPermission: () => handleResolveToolPermission('approved'),
      onDenyToolPermission: () => handleResolveToolPermission('denied'),
    },
    composer,
    diff: {
      projectPath,
      onSendMessage: handleSendText,
    },
  }
}
