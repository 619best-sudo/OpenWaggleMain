import type { SessionId } from '@shared/types/brand'
import type { UIMessage } from '@shared/types/chat-ui'
import type { SessionDetail } from '@shared/types/session'
import { createRendererLogger } from '@/shared/lib/logger'
import { getUIMessageText } from '../lib/useAgentChat.utils'
import { appendMissingOptimisticUserMessages, sessionToUIMessages } from '../lib/useAgentChat.utils'
import type {
  MutableValueRef,
  PendingRunWaiter,
  SetMessagesBySessionId,
  SetRunRenderMessages,
  UpdateMessagesOptions,
} from './useAgentChat.types'

export const EMPTY_UI_MESSAGES: UIMessage[] = []
const logger = createRendererLogger('use-agent-chat-cache')

export function createPendingRunWaiter() {
  let resolveRun = () => {}
  let rejectRun = (_error: Error) => {}
  const promise = new Promise<void>((resolve, reject) => {
    resolveRun = resolve
    rejectRun = reject
  })
  return {
    promise,
    waiter: {
      resolve: resolveRun,
      reject: rejectRun,
    } satisfies PendingRunWaiter,
  }
}

export function buildSessionSnapshotKey(session: SessionDetail) {
  const lastMessage = session.messages[session.messages.length - 1]
  return `${String(session.updatedAt)}:${String(session.messages.length)}:${lastMessage ? String(lastMessage.id) : 'none'}`
}

export function buildOptimisticMessagesKey(messages: readonly UIMessage[]) {
  return messages.map((message) => message.id).join(':')
}

export function mergeSessionAndOptimisticMessages(
  session: SessionDetail,
  optimisticUserMessages: readonly UIMessage[],
) {
  return appendMissingOptimisticUserMessages(sessionToUIMessages(session), optimisticUserMessages)
}

export function getMessagesForSession(
  messagesBySessionIdRef: MutableValueRef<Map<SessionId, UIMessage[]>>,
  targetSessionId: SessionId,
) {
  return messagesBySessionIdRef.current.get(targetSessionId) ?? EMPTY_UI_MESSAGES
}

export function setMessagesForSession(
  messagesBySessionIdRef: MutableValueRef<Map<SessionId, UIMessage[]>>,
  setMessagesBySessionId: SetMessagesBySessionId,
  setRunRenderMessages: SetRunRenderMessages,
  targetSessionId: SessionId,
  nextMessages: UIMessage[],
  options: UpdateMessagesOptions = {},
) {
  const nextMessagesBySessionId = new Map(messagesBySessionIdRef.current)
  nextMessagesBySessionId.set(targetSessionId, nextMessages)
  messagesBySessionIdRef.current = nextMessagesBySessionId
  setMessagesBySessionId(nextMessagesBySessionId)

  const lastMessage = nextMessages[nextMessages.length - 1]
  const lastUserMessage = [...nextMessages].reverse().find((message) => message.role === 'user')

  logger.debug('Updated cached session messages', {
    sessionId: String(targetSessionId),
    reason: options.reason ?? 'unspecified',
    messageCount: nextMessages.length,
    lastMessageId: lastMessage?.id ?? null,
    lastMessageRole: lastMessage?.role ?? null,
    lastMessageText: lastMessage ? getUIMessageText(lastMessage) : null,
    lastUserMessageId: lastUserMessage?.id ?? null,
    lastUserMessageText: lastUserMessage ? getUIMessageText(lastUserMessage) : null,
    cacheRunSnapshot: options.cacheRunSnapshot ?? false,
  })

  if (options.cacheRunSnapshot) {
    setRunRenderMessages(targetSessionId, nextMessages)
  }
}

export function updateMessagesForSession(
  messagesBySessionIdRef: MutableValueRef<Map<SessionId, UIMessage[]>>,
  setMessagesBySessionId: SetMessagesBySessionId,
  setRunRenderMessages: SetRunRenderMessages,
  targetSessionId: SessionId,
  update: (currentMessages: UIMessage[]) => UIMessage[],
  options: UpdateMessagesOptions = {},
) {
  setMessagesForSession(
    messagesBySessionIdRef,
    setMessagesBySessionId,
    setRunRenderMessages,
    targetSessionId,
    update(getMessagesForSession(messagesBySessionIdRef, targetSessionId)),
    options,
  )
}
