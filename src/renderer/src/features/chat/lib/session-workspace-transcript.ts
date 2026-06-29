import type { SessionId, SessionNodeId } from '@shared/types/brand'
import type { UIMessage } from '@shared/types/chat-ui'
import type { SessionWorkspace } from '@shared/types/session'
import { createRendererLogger } from '@/shared/lib/logger'
import { messagePartToUIParts } from '@/features/chat/lib/useAgentChat.utils'
import { getUIMessageText, isInternalTeamOrchestrationPromptText } from './chat-message-text'

const logger = createRendererLogger('session-workspace-transcript')

interface ResolveTranscriptMessagesInput {
  readonly activeSessionId: SessionId | null
  readonly activeWorkspace: SessionWorkspace | null
  readonly messages: UIMessage[]
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

function filterHiddenInternalTeamMessages(messages: UIMessage[]) {
  const filteredMessages = messages.filter((message) => {
    if (message.role !== 'user') {
      return true
    }
    return !isInternalTeamOrchestrationPromptText(getUIMessageText(message))
  })

  if (filteredMessages.length !== messages.length) {
    logger.debug('Filtered internal Team orchestration prompts from transcript', {
      removedMessages: messages
        .filter((message) =>
          message.role === 'user' && isInternalTeamOrchestrationPromptText(getUIMessageText(message)),
        )
        .map((message) => ({
          id: message.id,
          role: message.role,
        })),
    })
  }

  return filteredMessages
}

export function resolveTranscriptMessages({
  activeSessionId,
  activeWorkspace,
  messages,
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

  const transcriptMessages = filterHiddenInternalTeamMessages(
    appendLiveTailWhenViewingHeadOrDraftSource(
    activeWorkspace,
    workspaceMessages,
    messages,
    draftBranchSourceNodeId,
    ),
  )
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
