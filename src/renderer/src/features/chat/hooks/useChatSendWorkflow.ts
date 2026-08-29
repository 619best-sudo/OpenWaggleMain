import type { AgentSendPayload } from '@shared/types/agent'
import type { SessionId, SupportedModelId } from '@shared/types/brand'
import type { TeammateDefinition } from '@shared/types/teammate'
import type { WaggleCollaborationStatus, WaggleConfig } from '@shared/types/waggle'
import { useBranchSummaryStore } from '@/features/chat/state/branch-summary-store'
import { parseCompactCommand, parseSessionCopyCommand } from '@/features/composer/commands'
import { api } from '@/shared/lib/ipc'
import type { useBranchSummaryWorkflow } from './useBranchSummaryWorkflow'
import type { useSessionCopyWorkflow } from './useSessionCopyWorkflow'

interface ChatSendWorkflowParams {
  readonly activeSessionId: SessionId | null
  readonly branchSummary: ReturnType<typeof useBranchSummaryWorkflow>
  readonly clearDraftBranchForSession: (sessionId: SessionId) => void
  readonly draftBranch: Parameters<
    ReturnType<typeof useBranchSummaryWorkflow>['materializeDraftBranchForSend']
  >[0]
  readonly handleSend: (payload: AgentSendPayload) => Promise<void>
  /**
   * @deprecated The Machine toggle no longer routes here — it sends through
   * `handleSend` with `planMode: true`. Retained so the standalone
   * `sendMachineMessage` IPC + `machine-run-service` pipeline stays callable
   * while it is being retired.
   */
  readonly handleSendMachine: (
    payload: AgentSendPayload,
    targetSessionId?: SessionId | null,
  ) => Promise<void>
  readonly handleSendWaggle: (
    payload: AgentSendPayload,
    config: WaggleConfig,
    targetSessionId?: SessionId | null,
  ) => Promise<void>
  readonly handleSendTeam: (
    payload: AgentSendPayload,
    teammate: TeammateDefinition,
    targetSessionId?: SessionId | null,
  ) => Promise<void>
  readonly model: SupportedModelId
  readonly phase: { readonly reset: () => void }
  readonly refreshSession: (sessionId: SessionId) => Promise<void>
  readonly refreshSessionWorkspace: (sessionId: SessionId) => Promise<void>
  readonly sessionCopy: ReturnType<typeof useSessionCopyWorkflow>
  readonly setUserDidSend: (value: boolean) => void
  readonly armActiveTeammate: (teammate: TeammateDefinition, sessionId: SessionId | null) => void
  readonly clearActiveTeammate: () => void
  readonly startTeamRun: (sessionId: SessionId, teammate: TeammateDefinition) => void
  readonly finishTeamRun: (sessionId: SessionId) => void
  readonly setMachineModeEnabled: (enabled: boolean, sessionId: SessionId | null) => void
  readonly startMachineRun: (sessionId: SessionId) => void
  readonly finishMachineRun: (sessionId: SessionId) => void
  readonly clearMachineMode: () => void
  readonly clearWaggleConfig: () => void
  readonly setWaggleConfig: (config: WaggleConfig, sessionId: SessionId | null) => void
  readonly showToast: (message: string) => void
  readonly startWaggleCollaboration: (sessionId: SessionId, config: WaggleConfig) => void
  readonly stop: () => void
  readonly stopWaggleCollaboration: () => void
  readonly machineModeEnabled: boolean
  readonly machineOwningId: SessionId | null
  readonly machineStatus: 'idle' | 'running'
  readonly activeTeammate: TeammateDefinition | null
  readonly teamOwningId: SessionId | null
  readonly teamStatus: 'idle' | 'running'
  readonly waggleConfig: WaggleConfig | null
  readonly waggleOwningId: SessionId | null
  readonly waggleStatus: WaggleCollaborationStatus
}

async function compactSession(params: ChatSendWorkflowParams, customInstructions?: string) {
  if (!params.activeSessionId) {
    params.showToast('Nothing to compact yet.')
    return
  }

  try {
    await api.compactSession(params.activeSessionId, params.model, customInstructions)
    await Promise.all([
      params.refreshSession(params.activeSessionId),
      params.refreshSessionWorkspace(params.activeSessionId),
    ])
  } catch (error) {
    params.showToast(error instanceof Error ? error.message : String(error))
  }
}

async function handleSendCommand(params: ChatSendWorkflowParams, text: string) {
  const branchSummaryPrompt = useBranchSummaryStore.getState().prompt
  if (branchSummaryPrompt?.mode === 'custom') {
    await params.branchSummary.materializeBranchSummary(text)
    return true
  }

  const compactCommand = parseCompactCommand(text)
  if (compactCommand) {
    await compactSession(params, compactCommand.customInstructions)
    return true
  }

  const sessionCopyCommand = parseSessionCopyCommand(text)
  if (sessionCopyCommand?.type === 'fork') {
    params.sessionCopy.openForkSelector()
    return true
  }
  if (sessionCopyCommand?.type === 'clone') {
    await params.sessionCopy.cloneCurrentSessionToNewSession()
    return true
  }
  return false
}

