import type { SessionId } from '@shared/types/brand'
import type { UIMessage } from '@shared/types/chat-ui'
import type { SessionDetail } from '@shared/types/session'
import { api } from '@/shared/lib/ipc'
import { createRendererLogger } from '@/shared/lib/logger'
import {
  appendMissingOptimisticUserMessages,
  buildPartialAssistantMessage,
  mergeBackgroundReconnectMessages,
  reconcileSnapshotUserMessages,
  sessionToUIMessages,
} from '../lib/useAgentChat.utils'
import {
  buildOptimisticMessagesKey,
  buildSessionSnapshotKey,
  getMessagesForSession,
  mergeSessionAndOptimisticMessages,
  setMessagesForSession,
  updateMessagesForSession,
} from './useAgentChat.message-cache'
import type {
  SessionHydrationContext,
  SessionHydrationInput,
  SessionHydrationKeys,
} from './useAgentChat.types'

const logger = createRendererLogger('use-agent-chat-hydration')

function getLastUserMessage(messages: readonly UIMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === 'user') {
      return message
    }
  }
  return null
}

function resolvePendingForegroundRun(context: SessionHydrationContext) {
  const pending = context.pendingRunWaiterRef.current
  context.pendingRunWaiterRef.current = null
  pending?.resolve()
}

function clearForegroundRunState(context: SessionHydrationContext) {
  context.foregroundStreamActiveRef.current = false
  context.foregroundSessionIdRef.current = null
  context.terminalRunErrorRef.current = undefined
}

export function resetMissingSessionHydration(context: SessionHydrationContext) {
  if (context.foregroundStreamActiveRef.current) {
    resolvePendingForegroundRun(context)
  }
  clearForegroundRunState(context)
  context.streamSignalVersionRef.current = 0
  context.lastHydratedSessionIdRef.current = null
  context.lastHydratedSnapshotKeyRef.current = null
  context.lastHydratedOptimisticKeyRef.current = null
  context.setStatus('ready')
  context.setCompactionStatus(null)
  context.setError(undefined)
}

function getSessionHydrationKeys(input: SessionHydrationInput, context: SessionHydrationContext) {
  const snapshotKey = buildSessionSnapshotKey(input.session)
  const optimisticKey = buildOptimisticMessagesKey(input.optimisticUserMessages)
  return {
    snapshotKey,
    optimisticKey,
    sessionChanged: context.lastHydratedSessionIdRef.current !== input.sessionId,
    snapshotChanged: context.lastHydratedSnapshotKeyRef.current !== snapshotKey,
    optimisticChanged: context.lastHydratedOptimisticKeyRef.current !== optimisticKey,
  }
}

function updateHydrationKeys(
  sessionId: SessionId,
  keys: SessionHydrationKeys,
  context: SessionHydrationContext,
) {
  context.lastHydratedSessionIdRef.current = sessionId
  context.lastHydratedSnapshotKeyRef.current = keys.snapshotKey
  context.lastHydratedOptimisticKeyRef.current = keys.optimisticKey
}

function resetSessionChangedState(keys: SessionHydrationKeys, context: SessionHydrationContext) {
  if (!keys.sessionChanged) {
    return
  }
  context.setBackgroundStreaming(false)
  context.backgroundStreamingRef.current = false
  context.backgroundReconnectSessionIdRef.current = null
  context.setCompactionStatus(null)
}

function shouldKeepForegroundHydration(
  input: SessionHydrationInput,
  keys: SessionHydrationKeys,
  context: SessionHydrationContext,
) {
  if (!context.foregroundStreamActiveRef.current) {
    return false
  }
  if (context.foregroundSessionIdRef.current !== input.sessionId) {
    resolvePendingForegroundRun(context)
    clearForegroundRunState(context)
    return false
  }
  context.lastHydratedOptimisticKeyRef.current = keys.optimisticKey
  return true
}

function shouldSkipActiveRunHydration(
  input: SessionHydrationInput,
  keys: SessionHydrationKeys,
  context: SessionHydrationContext,
) {
  return (
    context.backgroundReconnectSessionIdRef.current === input.sessionId &&
    !keys.sessionChanged &&
    !keys.snapshotChanged &&
    !keys.optimisticChanged
  )
}

