import { matchBy } from '@diegogbrisa/ts-match'
import type { AgentSessionEvent } from '@mariozechner/pi-coding-agent'
import type { JsonValue } from '@shared/types/json'
import { toJsonValue } from '../../message-projection/message-mapper'
import { getAgentEndError, getAgentEndReason, getAgentEndUsage } from './agent-end-events'
import { handleMessageStart, handleMessageUpdate } from './assistant-events'
import type {
  AgentEndSessionEvent,
  AutoRetryEndSessionEvent,
  AutoRetryStartSessionEvent,
  CompactionEndSessionEvent,
  CompactionStartSessionEvent,
  MessageEndSessionEvent,
  QueueUpdateSessionEvent,
  SessionListenerInput,
  SessionListenerState,
  ToolExecutionEndSessionEvent,
  ToolExecutionStartSessionEvent,
  ToolExecutionUpdateSessionEvent,
} from './listener-types'
import { emitEvent } from './transport-emitter'

/**
 * Minimum gap between forwarded `tool_execution_update` snapshots for a single
 * tool call. Pi emits a cumulative (full-tail) snapshot per stdout chunk; this
 * caps main + renderer cost to ~1 snapshot / tool call / 150ms while a run is
 * streaming live output. See {@link handleToolExecutionUpdate} for the full
 * rationale (this is the fix for the typing-time "Application Not Responding").
 */
const TOOL_OUTPUT_UPDATE_MIN_INTERVAL_MS = 150

function classifyAgentEndTransportError(input: {
  readonly model: string
  readonly error: { readonly message: string }
}) {
  const normalized = input.error.message.toLowerCase()
  if (
    input.model === 'turing-machine/turing-machine' &&
    normalized.includes('403') &&
    normalized.includes('forbidden')
  ) {
    return {
      ...input.error,
      code: 'subscription-required',
    } as const
  }
  return input.error
}

function emitAgentStart(state: SessionListenerState) {
  emitEvent(state.input.onEvent, {
    type: 'agent_start',
    runId: state.runId,
    timestamp: Date.now(),
    model: state.input.model,
  })
}

function handleToolExecutionStart(
  state: SessionListenerState,
  event: ToolExecutionStartSessionEvent,
) {
  state.toolOutputUpdateEmittedAt.delete(event.toolCallId)
  const toolInput = toJsonValue(event.args)
  state.toolCallInputs.set(event.toolCallId, toolInput)
  emitEvent(state.input.onEvent, {
    type: 'tool_execution_start',
    toolCallId: event.toolCallId,
    toolName: event.toolName,
    args: toolInput,
    parentMessageId: state.currentMessageId ?? undefined,
    timestamp: Date.now(),
    model: state.input.model,
  })
}

function handleToolExecutionUpdate(
  state: SessionListenerState,
  event: ToolExecutionUpdateSessionEvent,
) {
  // Pace cumulative tool-output snapshots. Pi's bash/terminal tool emits a
  // `tool_execution_update` on EVERY stdout/stderr chunk, and each carries the
  // ENTIRE rolling tail buffer (up to ~50KB of text), not a delta. A long-lived
  // dev server (`pnpm dev`, `tsc --watch`, …) streams chunks continuously, so
  // without throttling a single run can emit thousands of these per minute —
  // each one deep-serialized through the main process and reduced through an
  // O(transcript) scan in the renderer per tool call. With several such runs
  // across projects the main + renderer event loops saturate, input stops being
  // serviced, and the app is reported "Application Not Responding".
  //
  // Because the snapshots are CUMULATIVE, every in-flight update fully
  // supersedes the previous one, so dropping the ones caught in a burst is safe:
  // the very next forwarded snapshot (or the final `tool_execution_end`, which
  // always carries the complete result) shows the same and fresher state. We
  // forward at most one snapshot per tool call per interval — fast enough that
  // live output still reads smoothly, slow enough to cap per-run cost.
  const now = Date.now()
  const lastEmittedAt = state.toolOutputUpdateEmittedAt.get(event.toolCallId) ?? 0
  if (now - lastEmittedAt < TOOL_OUTPUT_UPDATE_MIN_INTERVAL_MS) {
    return
  }
  state.toolOutputUpdateEmittedAt.set(event.toolCallId, now)

  const toolInput = toJsonValue(event.args)
  state.toolCallInputs.set(event.toolCallId, toolInput)
  emitEvent(state.input.onEvent, {
    type: 'tool_execution_update',
    toolCallId: event.toolCallId,
    toolName: event.toolName,
    args: toolInput,
    partialResult: toJsonValue(event.partialResult),
    timestamp: now,
    model: state.input.model,
  })
}

