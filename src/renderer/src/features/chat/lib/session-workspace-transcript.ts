import { parseJsonUnknown, safeDecodeUnknown } from '@shared/schema'
import type { SessionId, SessionNodeId } from '@shared/types/brand'
import type { UIMessage } from '@shared/types/chat-ui'
import { machinePlanSchema, type MachineExecutionState } from '@shared/types/machine'
import type { SessionWorkspace } from '@shared/types/session'
import { messagePartToUIParts } from '@/features/chat/lib/useAgentChat.utils'
import { createRendererLogger } from '@/shared/lib/logger'
import {
  getUIMessageText,
  isInternalToolHandoffAssistantText,
  isInternalMachinePlannerPromptText,
  isInternalTeamOrchestrationPromptText,
} from './chat-message-text'

const logger = createRendererLogger('session-workspace-transcript')

function reportMachineTranscriptDebug(
  hypothesisId: string,
  location: string,
  msg: string,
  data: Record<string, unknown>,
) {
  void fetch('http://127.0.0.1:7777/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'machine-no-execution',
      runId: 'renderer',
      hypothesisId,
      location,
      msg,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {})
}

function summarizeTranscriptDebugMessage(
  message: UIMessage,
  machineOriginalRequest: string | null,
  index: number,
) {
  const text = getUIMessageText(message)
  const normalizedText = text.replace(/\s+/g, ' ').trim()

  return {
    index,
    id: message.id,
    role: message.role,
    createdAt:
      message.createdAt instanceof Date ? message.createdAt.toISOString() : message.createdAt ?? null,
    partTypes: message.parts.map((part) => part.type),
    textPreview: normalizedText.slice(0, 180),
    matchesOriginalRequest: machineOriginalRequest !== null && normalizedText === machineOriginalRequest,
  }
}

function normalizeMachineRequestText(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

interface ResolveTranscriptMessagesInput {
  readonly activeSessionId: SessionId | null
  readonly activeWorkspace: SessionWorkspace | null
  readonly messages: UIMessage[]
  readonly machinePlan: MachineExecutionState | null
  readonly draftBranchSourceNodeId?: SessionNodeId | null
}

function workspaceBelongsToSession(workspace: SessionWorkspace, sessionId: SessionId) {
  return String(workspace.tree.session.id) === String(sessionId)
}

function workspacePathToMessages(workspace: SessionWorkspace, messages: UIMessage[]) {
  const messagesById = new Map(messages.map((message) => [message.id, message]))
  const workspaceMessages: UIMessage[] = []

  for (const entry of workspace.transcriptPath) {
    const message = entry.node.message
    if (!message) {
      continue
    }

    const messageId = String(message.id)
    const existingMessage = messagesById.get(messageId)
    if (existingMessage) {
      workspaceMessages.push(existingMessage)
      continue
    }

    workspaceMessages.push({
      id: messageId,
      role: message.role,
      parts: message.parts.flatMap(messagePartToUIParts),
      createdAt: new Date(message.createdAt),
      ...(message.metadata?.branchSummary || message.metadata?.compactionSummary
        ? {
            metadata: {
              ...(message.metadata.branchSummary
                ? { branchSummary: message.metadata.branchSummary }
                : {}),
              ...(message.metadata.compactionSummary
                ? { compactionSummary: message.metadata.compactionSummary }
                : {}),
            },
          }
        : {}),
    })
  }

  return workspaceMessages
}

function isViewingActiveBranchHead(workspace: SessionWorkspace) {
  const activeHeadNodeId = workspace.activeBranchId
    ? workspace.tree.branches.find((branch) => branch.id === workspace.activeBranchId)?.headNodeId
    : workspace.tree.session.lastActiveNodeId

  return (
    workspace.activeNodeId !== null &&
    activeHeadNodeId !== undefined &&
    activeHeadNodeId !== null &&
    String(workspace.activeNodeId) === String(activeHeadNodeId)
  )
}

function findLastWorkspaceMessageIndex(messages: UIMessage[], workspaceMessages: UIMessage[]) {
  const workspaceMessageIds = new Set(workspaceMessages.map((message) => message.id))

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message && workspaceMessageIds.has(message.id)) {
      return index
    }
  }

  return -1
}

