import { randomUUID } from 'node:crypto'
import { matchBy } from '@diegogbrisa/ts-match'
import type { JsonValue } from '@shared/types/json'
import { getAgentPhaseTitle } from '@shared/types/phase-titles'
import type { AgentAssistantMessageEvent, AgentTransportEvent } from '@shared/types/stream'
import type { AgentEvent as TuringAgentEvent } from 'turing-harness'
import { createLogger } from '../../logger'
import { toJsonValue } from '../message-projection/message-mapper'

const logger = createLogger('turing-event-mapper')

export interface TuringEventMapperOptions {
  readonly runId: string
  readonly model: string
  readonly emit: (event: AgentTransportEvent) => void
  /**
   * Resolves the final status of the synthetic 'working' phase when the run
   * ends. v2 (the categorizer chain) has no `chain_end` carrying success — the
   * agent's `agent_end` fires from the prompt's finally block, by which point
   * `state.error` is already final, so the adapter can answer this honestly.
   */
  readonly resolveEndStatus?: () => 'completed' | 'failed' | 'interrupted'
}

type TuringMessageUpdate = Extract<TuringAgentEvent, { type: 'message_update' }>
type TuringAssistantMessageEvent = TuringMessageUpdate['assistantMessageEvent']

interface TuringMapperState {
  currentMessageId: string | null
  readonly model: string
  readonly emit: (event: AgentTransportEvent) => void
  /**
   * Whether the synthetic 'working' phase has been started. v2 (the categorizer
   * chain) emits `categorizer_start`/`categorizer_end` per hop — progress
   * telemetry with NO deliverable payload — so we still project ONE 'working'
   * phase wrapping the whole run: the first hop opens it, each hop refreshes its
   * label (Reading → Writing → Verifying…), and `agent_end` closes it. Per-hop
   * deliverables are internal handoffs; only the run's final summary is
   * user-facing, and it rides the persisted transcript node.
   */
  workingPhaseStarted: boolean
  /**
   * The streamed messageIds, one per completed assistant turn, IN STREAM ORDER.
   * Each turing `message_start…message_end` cycle is one assistant turn and maps
   * 1:1 (positionally) to an assistant message in `agent.state.messages`. The
   * projection REUSES these exact ids so the persisted snapshot agrees with the
   * live stream — without this, the snapshot mints fresh ids and the renderer
   * can't dedup the streamed messages against it (every turn renders twice).
   */
  readonly streamedMessageIds: string[]
  /**
   * Live tool-call authoring state, keyed by the turing contentIndex. The model
   * streams a tool call as toolcall_start → toolcall_delta* → toolcall_end. We
   * forward these so the UI shows the call (with streaming args) the moment the
   * model starts authoring it — NOT only when the runner later executes it.
   *
   * The id may not be known at toolcall_start (OpenRouter sometimes sends it in
   * a later chunk), but it MUST be known before we emit, because the runner's
   * later `tool_execution_*` events key off the REAL toolCallId. Emitting a
   * provisional id would make tool_execution_start create a SECOND tool-call
   * part (a duplicate). So: buffer until the id resolves, then flush in order.
   */
  readonly pendingToolCalls: Map<number, PendingToolCall>
  /** Final 'working' status resolver (see TuringEventMapperOptions). */
  readonly resolveEndStatus: () => 'completed' | 'failed' | 'interrupted'
}

interface PendingToolCall {
  /** Resolved once the model's toolCall.id becomes non-empty. */
  toolCallId: string | null
  toolName: string
  /** Buffered arg deltas accumulated before the id resolved. */
  bufferedDeltas: string[]
  /** Whether toolcall_start has been emitted for this call. */
  started: boolean
}

/**
 * Translates the turing-harness {@link TuringAgentEvent} stream into OpenWaggle's
 * vendor-neutral {@link AgentTransportEvent} stream.
 *
 * The turing event stream is structurally pi-compatible (`message_start` →
 * streamed `message_update` carrying an `assistantMessageEvent` → `message_end`,
 * plus `tool_execution_*`), so this mirrors the pi session-listener state
 * machine. The flat loop driver emits `chain_start`/`chain_end` once per run,
 * which we project as a single synthetic `'working'` phase. The additive 4P
 * `phase_*` events are no longer emitted by `run()` and are dropped.
 */