function handleActiveRunReconnectResult(
  capturedSessionId: SessionId,
  nextMessages: UIMessage[] | null,
  context: SessionHydrationContext,
) {
  if (
    !nextMessages ||
    context.currentSessionIdRef.current !== capturedSessionId ||
    context.backgroundReconnectSessionIdRef.current !== capturedSessionId
  ) {
    return
  }
  logger.debug('Applying active-run reconnect result', {
    sessionId: String(capturedSessionId),
    reconnectMessageCount: nextMessages.length,
    reconnectLastUserMessageId: getLastUserMessage(nextMessages)?.id ?? null,
    cachedRenderMessageCount:
      context.messagesBySessionIdRef.current.get(capturedSessionId)?.length ?? 0,
    cachedLastUserMessageId:
      getLastUserMessage(context.messagesBySessionIdRef.current.get(capturedSessionId) ?? [])?.id ??
      null,
  })
  updateMessagesForSession(
    context.messagesBySessionIdRef,
    context.setMessagesBySessionId,
    context.setRunRenderMessages,
    capturedSessionId,
    (currentMessages) => mergeBackgroundReconnectMessages(nextMessages, currentMessages),
    { cacheRunSnapshot: true, reason: 'hydrate:background-reconnect' },
  )
}

function handleActiveRunReconnectError(
  capturedSessionId: SessionId,
  reconnectError: unknown,
  context: SessionHydrationContext,
) {
  if (context.currentSessionIdRef.current !== capturedSessionId) {
    return
  }
  context.setError(
    reconnectError instanceof Error ? reconnectError : new Error(String(reconnectError)),
  )
  context.setStatus('error')
  context.setBackgroundStreaming(false)
  context.backgroundStreamingRef.current = false
}

function hydrateActiveRunSession(
  input: SessionHydrationInput,
  keys: SessionHydrationKeys,
  context: SessionHydrationContext,
) {
  if (shouldSkipActiveRunHydration(input, keys, context)) {
    return
  }

  const persistedMessages = mergeSessionAndOptimisticMessages(
    input.session,
    input.optimisticUserMessages,
  )
  const existingMessages = getMessagesForSession(context.messagesBySessionIdRef, input.sessionId)
  const nextMessages = input.cachedRenderMessages
    ? mergeBackgroundReconnectMessages([...persistedMessages], [...input.cachedRenderMessages])
    : reconcileSnapshotUserMessages(persistedMessages, existingMessages)
  logger.info('Hydrating active run session messages', {
    sessionId: String(input.sessionId),
    mode: input.cachedRenderMessages ? 'background-reconnect-merge' : 'snapshot-reconcile',
    persistedMessageCount: persistedMessages.length,
    cachedRenderMessageCount: input.cachedRenderMessages?.length ?? 0,
    existingLiveCacheCount: existingMessages.length,
    finalMergedMessageCount: nextMessages.length,
    // ORDER DEBUG: full order of each input + the merged result so we can see
    // how the persisted snapshot reconciles with the live-streamed cache.
    persistedOrder: persistedMessages.map((message) => ({ id: message.id, role: message.role })),
    cachedOrder: (input.cachedRenderMessages ?? []).map((message) => ({ id: message.id, role: message.role })),
    existingOrder: existingMessages.map((message) => ({ id: message.id, role: message.role })),
    finalOrder: nextMessages.map((message) => ({ id: message.id, role: message.role })),
    persistedLastUserMessageId: getLastUserMessage(persistedMessages)?.id ?? null,
    cachedLastUserMessageId: getLastUserMessage(input.cachedRenderMessages ?? [])?.id ?? null,
    existingLastUserMessageId: getLastUserMessage(existingMessages)?.id ?? null,
    finalLastUserMessageId: getLastUserMessage(nextMessages)?.id ?? null,
  })
  setMessagesForSession(
    context.messagesBySessionIdRef,
    context.setMessagesBySessionId,
    context.setRunRenderMessages,
    input.sessionId,
    nextMessages,
    { cacheRunSnapshot: true, reason: 'hydrate:active-run-session' },
  )
  updateHydrationKeys(input.sessionId, keys, context)
  context.backgroundStreamingRef.current = true
  context.backgroundReconnectSessionIdRef.current = input.sessionId
  context.setBackgroundStreaming(true)
  context.setStatus('streaming')
  void reconnectToBackgroundRun(input.sessionId, input.session, input.optimisticUserMessages)
    .then((nextReconnectMessages) =>
      handleActiveRunReconnectResult(input.sessionId, nextReconnectMessages, context),
    )
    .catch((reconnectError: unknown) =>
      handleActiveRunReconnectError(input.sessionId, reconnectError, context),
    )
}

