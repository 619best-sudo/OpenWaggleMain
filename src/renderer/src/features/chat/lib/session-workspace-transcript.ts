import { parseJsonUnknown, safeDecodeUnknown } from '@shared/schema'
import type { SessionId, SessionNodeId } from '@shared/types/brand'
import type { UIMessage } from '@shared/types/chat-ui'
import { type MachineExecutionState, machinePlanSchema } from '@shared/types/machine'
import type { SessionWorkspace } from '@shared/types/session'
import { buildToolResultLookup, messagePartToUIParts } from '@/features/chat/lib/useAgentChat.utils'
import { createRendererLogger } from '@/shared/lib/logger'
import {
  getUIMessageTextCached,
  isInternalMachinePlannerPromptText,
  isInternalTeamOrchestrationPromptText,
  isInternalToolHandoffAssistantText,
} from './chat-message-text'

const logger = createRendererLogger('session-workspace-transcript')

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
  // Tool results are persisted as their own messages along the workspace path;
  // index them across the whole path so each call part recovers its `output`.
  const toolResultByCallId = buildToolResultLookup(
    workspace.transcriptPath.map((entry) => entry.node.message).filter((message) => !!message),
  )
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
      parts: message.parts.flatMap((part) => messagePartToUIParts(part, toolResultByCallId)),
      createdAt: new Date(message.createdAt),
      ...(message.metadata?.branchSummary ||
      message.metadata?.compactionSummary ||
      message.metadata?.phaseTranscript
        ? {
            metadata: {
              ...(message.metadata.branchSummary
                ? { branchSummary: message.metadata.branchSummary }
                : {}),
              ...(message.metadata.compactionSummary
                ? { compactionSummary: message.metadata.compactionSummary }
                : {}),
              ...(message.metadata.phaseTranscript
                ? { phaseTranscript: message.metadata.phaseTranscript }
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
  if (logger.isDebugEnabled?.() === true) {
    logger.debug('Resolved transcript live tail against workspace path', {
      workspaceMessageCount: workspaceMessages.length,
      rawMessageCount: messages.length,
      lastWorkspaceMessageId: workspaceMessages[workspaceMessages.length - 1]?.id ?? null,
      appendedTail: tail.map((message) => ({
        id: message.id,
        role: message.role,
      })),
    })
  }
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

/**
 * Cached "keep this message in the transcript?" decision, keyed by message
 * identity (+ the `machinePlan` reference it was computed against).
 *
 * The filter runs on every stream event, and for each message it extracts the
 * message text and — in machine mode — runs `matchesPersistedMachinePlan`
 * (JSON.parse + decode + stringify). Repeating all of that across the whole
 * transcript every token is the O(messages) cost that makes long sessions heavy.
 * The messages array is prefix-stable while streaming, so every unchanged
 * message hits the cache and only the active message re-evaluates. `machinePlan`
 * is part of the key so a plan change invalidates correctly.
 */
interface FilterDecision {
  readonly machinePlan: MachineExecutionState | null
  readonly keep: boolean
}
const filterDecisionCache = new WeakMap<UIMessage, FilterDecision>()

function computeMessageKeep(message: UIMessage, machinePlan: MachineExecutionState | null) {
  const text = getUIMessageTextCached(message)

  if (message.role === 'user') {
    return !isInternalTeamOrchestrationPromptText(text) && !isInternalMachinePlannerPromptText(text)
  }

  if (message.role === 'assistant') {
    if (matchesPersistedMachinePlan(text, machinePlan)) {
      return false
    }
    if (machinePlan && isInternalToolHandoffAssistantText(text)) {
      return false
    }
  }

  return true
}

function keepMessageInTranscript(message: UIMessage, machinePlan: MachineExecutionState | null) {
  const cached = filterDecisionCache.get(message)
  if (cached !== undefined && cached.machinePlan === machinePlan) {
    return cached.keep
  }
  const keep = computeMessageKeep(message, machinePlan)
  filterDecisionCache.set(message, { machinePlan, keep })
  return keep
}

function filterHiddenInternalMachineAndTeamMessages(
  messages: UIMessage[],
  machinePlan: MachineExecutionState | null,
) {
  const filteredMessages = messages.filter((message) =>
    keepMessageInTranscript(message, machinePlan),
  )

  if (filteredMessages.length !== messages.length && logger.isDebugEnabled?.() === true) {
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

function toMessageTimestamp(message: UIMessage) {
  if (message.createdAt instanceof Date) {
    return message.createdAt.getTime()
  }

  if (typeof message.createdAt === 'string') {
    const parsed = Date.parse(message.createdAt)
    return Number.isNaN(parsed) ? null : parsed
  }

  return null
}

function hasHiddenInternalMachinePlannerPrompt(messages: UIMessage[]) {
  return messages.some(
    (message) =>
      message.role === 'user' &&
      isInternalMachinePlannerPromptText(getUIMessageTextCached(message)),
  )
}

function reorderMachineOriginalRequestBeforeAssistantMessages(
  messages: UIMessage[],
  machinePlan: MachineExecutionState | null,
  hadHiddenMachinePlannerPrompt: boolean,
) {
  const machineOriginalRequest = machinePlan?.originalRequest
    ? normalizeMachineRequestText(machinePlan.originalRequest)
    : null

  const firstAssistantIndex = messages.findIndex((message) => message.role === 'assistant')
  if (firstAssistantIndex < 0) {
    return messages
  }

  const machineRequestIndex =
    machineOriginalRequest !== null
      ? messages.findIndex(
          (message, index) =>
            index > firstAssistantIndex &&
            message.role === 'user' &&
            normalizeMachineRequestText(getUIMessageTextCached(message)) === machineOriginalRequest,
        )
      : hadHiddenMachinePlannerPrompt
        ? messages.findIndex((message, index) => {
            if (index <= firstAssistantIndex || message.role !== 'user') {
              return false
            }

            const firstAssistant = messages[firstAssistantIndex]
            if (!firstAssistant) {
              return false
            }

            const requestTimestamp = toMessageTimestamp(message)
            const assistantTimestamp = toMessageTimestamp(firstAssistant)

            if (requestTimestamp !== null && assistantTimestamp !== null) {
              return requestTimestamp <= assistantTimestamp
            }

            return String(message.id).startsWith('optimistic-user-')
          })
        : -1
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
  const workspaceMessages =
    activeSessionId &&
    activeWorkspace &&
    workspaceBelongsToSession(activeWorkspace, activeSessionId)
      ? workspacePathToMessages(activeWorkspace, messages)
      : []
  const baseTranscriptMessages =
    workspaceMessages.length > 0 && activeWorkspace
      ? appendLiveTailWhenViewingHeadOrDraftSource(
          activeWorkspace,
          workspaceMessages,
          messages,
          draftBranchSourceNodeId,
        )
      : messages
  const hadHiddenMachinePlannerPrompt =
    hasHiddenInternalMachinePlannerPrompt(baseTranscriptMessages)

  const transcriptMessages = reorderMachineOriginalRequestBeforeAssistantMessages(
    filterHiddenInternalMachineAndTeamMessages(baseTranscriptMessages, machinePlan),
    machinePlan,
    hadHiddenMachinePlannerPrompt,
  )
  if (logger.isDebugEnabled?.() === true) {
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
  }
  return transcriptMessages
}