export function createTuringEventMapper(options: TuringEventMapperOptions) {
  const loggedEmit = (event: AgentTransportEvent) => {
    logger.debug('emit →', {
      type: event.type,
      messageId: (event as { messageId?: string }).messageId ?? null,
      toolCallId: (event as { toolCallId?: string }).toolCallId ?? null,
      phaseId: (event as { phaseId?: string }).phaseId ?? null,
      parentMessageId: (event as { parentMessageId?: string }).parentMessageId ?? null,
      name: (event as { name?: string }).name ?? null,
    })
    options.emit(event)
  }
  const state: TuringMapperState = {
    currentMessageId: null,
    model: options.model,
    emit: loggedEmit,
    workingPhaseStarted: false,
    streamedMessageIds: [],
    pendingToolCalls: new Map(),
    resolveEndStatus: options.resolveEndStatus ?? (() => 'completed' as const),
  }
  const handler = (event: TuringAgentEvent) => {
    logger.debug('turing event ←', describeTuringEvent(event))
    handleTuringEvent(state, event)
  }
  return Object.assign(handler, {
    getStreamedMessageIds: (): readonly string[] => state.streamedMessageIds,
  })
}

/** Compact, order-stable description of a turing event for the log. */
function describeTuringEvent(event: TuringAgentEvent): Record<string, unknown> {
  switch (event.type) {
    case 'message_start':
      return { type: event.type, messageRole: event.message.role }
    case 'message_update':
      return {
        type: event.type,
        assistant: event.assistantMessageEvent.type,
        contentIndex:
          (event.assistantMessageEvent as { contentIndex?: number }).contentIndex ?? null,
        toolCallId: (event.assistantMessageEvent as { toolCallId?: string }).toolCallId ?? null,
      }
    case 'message_end':
      return { type: event.type, messageRole: event.message.role }
    case 'tool_execution_start':
      return { type: event.type, toolCallId: event.toolCallId, toolName: event.toolName }
    case 'tool_execution_end':
      return { type: event.type, toolCallId: event.toolCallId, isError: event.isError }
    case 'categorizer_start':
      return { type: event.type, categorizer: event.categorizer, model: event.model }
    case 'categorizer_end':
      return { type: event.type, categorizer: event.categorizer }
    case 'agent_end':
      return { type: event.type }
    default:
      return { type: (event as { type: string }).type }
  }
}

function handleTuringEvent(state: TuringMapperState, event: TuringAgentEvent) {
  matchBy(event, 'type')
    .with('categorizer_start', (value) => emitWorkingPhaseStart(state, value.categorizer))
    .with('categorizer_end', () => undefined)
    .with('agent_end', () => emitWorkingPhaseEnd(state, state.resolveEndStatus()))
    .with('message_start', () => beginMessage(state))
    .with('message_update', (value) => handleAssistantEvent(state, value.assistantMessageEvent))
    .with('message_end', () => endMessage(state))
    .with('tool_execution_start', (value) => emitToolExecutionStart(state, value))
    .with('tool_execution_end', (value) => emitToolExecutionEnd(state, value))
    .otherwise(() => undefined)
}

/**
 * Begin a new assistant message turn on turing's `message_start`. Minting the id
 * here (rather than lazily on the first content delta) means every turn gets a
 * stable id even if it ends up content-free, and the id is recorded in stream
 * order so the projection can reuse it for the persisted snapshot.
 */
function beginMessage(state: TuringMapperState) {
  if (state.currentMessageId) {
    endMessage(state)
  }
  const messageId = randomUUID()
  state.currentMessageId = messageId
  emitMessageStart(state, messageId)
}

function ensureMessageStarted(state: TuringMapperState) {
  if (state.currentMessageId) {
    return state.currentMessageId
  }
  const messageId = randomUUID()
  state.currentMessageId = messageId
  emitMessageStart(state, messageId)
  return messageId
}

function endMessage(state: TuringMapperState) {
  if (!state.currentMessageId) {
    return
  }
  state.emit({
    type: 'message_end',
    messageId: state.currentMessageId,
    role: 'assistant',
    timestamp: Date.now(),
    model: state.model,
  })
  state.streamedMessageIds.push(state.currentMessageId)
  state.currentMessageId = null
}

function emitMessageStart(state: TuringMapperState, messageId: string) {
  state.emit({
    type: 'message_start',
    messageId,
    role: 'assistant',
    timestamp: Date.now(),
    model: state.model,
  })
}

function emitAssistantUpdate(
  state: TuringMapperState,
  messageId: string,
  assistantMessageEvent: AgentAssistantMessageEvent,
) {
  state.emit({
    type: 'message_update',
    messageId,
    role: 'assistant',
    assistantMessageEvent,
    timestamp: Date.now(),
    model: state.model,
  })
}