function isViewingDraftBranchSource(
  workspace: SessionWorkspace,
  draftBranchSourceNodeId?: SessionNodeId | null,
) {
  return (
    workspace.activeNodeId !== null &&
    draftBranchSourceNodeId !== undefined &&
    draftBranchSourceNodeId !== null &&
    String(workspace.activeNodeId) === String(draftBranchSourceNodeId)
  )
}

function liveTailOutsideWorkspacePath(
  workspaceMessages: UIMessage[],
  messages: UIMessage[],
  lastWorkspaceMessageIndex: number,
) {
  const workspacePathMessageIds = new Set(workspaceMessages.map((message) => message.id))

  return messages
    .slice(lastWorkspaceMessageIndex + 1)
    .filter((message) => !workspacePathMessageIds.has(message.id))
}

function appendLiveTailWhenViewingHeadOrDraftSource(
  workspace: SessionWorkspace,
  workspaceMessages: UIMessage[],
  messages: UIMessage[],
  draftBranchSourceNodeId?: SessionNodeId | null,
) {
  const viewingHead = isViewingActiveBranchHead(workspace)
  const viewingDraftSource = isViewingDraftBranchSource(workspace, draftBranchSourceNodeId)
  if (!viewingHead && !viewingDraftSource) {
    return workspaceMessages
  }

  const lastWorkspaceMessageIndex = findLastWorkspaceMessageIndex(messages, workspaceMessages)
  if (lastWorkspaceMessageIndex === messages.length - 1) {
    return workspaceMessages
  }

  const tail = liveTailOutsideWorkspacePath(workspaceMessages, messages, lastWorkspaceMessageIndex)
  logger.debug('Resolved transcript live tail against workspace path', {
    workspaceMessageCount: workspaceMessages.length,
    rawMessageCount: messages.length,
    lastWorkspaceMessageId: workspaceMessages[workspaceMessages.length - 1]?.id ?? null,
    appendedTail: tail.map((message) => ({
      id: message.id,
      role: message.role,
    })),
  })
  return tail.length > 0 ? [...workspaceMessages, ...tail] : workspaceMessages
}

function extractJsonBlock(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()
  return text.trim()
}

function matchesPersistedMachinePlan(text: string, machinePlan: MachineExecutionState | null) {
  if (!machinePlan) {
    return false
  }

  let parsed: unknown
  try {
    parsed = parseJsonUnknown(extractJsonBlock(text))
  } catch {
    return false
  }

  const decoded = safeDecodeUnknown(machinePlanSchema, parsed)
  if (!decoded.success) {
    return false
  }

  return (
    decoded.data.goal.trim() === machinePlan.goal.trim() &&
    decoded.data.tasks.length === machinePlan.tasks.length &&
    decoded.data.tasks.every((task, index) => {
      const persistedTask = machinePlan.tasks[index]
      return (
        persistedTask &&
        task.id.trim() === persistedTask.id &&
        task.title.trim() === persistedTask.title &&
        task.prompt.trim() === persistedTask.prompt &&
        JSON.stringify(task.dependsOn ?? []) === JSON.stringify(persistedTask.dependsOn ?? [])
      )
    })
  )
}

function filterHiddenInternalMachineAndTeamMessages(
  messages: UIMessage[],
  machinePlan: MachineExecutionState | null,
) {
  const filteredMessages = messages.filter((message) => {
    const text = getUIMessageText(message)

    if (message.role === 'user') {
      return (
        !isInternalTeamOrchestrationPromptText(text) && !isInternalMachinePlannerPromptText(text)
      )
    }

    if (message.role === 'assistant' && matchesPersistedMachinePlan(text, machinePlan)) {
      return false
    }

    if (message.role === 'assistant' && machinePlan && isInternalToolHandoffAssistantText(text)) {
      return false
    }

    return true
  })

  if (filteredMessages.length !== messages.length) {
    // #region debug-point F:transcript-filter
    reportMachineTranscriptDebug(
      'F',
      'session-workspace-transcript.ts:filterHiddenInternalMachineAndTeamMessages',
      '[DEBUG] Filtered hidden orchestration prompts from transcript',
      {
        rawMessageCount: messages.length,
        filteredMessageCount: filteredMessages.length,
        removedMessageIds: messages
          .filter((message) => !filteredMessages.some((filteredMessage) => filteredMessage.id === message.id))
          .map((message) => ({ id: message.id, role: message.role })),
        machinePhase: machinePlan?.phase ?? null,
        machineTaskStatuses: machinePlan?.tasks.map((task) => ({ id: task.id, status: task.status })) ?? [],
      },
    )
    // #endregion
    logger.debug('Filtered hidden orchestration prompts from transcript', {
      removedMessages: messages
        .filter(
          (message) =>
            !filteredMessages.some((filteredMessage) => filteredMessage.id === message.id),
        )
        .map((message) => ({
          id: message.id,
          role: message.role,
        })),
    })
  }

  return filteredMessages
}