function hydrateIdleSession(
  input: SessionHydrationInput,
  keys: SessionHydrationKeys,
  context: SessionHydrationContext,
) {
  context.setBackgroundStreaming(false)
  context.backgroundStreamingRef.current = false
  context.backgroundReconnectSessionIdRef.current = null

  if (!keys.sessionChanged && !keys.snapshotChanged && !keys.optimisticChanged) {
    return
  }

  const snapshotMessages = appendMissingOptimisticUserMessages(
    sessionToUIMessages(input.session),
    input.optimisticUserMessages,
  )
  const existingMessages = getMessagesForSession(context.messagesBySessionIdRef, input.sessionId)
  // On run completion the persisted snapshot is authoritative — the live stream
  // was only a preview. Replace the entire message cache with the snapshot
  // (keeping optimistic user-message React identity via text reconciliation).
  // Do NOT merge cached render messages or the live cache; the snapshot carries
  // the handoff-stripped, correctly-ordered canonical state.
  const finalMessages = reconcileSnapshotUserMessages(snapshotMessages, existingMessages)
  logger.info('Hydrating idle session messages', {
    sessionId: String(input.sessionId),
    snapshotMessageCount: snapshotMessages.length,
    cachedRenderMessageCount: input.cachedRenderMessages?.length ?? 0,
    existingLiveCacheCount: existingMessages.length,
    finalMergedMessageCount: finalMessages.length,
    // ORDER DEBUG: the persisted snapshot order vs the existing live cache, and
    // the final merged result. This fires when a run completes and the persisted
    // snapshot replaces the streamed messages — the prime spot for order churn.
    snapshotOrder: snapshotMessages.map((message) => ({ id: message.id, role: message.role })),
    existingOrder: existingMessages.map((message) => ({ id: message.id, role: message.role })),
    finalOrder: finalMessages.map((message) => ({ id: message.id, role: message.role })),
    snapshotLastUserMessageId: getLastUserMessage(snapshotMessages)?.id ?? null,
    cachedLastUserMessageId: getLastUserMessage(input.cachedRenderMessages ?? [])?.id ?? null,
    existingLastUserMessageId: getLastUserMessage(existingMessages)?.id ?? null,
    finalLastUserMessageId: getLastUserMessage(finalMessages)?.id ?? null,
  })
  setMessagesForSession(
    context.messagesBySessionIdRef,
    context.setMessagesBySessionId,
    context.setRunRenderMessages,
    input.sessionId,
    finalMessages,
    { reason: 'hydrate:idle-session' },
  )
  updateHydrationKeys(input.sessionId, keys, context)

  if (keys.sessionChanged) {
    context.setStatus('ready')
    context.setError(undefined)
  }
}

export function hydrateSessionMessages(
  input: SessionHydrationInput,
  context: SessionHydrationContext,
) {
  const keys = getSessionHydrationKeys(input, context)
  if (shouldKeepForegroundHydration(input, keys, context)) {
    return
  }
  resetSessionChangedState(keys, context)
  if (input.hasActiveRun) {
    hydrateActiveRunSession(input, keys, context)
    return
  }
  hydrateIdleSession(input, keys, context)
}

async function reconnectToBackgroundRun(
  sessionId: SessionId,
  session: SessionDetail,
  optimisticUserMessages: readonly UIMessage[],
) {
  const latestSession = await api.getSessionDetail(sessionId)
  const snapshot = await api.getBackgroundRun(sessionId)
  const historicalMessages = mergeSessionAndOptimisticMessages(
    latestSession ?? session,
    optimisticUserMessages,
  )
  if (!snapshot) {
    return historicalMessages
  }

  const partialAssistant = buildPartialAssistantMessage(snapshot.parts, snapshot.messageId)
  return partialAssistant ? [...historicalMessages, partialAssistant] : historicalMessages
}
