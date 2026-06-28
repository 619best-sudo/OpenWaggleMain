import { matchBy } from '@diegogbrisa/ts-match'
import {
  clearLastAgentErrorInfo,
  setLastAgentErrorInfo,
} from '@/features/chat/lib/agent-error-store'
import { applyAgentTransportEvent } from '@/features/chat/lib/chat-stream-state'
import { getUIMessageText } from '@/features/chat/lib/useAgentChat.utils'
import { createRendererLogger } from '@/shared/lib/logger'
import { updateMessagesForSession } from './useAgentChat.message-cache'
import type { AgentEventPayload, AgentStreamEventContext } from './useAgentChat.types'

const logger = createRendererLogger('use-agent-chat-stream')

function signalStreamChange(context: AgentStreamEventContext) {
  context.streamSignalVersionRef.current += 1
}

function setReadyIfNoActiveRun(context: AgentStreamEventContext) {
  if (!context.foregroundStreamActiveRef.current && !context.backgroundStreamingRef.current) {
    context.setStatus('ready')
  }
}

function handleAgentStartEvent(context: AgentStreamEventContext) {
  signalStreamChange(context)
  clearLastAgentErrorInfo(context.subscribedSessionId)
  context.setError(undefined)
  context.setStatus('streaming')
  if (!context.foregroundStreamActiveRef.current) {
    context.backgroundStreamingRef.current = true
    context.backgroundReconnectSessionIdRef.current = context.subscribedSessionId
    context.setBackgroundStreaming(true)
  }
}

function handleCompactionEndEvent(
  event: Extract<AgentEventPayload['event'], { readonly type: 'compaction_end' }>,
  context: AgentStreamEventContext,
) {
  signalStreamChange(context)
  context.setCompactionStatus(null)
  const hasCompactionError = event.errorMessage !== undefined && !event.aborted
  if (hasCompactionError) {
    const nextError = new Error(event.errorMessage)
    context.setError(nextError)
    context.setStatus('error')
    return
  }
  setReadyIfNoActiveRun(context)
}

function handleAutoRetryEndEvent(
  event: Extract<AgentEventPayload['event'], { readonly type: 'auto_retry_end' }>,
  context: AgentStreamEventContext,
) {
  signalStreamChange(context)
  context.setCompactionStatus(null)
  const hasRetryError = !event.success && event.finalError !== undefined
  if (hasRetryError) {
    const nextError = new Error(event.finalError)
    context.setError(nextError)
    context.setStatus('error')
    return
  }
  setReadyIfNoActiveRun(context)
}

function handleAgentEndEvent(
  event: Extract<AgentEventPayload['event'], { readonly type: 'agent_end' }>,
  context: AgentStreamEventContext,
) {
  if (event.reason !== 'error' || !event.error) {
    return
  }

  signalStreamChange(context)
  const nextError = new Error(event.error.message)
  context.terminalRunErrorRef.current = nextError
  setLastAgentErrorInfo(context.subscribedSessionId, event.error)
  context.setError(nextError)
  context.setStatus('error')
}

function handleAgentStateEvent(
  event: AgentEventPayload['event'],
  context: AgentStreamEventContext,
) {
  matchBy(event, 'type')
    .with('agent_start', () => handleAgentStartEvent(context))
    .with('compaction_start', (value) => {
      signalStreamChange(context)
      context.setError(undefined)
      context.setStatus('compacting')
      context.setCompactionStatus({ type: 'compacting', reason: value.reason })
    })
    .with('compaction_end', (value) => handleCompactionEndEvent(value, context))
    .with('auto_retry_start', (value) => {
      signalStreamChange(context)
      context.setStatus('retrying')
      context.setCompactionStatus({
        type: 'retrying',
        attempt: value.attempt,
        maxAttempts: value.maxAttempts,
        delayMs: value.delayMs,
        errorMessage: value.errorMessage,
      })
    })
    .with('auto_retry_end', (value) => handleAutoRetryEndEvent(value, context))
    .with('agent_end', (value) => handleAgentEndEvent(value, context))
    .with(
      'turn_start',
      'turn_end',
      'message_start',
      'message_update',
      'message_end',
      'tool_execution_start',
      'tool_execution_update',
      'tool_execution_end',
      'queue_update',
      'custom',
      () => undefined,
    )
    .exhaustive()
}

function shouldHandleStreamPayload(payload: AgentEventPayload, context: AgentStreamEventContext) {
  return (
    payload.sessionId === context.subscribedSessionId &&
    context.currentSessionIdRef.current === context.subscribedSessionId
  )
}

export function handleAgentStreamPayload(
  payload: AgentEventPayload,
  context: AgentStreamEventContext,
) {
  if (!shouldHandleStreamPayload(payload, context)) {
    return
  }

  if (
    (payload.event.type === 'custom' && payload.event.name === 'team:auto-user-prompt') ||
    (payload.event.type === 'message_start' && payload.event.role === 'user') ||
    (payload.event.type === 'message_end' && payload.event.role === 'user')
  ) {
    logger.debug('Received Team(New) live user-related stream event', {
      sessionId: String(payload.sessionId),
      eventType: payload.event.type,
      event:
        payload.event.type === 'custom'
          ? payload.event
          : {
              type: payload.event.type,
              messageId: payload.event.messageId,
              role: payload.event.role,
            },
    })
  }

  handleAgentStateEvent(payload.event, context)

  if (context.foregroundStreamActiveRef.current || context.backgroundStreamingRef.current) {
    signalStreamChange(context)
    updateMessagesForSession(
      context.messagesBySessionIdRef,
      context.setMessagesBySessionId,
      context.setRunRenderMessages,
      context.subscribedSessionId,
      (currentMessages) => {
        const nextMessages = applyAgentTransportEvent(currentMessages, payload.event)
        if (
          payload.event.type === 'custom' &&
          payload.event.name === 'team:auto-user-prompt'
        ) {
          const appendedMessage =
            nextMessages.length > currentMessages.length
              ? nextMessages[nextMessages.length - 1]
              : undefined
          logger.debug('Applied Team(New) prompt stream event to live cache', {
            sessionId: String(context.subscribedSessionId),
            previousCount: currentMessages.length,
            nextCount: nextMessages.length,
            appendedMessageId: appendedMessage?.id ?? null,
            appendedMessageRole: appendedMessage?.role ?? null,
            appendedMessageText: appendedMessage ? getUIMessageText(appendedMessage) : null,
          })
        }
        return nextMessages
      },
      { cacheRunSnapshot: true, reason: `stream:${payload.event.type}` },
    )
  }
}