function activeWaggleConfigForSend(params: ChatSendWorkflowParams): WaggleConfig | null {
  if (!params.waggleConfig) return null
  if (params.waggleStatus !== 'idle') return null
  if (
    params.waggleOwningId &&
    params.activeSessionId &&
    params.waggleOwningId !== params.activeSessionId
  ) {
    return null
  }
  return params.waggleConfig
}

async function sendThroughActiveMode(params: ChatSendWorkflowParams, payload: AgentSendPayload) {
  if (machineModeEnabledForSend(params)) {
    // Machine mode IS plan mode: the run decomposes the request, surfaces the
    // plan for approval, and executes it step by step. It rides the normal send
    // path with `planMode` set rather than a parallel pipeline, so plan review,
    // tool permissions, streaming and persistence all stay on one code path.
    const targetSessionId = params.activeSessionId ?? params.machineOwningId
    if (targetSessionId) {
      params.startMachineRun(targetSessionId)
    }
    await params.handleSend({ ...payload, planMode: true })
    return
  }
  const waggleConfig = activeWaggleConfigForSend(params)
  if (waggleConfig) {
    const targetSessionId = params.activeSessionId ?? params.waggleOwningId
    if (targetSessionId) {
      params.startWaggleCollaboration(targetSessionId, waggleConfig)
    }
    await params.handleSendWaggle(payload, waggleConfig, targetSessionId)
    return
  }
  const teammate = activeTeammateForSend(params)
  if (teammate) {
    const targetSessionId = params.activeSessionId ?? params.teamOwningId
    if (targetSessionId) {
      params.startTeamRun(targetSessionId, teammate)
    }
    await params.handleSendTeam(payload, teammate, targetSessionId)
    return
  }
  await params.handleSend(payload)
}

function machineModeEnabledForSend(params: ChatSendWorkflowParams) {
  if (!params.machineModeEnabled) return false
  if (
    params.machineOwningId &&
    params.activeSessionId &&
    params.machineOwningId !== params.activeSessionId
  ) {
    return false
  }
  return true
}

function activeTeammateForSend(params: ChatSendWorkflowParams): TeammateDefinition | null {
  if (!params.activeTeammate) return null
  if (
    params.teamOwningId &&
    params.activeSessionId &&
    params.teamOwningId !== params.activeSessionId
  ) {
    return null
  }
  return params.activeTeammate
}

export function useChatSendWorkflow(params: ChatSendWorkflowParams) {
  return {
    async sendWithWaggle(payload: AgentSendPayload) {
      if (await handleSendCommand(params, payload.text)) return
      const draftBranchReady = await params.branchSummary.materializeDraftBranchForSend(
        params.draftBranch,
      )
      if (!draftBranchReady) return

      params.setUserDidSend(true)
      params.phase.reset()
      try {
        await sendThroughActiveMode(params, payload)
        if (params.activeSessionId) params.clearDraftBranchForSession(params.activeSessionId)
      } catch (error) {
        params.setUserDidSend(false)
        throw error
      }
    },
    cancelRun() {
      // Machine mode now rides the normal run, so `params.stop()` below is what
      // actually cancels it — `api.cancelMachine` would target the separate
      // machine pipeline this no longer uses. Reset the run STATUS but leave the
      // toggle enabled: the user cancelled a run, not the mode. (`clearMachineMode`
      // here used to switch Machine off behind their back on every cancel.)
      if (
        params.activeSessionId &&
        params.machineStatus === 'running' &&
        params.machineOwningId === params.activeSessionId
      ) {
        params.finishMachineRun(params.activeSessionId)
      }
      if (params.activeSessionId && params.waggleStatus !== 'idle') {
        api.cancelWaggle(params.activeSessionId)
        params.stopWaggleCollaboration()
      }
      if (
        params.activeSessionId &&
        params.teamStatus === 'running' &&
        params.teamOwningId === params.activeSessionId
      ) {
        api.cancelTeam(params.activeSessionId)
        params.finishTeamRun(params.activeSessionId)
      }
      params.stop()
    },
    startWaggle(config: WaggleConfig) {
      params.clearMachineMode()
      params.clearActiveTeammate()
      params.setWaggleConfig(config, params.activeSessionId)
    },
    startTeam(teammate: TeammateDefinition) {
      params.clearMachineMode()
      params.clearWaggleConfig()
      params.armActiveTeammate(teammate, params.activeSessionId)
    },
    setMachineModeEnabled(enabled: boolean) {
      if (enabled) {
        params.clearWaggleConfig()
        params.clearActiveTeammate()
      }
      params.setMachineModeEnabled(enabled, params.activeSessionId)
    },
    stopCollaboration() {
      if (params.activeSessionId) api.cancelWaggle(params.activeSessionId)
      params.stopWaggleCollaboration()
    },
  }
}