function handleAssistantEvent(
  state: TuringMapperState,
  assistantEvent: TuringAssistantMessageEvent,
) {
  matchBy(assistantEvent, 'type')
    .with('text_delta', (value) =>
      emitAssistantUpdate(state, ensureMessageStarted(state), {
        type: 'text_delta',
        contentIndex: value.contentIndex,
        delta: value.delta,
      } as AgentAssistantMessageEvent),
    )
    .with('thinking_start', (value) =>
      emitAssistantUpdate(state, ensureMessageStarted(state), {
        type: 'thinking_start',
        contentIndex: value.contentIndex,
      } as AgentAssistantMessageEvent),
    )
    .with('thinking_delta', (value) =>
      emitAssistantUpdate(state, ensureMessageStarted(state), {
        type: 'thinking_delta',
        contentIndex: value.contentIndex,
        delta: value.delta,
      } as AgentAssistantMessageEvent),
    )
    .with('thinking_end', (value) =>
      emitAssistantUpdate(state, ensureMessageStarted(state), {
        type: 'thinking_end',
        contentIndex: value.contentIndex,
        content: value.content,
      } as AgentAssistantMessageEvent),
    )
    .with('toolcall_start', (value) =>
      handleToolCallStart(state, value.contentIndex, value.partial),
    )
    .with('toolcall_delta', (value) =>
      handleToolCallDelta(state, value.contentIndex, value.delta, value.partial),
    )
    .with('toolcall_end', (value) =>
      handleToolCallEnd(state, value.contentIndex, value.toolCall, value.partial),
    )
    .otherwise(() => undefined)
}

/**
 * Extract the live ToolCall block the model is authoring from a streamed partial
 * message by contentIndex. turing-harness attaches `partial` (the full in-flight
 * AssistantMessage) to every toolcall_* event, so the current id/name/arguments
 * are always reachable even on toolcall_start/delta (which don't carry them as
 * discrete fields). Index by contentIndex (NOT find) so concurrent tool calls
 * each read their own block.
 */
function readLiveToolCall(
  partial: { content: readonly unknown[] },
  contentIndex: number,
): { type: 'toolCall'; id: string; name: string; arguments?: unknown } | undefined {
  const block = partial.content[contentIndex] as
    | { type: string; id?: string; name?: string; arguments?: unknown }
    | undefined
  if (!block || block.type !== 'toolCall') return undefined
  return block as { type: 'toolCall'; id: string; name: string; arguments?: unknown }
}

function argsToJsonValue(args: unknown): JsonValue | undefined {
  if (args === undefined) return undefined
  try {
    return toJsonValue(args)
  } catch {
    return undefined
  }
}

/** Begin tracking a tool call. Defers emission until the real toolCallId resolves. */
function handleToolCallStart(
  state: TuringMapperState,
  contentIndex: number,
  partial: { content: readonly unknown[] },
) {
  const live = readLiveToolCall(partial, contentIndex)
  const toolCallId = live?.id?.trim() ? live.id : null
  const toolName = live?.name ?? ''
  state.pendingToolCalls.set(contentIndex, {
    toolCallId,
    toolName,
    bufferedDeltas: [],
    started: false,
  })
  if (toolCallId) flushToolCallStart(state, contentIndex)
}

function handleToolCallDelta(
  state: TuringMapperState,
  contentIndex: number,
  delta: string,
  partial: { content: readonly unknown[] },
) {
  const pending = state.pendingToolCalls.get(contentIndex)
  if (!pending) {
    const live = readLiveToolCall(partial, contentIndex)
    state.pendingToolCalls.set(contentIndex, {
      toolCallId: live?.id?.trim() ? live.id : null,
      toolName: live?.name ?? '',
      bufferedDeltas: [],
      started: false,
    })
    return handleToolCallDelta(state, contentIndex, delta, partial)
  }
  const live = readLiveToolCall(partial, contentIndex)
  if (!pending.toolCallId && live?.id?.trim()) {
    pending.toolCallId = live.id
    pending.toolName = live.name ?? pending.toolName
  }
  if (!pending.started && pending.toolCallId) flushToolCallStart(state, contentIndex)
  if (!pending.started || !pending.toolCallId) {
    pending.bufferedDeltas.push(delta)
    return
  }
  const messageId = ensureMessageStarted(state)
  for (const buffered of pending.bufferedDeltas) {
    emitAssistantUpdate(state, messageId, {
      type: 'toolcall_delta',
      contentIndex,
      toolCallId: pending.toolCallId,
      delta: buffered,
    } as AgentAssistantMessageEvent)
  }
  pending.bufferedDeltas = []
  emitAssistantUpdate(state, messageId, {
    type: 'toolcall_delta',
    contentIndex,
    toolCallId: pending.toolCallId,
    delta,
  } as AgentAssistantMessageEvent)
}