function handleToolExecutionEnd(state: SessionListenerState, event: ToolExecutionEndSessionEvent) {
  // The end event carries the complete result and clears the partial output, so
  // any buffered update is now redundant — drop its pacing state so a later call
  // reusing this id (ids are unique per call, but treat it as a fresh cadence).
  state.toolOutputUpdateEmittedAt.delete(event.toolCallId)
  emitEvent(state.input.onEvent, {
    type: 'tool_execution_end',
    toolCallId: event.toolCallId,
    toolName: event.toolName,
    args: state.toolCallInputs.get(event.toolCallId),
    result: toJsonValue(event.result),
    isError: event.isError,
    timestamp: Date.now(),
    model: state.input.model,
  })
}

function handleMessageEnd(state: SessionListenerState, event: MessageEndSessionEvent) {
  if (!state.currentMessageId || event.message.role !== 'assistant') {
    return
  }

  emitEvent(state.input.onEvent, {
    type: 'message_end',
    messageId: state.currentMessageId,
    role: 'assistant',
    timestamp: Date.now(),
    model: state.input.model,
  })
  state.currentMessageId = null
}

function emitQueueUpdate(state: SessionListenerState, event: QueueUpdateSessionEvent) {
  emitEvent(state.input.onEvent, {
    type: 'queue_update',
    steering: [...event.steering],
    followUp: [...event.followUp],
    timestamp: Date.now(),
    model: state.input.model,
  })
}

function emitCompactionStart(state: SessionListenerState, event: CompactionStartSessionEvent) {
  emitEvent(state.input.onEvent, {
    type: 'compaction_start',
    reason: event.reason,
    timestamp: Date.now(),
    model: state.input.model,
  })
}
function emitCompactionEnd(state: SessionListenerState, event: CompactionEndSessionEvent) {
  emitEvent(state.input.onEvent, {
    type: 'compaction_end',
    reason: event.reason,
    result: toJsonValue(event.result ?? null),
    aborted: event.aborted,
    willRetry: event.willRetry,
    ...(event.errorMessage ? { errorMessage: event.errorMessage } : {}),
    timestamp: Date.now(),
    model: state.input.model,
  })
}

function emitAutoRetryStart(state: SessionListenerState, event: AutoRetryStartSessionEvent) {
  emitEvent(state.input.onEvent, {
    type: 'auto_retry_start',
    attempt: event.attempt,
    maxAttempts: event.maxAttempts,
    delayMs: event.delayMs,
    errorMessage: event.errorMessage,
    timestamp: Date.now(),
    model: state.input.model,
  })
}

function emitAutoRetryEnd(state: SessionListenerState, event: AutoRetryEndSessionEvent) {
  emitEvent(state.input.onEvent, {
    type: 'auto_retry_end',
    success: event.success,
    attempt: event.attempt,
    ...(event.finalError ? { finalError: event.finalError } : {}),
    timestamp: Date.now(),
    model: state.input.model,
  })
}

function emitAgentEnd(state: SessionListenerState, event: AgentEndSessionEvent) {
  const reason = getAgentEndReason(event.messages)
  const rawError =
    reason === 'error' || reason === 'aborted' ? getAgentEndError(event.messages) : undefined
  const error = rawError
    ? classifyAgentEndTransportError({ model: state.input.model, error: rawError })
    : undefined
  emitEvent(state.input.onEvent, {
    type: 'agent_end',
    runId: state.runId,
    reason,
    usage: getAgentEndUsage(event.messages),
    ...(error ? { error } : {}),
    timestamp: Date.now(),
    model: state.input.model,
  })
}

function handleSessionEvent(state: SessionListenerState, event: AgentSessionEvent) {
  matchBy(event, 'type')
    .with('agent_start', () => emitAgentStart(state))
    .with('agent_end', (value) => emitAgentEnd(state, value))
    .with('turn_start', () => undefined)
    .with('turn_end', () => undefined)
    .with('message_start', (value) => handleMessageStart(state, value))
    .with('message_update', (value) => handleMessageUpdate(state, value))
    .with('message_end', (value) => handleMessageEnd(state, value))
    .with('tool_execution_start', (value) => handleToolExecutionStart(state, value))
    .with('tool_execution_update', (value) => handleToolExecutionUpdate(state, value))
    .with('tool_execution_end', (value) => handleToolExecutionEnd(state, value))
    .with('queue_update', (value) => emitQueueUpdate(state, value))
    .with('compaction_start', (value) => emitCompactionStart(state, value))
    .with('compaction_end', (value) => emitCompactionEnd(state, value))
    .with('auto_retry_start', (value) => emitAutoRetryStart(state, value))
    .with('auto_retry_end', (value) => emitAutoRetryEnd(state, value))
    .exhaustive()
}

export function createSessionListener(input: SessionListenerInput, runId: string) {
  const state: SessionListenerState = {
    input,
    runId,
    currentMessageId: null,
    thinkingSteps: new Set<string>(),
    startedToolCalls: new Set<string>(),
    toolCallInputs: new Map<string, JsonValue>(),
    toolOutputUpdateEmittedAt: new Map<string, number>(),
  }

  return (event: AgentSessionEvent) => handleSessionEvent(state, event)
}