function reorderMachineOriginalRequestBeforeAssistantMessages(
  messages: UIMessage[],
  machinePlan: MachineExecutionState | null,
) {
  const machineOriginalRequest = machinePlan?.originalRequest
    ? normalizeMachineRequestText(machinePlan.originalRequest)
    : null
  if (!machineOriginalRequest) {
    return messages
  }

  const firstAssistantIndex = messages.findIndex((message) => message.role === 'assistant')
  if (firstAssistantIndex < 0) {
    return messages
  }

  const machineRequestIndex = messages.findIndex(
    (message, index) =>
      index > firstAssistantIndex &&
      message.role === 'user' &&
      normalizeMachineRequestText(getUIMessageText(message)) === machineOriginalRequest,
  )
  if (machineRequestIndex < 0) {
    return messages
  }

  const machineRequestMessage = messages[machineRequestIndex]
  if (!machineRequestMessage) {
    return messages
  }

  return [
    ...messages.slice(0, firstAssistantIndex),
    machineRequestMessage,
    ...messages.slice(firstAssistantIndex, machineRequestIndex),
    ...messages.slice(machineRequestIndex + 1),
  ]
}

export function resolveTranscriptMessages({
  activeSessionId,
  activeWorkspace,
  messages,
  machinePlan,
  draftBranchSourceNodeId,
}: ResolveTranscriptMessagesInput): UIMessage[] {
  if (!activeSessionId || !activeWorkspace) {
    return messages
  }

  if (!workspaceBelongsToSession(activeWorkspace, activeSessionId)) {
    return messages
  }

  const workspaceMessages = workspacePathToMessages(activeWorkspace, messages)
  if (workspaceMessages.length === 0) {
    return messages
  }

  const transcriptMessages = reorderMachineOriginalRequestBeforeAssistantMessages(
    filterHiddenInternalMachineAndTeamMessages(
      appendLiveTailWhenViewingHeadOrDraftSource(
        activeWorkspace,
        workspaceMessages,
        messages,
        draftBranchSourceNodeId,
      ),
      machinePlan,
    ),
    machinePlan,
  )
  const machineOriginalRequest = machinePlan?.originalRequest
    ? normalizeMachineRequestText(machinePlan.originalRequest)
    : null
  if (machinePlan) {
    // #region debug-point G:resolved-transcript-order
    reportMachineTranscriptDebug(
      'G',
      'session-workspace-transcript.ts:resolveTranscriptMessages',
      '[DEBUG] Resolved machine transcript message order',
      {
        sessionId: String(activeSessionId),
        rawMessageCount: messages.length,
        workspaceMessageCount: workspaceMessages.length,
        transcriptMessageCount: transcriptMessages.length,
        machinePhase: machinePlan.phase,
        machineOriginalRequest,
        rawMessages: messages.map((message, index) =>
          summarizeTranscriptDebugMessage(message, machineOriginalRequest, index),
        ),
        workspaceMessages: workspaceMessages.map((message, index) =>
          summarizeTranscriptDebugMessage(message, machineOriginalRequest, index),
        ),
        transcriptMessages: transcriptMessages.map((message, index) =>
          summarizeTranscriptDebugMessage(message, machineOriginalRequest, index),
        ),
      },
    )
    // #endregion
  }
  logger.debug('Resolved transcript messages', {
    sessionId: String(activeSessionId),
    rawMessageCount: messages.length,
    workspaceMessageCount: workspaceMessages.length,
    lastWorkspaceMessageId: workspaceMessages[workspaceMessages.length - 1]?.id ?? null,
    transcriptMessages: transcriptMessages.map((message) => ({
      id: message.id,
      role: message.role,
    })),
  })
  return transcriptMessages
}