function handleToolCallEnd(
  state: TuringMapperState,
  contentIndex: number,
  toolCall: { id: string; name: string; arguments?: unknown },
  partial: { content: readonly unknown[] },
) {
  const pending = state.pendingToolCalls.get(contentIndex)
  const toolCallId = toolCall.id
  const toolName = toolCall.name
  const input = argsToJsonValue(toolCall.arguments)
  if (pending && !pending.started) {
    pending.toolCallId = toolCallId
    pending.toolName = toolName
    flushToolCallStart(state, contentIndex, input)
    const messageId = ensureMessageStarted(state)
    for (const buffered of pending.bufferedDeltas) {
      emitAssistantUpdate(state, messageId, {
        type: 'toolcall_delta',
        contentIndex,
        toolCallId,
        delta: buffered,
      } as AgentAssistantMessageEvent)
    }
    pending.bufferedDeltas = []
  }
  emitAssistantUpdate(state, ensureMessageStarted(state), {
    type: 'toolcall_end',
    contentIndex,
    toolCallId,
    toolName,
    input: input ?? {},
  } as AgentAssistantMessageEvent)
  state.pendingToolCalls.delete(contentIndex)
}

/** Emit the (deferred) toolcall_start for a pending call, once its id is known. */
function flushToolCallStart(state: TuringMapperState, contentIndex: number, input?: JsonValue) {
  const pending = state.pendingToolCalls.get(contentIndex)
  if (!pending || !pending.toolCallId || pending.started) return
  pending.started = true
  emitAssistantUpdate(state, ensureMessageStarted(state), {
    type: 'toolcall_start',
    contentIndex,
    toolCallId: pending.toolCallId,
    toolName: pending.toolName,
    ...(input !== undefined ? { input } : {}),
  } as AgentAssistantMessageEvent)
}

function emitToolExecutionStart(
  state: TuringMapperState,
  event: Extract<TuringAgentEvent, { type: 'tool_execution_start' }>,
) {
  const parentMessageId =
    state.currentMessageId ??
    state.streamedMessageIds[state.streamedMessageIds.length - 1] ??
    ensureMessageStarted(state)
  state.emit({
    type: 'tool_execution_start',
    toolCallId: event.toolCallId,
    toolName: event.toolName,
    args: toJsonValue(event.args),
    parentMessageId,
    timestamp: Date.now(),
    model: state.model,
  })
}

function emitToolExecutionEnd(
  state: TuringMapperState,
  event: Extract<TuringAgentEvent, { type: 'tool_execution_end' }>,
) {
  state.emit({
    type: 'tool_execution_end',
    toolCallId: event.toolCallId,
    toolName: event.toolName,
    result: toJsonValue(event.result),
    isError: event.isError,
    timestamp: Date.now(),
    model: state.model,
  })
}

/**
 * Open (or refresh) the synthetic 'working' phase on each categorizer hop.
 * v2 hop events are progress telemetry with no deliverable, so the hop's only
 * visible effect is the phase LABEL: the first hop opens the phase, later hops
 * re-emit `phase_start` with their label so the session chip tracks the run
 * (Reading → Writing → Verifying). No per-hop cards: the run's single
 * user-facing summary rides the persisted transcript node.
 */
function emitWorkingPhaseStart(state: TuringMapperState, categorizer: string) {
  const first = !state.workingPhaseStarted
  state.workingPhaseStarted = true
  state.emit({
    type: 'phase_start',
    phaseId: 'working',
    // The opening label is the generic one; refreshes name the live hop.
    label: first ? getAgentPhaseTitle('working') : categorizerLabel(categorizer),
    timestamp: Date.now(),
    model: state.model,
  })
}

/** Human label for a categorizer id, for the live phase chip. */
function categorizerLabel(categorizer: string): string {
  switch (categorizer) {
    case 'read':
      return 'Reading the code'
    case 'write_edit':
      return 'Writing code'
    case 'activity_inspect':
      return 'Verifying'
    case 'conversation':
      return 'Thinking'
    default:
      return categorizer
        .split('_')
        .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
        .join(' ')
  }
}

/**
 * Close the synthetic 'working' phase on `agent_end` (the categorizer chain has
 * no chain_end). Status comes from the adapter, which knows the final
 * `state.error`. The richer detail (summary, steps, planSet) is attached to the
 * persisted transcript node rather than this live event.
 */
function emitWorkingPhaseEnd(
  state: TuringMapperState,
  status: 'completed' | 'failed' | 'interrupted',
) {
  if (!state.workingPhaseStarted) {
    // Defensive: an end without a start (shouldn't happen). Open then close so
    // the renderer's phase pair stays balanced.
    state.workingPhaseStarted = true
    state.emit({
      type: 'phase_start',
      phaseId: 'working',
      label: getAgentPhaseTitle('working'),
      timestamp: Date.now(),
      model: state.model,
    })
  }
  state.emit({
    type: 'phase_end',
    phaseId: 'working',
    label: getAgentPhaseTitle('working'),
    status,
    timestamp: Date.now(),
    model: state.model,
  })
  state.workingPhaseStarted = false
}
