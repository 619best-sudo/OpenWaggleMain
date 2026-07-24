import { randomUUID } from 'node:crypto'
import { matchBy } from '@diegogbrisa/ts-match'
import type { AgentPhaseId, AgentPhaseLabel } from '@shared/types/phase'
import { getAgentPhaseTitle } from '@shared/types/phase-titles'
import type { AgentAssistantMessageEvent, AgentTransportEvent } from '@shared/types/stream'
import type { JsonValue } from '@shared/types/json'
import type { AgentEvent as TuringAgentEvent } from 'turing-harness'
import { toJsonValue } from '../pi/pi-message-mapper'
import { phaseResultToStatus } from './turing-run-classification'

export interface TuringEventMapperOptions {
  readonly runId: string
  readonly model: string
  readonly emit: (event: AgentTransportEvent) => void
}

type TuringMessageUpdate = Extract<TuringAgentEvent, { type: 'message_update' }>
type TuringAssistantMessageEvent = TuringMessageUpdate['assistantMessageEvent']

interface TuringMapperState {
  currentMessageId: string | null
  readonly model: string
  readonly emit: (event: AgentTransportEvent) => void
  readonly phaseCounts: Partial<Record<AgentPhaseId, number>>
  readonly activePhaseLabels: Partial<Record<AgentPhaseId, AgentPhaseLabel>>
  retryPerformFromFailedVerification: boolean
}

function startPhaseLabel(state: TuringMapperState, phase: AgentPhaseId): AgentPhaseLabel {
  const occurrenceIndex = state.phaseCounts[phase] ?? 0
  const label = getAgentPhaseTitle(
    phase,
    occurrenceIndex,
    phase === 'perform' && state.retryPerformFromFailedVerification
      ? { retryReason: 'failed_verification' }
      : undefined,
  )
  state.phaseCounts[phase] = occurrenceIndex + 1
  state.activePhaseLabels[phase] = label
  if (phase === 'perform') {
    state.retryPerformFromFailedVerification = false
  }
  return label
}

function endPhaseLabel(state: TuringMapperState, phase: AgentPhaseId): AgentPhaseLabel {
  const activeLabel = state.activePhaseLabels[phase]
  delete state.activePhaseLabels[phase]
  return activeLabel ?? getAgentPhaseTitle(phase)
}

function firstNonEmpty(values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return undefined
}

function stripVerdictOnlyPrefix(summary: string | undefined) {
  const trimmed = summary?.trim()
  if (!trimmed) return undefined
  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length <= 1) return trimmed
  if (!/^VERDICT:\s*(PASS|FAIL)\b/i.test(lines[0] ?? '')) return trimmed
  const remainder = lines.slice(1).join('\n').trim()
  return remainder || trimmed
}

function resolvePhaseSummary(
  phase: AgentPhaseId,
  result: Extract<TuringAgentEvent, { type: 'phase_end' }>['result'],
) {
  const artifacts = (result as { artifacts?: { chatSummary?: unknown; summary?: unknown; fix?: unknown } }).artifacts
  // `uiSummary` is the styled short user-facing status that replaced CHAT SUMMARY.
  const uiSummary = typeof result.uiSummary === 'string' ? result.uiSummary : undefined
  const artifactChatSummary =
    typeof artifacts?.chatSummary === 'string' ? artifacts.chatSummary : undefined
  const artifactSummary =
    typeof artifacts?.summary === 'string' ? artifacts.summary : undefined
  const artifactFix =
    typeof artifacts?.fix === 'string' ? artifacts.fix : undefined
  const displaySummary = result.display?.summary?.trim()
  if (uiSummary?.trim()) return uiSummary.trim()
  if (displaySummary) return displaySummary
  if (phase !== 'perfect') {
    return firstNonEmpty([artifactChatSummary, artifactSummary, result.summary])
  }
  return firstNonEmpty([
    artifactChatSummary,
    stripVerdictOnlyPrefix(artifactSummary),
    stripVerdictOnlyPrefix(result.summary),
    artifactFix,
    result.summary,
  ])
}

/**
 * Translates the turing-harness {@link TuringAgentEvent} stream into OpenWaggle's
 * vendor-neutral {@link AgentTransportEvent} stream.
 *
 * The turing event stream is structurally pi-compatible (`message_start` →
 * streamed `message_update` carrying an `assistantMessageEvent` → `message_end`,
 * plus `tool_execution_*`), so this mirrors the pi session-listener state
 * machine. The additive 4P events (`phase_*`, `chain_*`, `permission_*`) and the
 * agent lifecycle events are intentionally not forwarded here — the adapter
 * synthesises `agent_start`/`agent_end` around the run so it can attach the run
 * outcome, usage, and errors.
 */
export function createTuringEventMapper(options: TuringEventMapperOptions) {
  const state: TuringMapperState = {
    currentMessageId: null,
    model: options.model,
    emit: options.emit,
    phaseCounts: {},
    activePhaseLabels: {},
    retryPerformFromFailedVerification: false,
  }
  return (event: TuringAgentEvent) => handleTuringEvent(state, event)
}

function handleTuringEvent(state: TuringMapperState, event: TuringAgentEvent) {
  matchBy(event, 'type')
    .with('phase_start', (value) => emitPhaseStart(state, value.phase))
    .with('phase_end', (value) => emitPhaseEnd(state, value.phase, value.result))
    .with('message_start', () => undefined)
    .with('message_update', (value) =>
      handleAssistantEvent(state, value.assistantMessageEvent),
    )
    .with('message_end', () => endMessage(state))
    .with('tool_execution_start', (value) => emitToolExecutionStart(state, value))
    .with('tool_execution_end', (value) => emitToolExecutionEnd(state, value))
    .otherwise(() => undefined)
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
      }),
    )
    .with('thinking_start', 'thinking_delta', () => undefined)
    .with('toolcall_start', 'toolcall_delta', 'toolcall_end', () => undefined)
    .otherwise(() => undefined)
}

function emitToolExecutionStart(
  state: TuringMapperState,
  event: Extract<TuringAgentEvent, { type: 'tool_execution_start' }>,
) {
  const parentMessageId = ensureMessageStarted(state)
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

function emitPhaseStart(state: TuringMapperState, phase: AgentPhaseId) {
  state.emit({
    type: 'phase_start',
    phaseId: phase,
    label: startPhaseLabel(state, phase),
    timestamp: Date.now(),
    model: state.model,
  })
}

function emitPhaseEnd(
  state: TuringMapperState,
  phase: AgentPhaseId,
  result: Extract<TuringAgentEvent, { type: 'phase_end' }>['result'],
) {
  const summary = resolvePhaseSummary(phase, result)
  if (phase === 'perfect') {
    state.retryPerformFromFailedVerification = result.verified === false
  }
  // planSet/qaPlan are optional UI extras. Convert them defensively so a
  // malformed value can never throw out of the event mapper and drop the whole
  // phase_end event (which would make the phase card fail to render).
  const safeJson = (value: unknown): JsonValue | undefined => {
    if (value === undefined || value === null) return undefined
    try {
      return toJsonValue(value)
    } catch {
      return undefined
    }
  }
  const planSetJson = safeJson(result.planSet)
  const qaPlanJson = safeJson(result.qaPlan)
  const planJsonValue = Array.isArray(result.artifacts?.planJson)
    ? safeJson(result.artifacts.planJson)
    : undefined
  state.emit({
    type: 'phase_end',
    phaseId: phase,
    label: endPhaseLabel(state, phase),
    status: phaseResultToStatus(result),
    ...(summary ? { summary } : {}),
    ...(planJsonValue !== undefined ? { planJson: planJsonValue } : {}),
    ...(planSetJson !== undefined ? { planSet: planSetJson } : {}),
    ...(qaPlanJson !== undefined ? { qaPlan: qaPlanJson } : {}),
    ...(result.pendingUserQuestion
      ? {
          pendingUserQuestion: {
            phase: result.pendingUserQuestion.phase,
            question: result.pendingUserQuestion.question,
            ...(result.pendingUserQuestion.kind
              ? { kind: result.pendingUserQuestion.kind }
              : {}),
            ...(result.pendingUserQuestion.reason
              ? { reason: result.pendingUserQuestion.reason }
              : {}),
            ...(result.pendingUserQuestion.placeholder
              ? { placeholder: result.pendingUserQuestion.placeholder }
              : {}),
            ...(result.pendingUserQuestion.answerMode
              ? { answerMode: result.pendingUserQuestion.answerMode }
              : {}),
            ...(result.pendingUserQuestion.options?.length
              ? { options: [...result.pendingUserQuestion.options] }
              : {}),
          },
        }
      : {}),
    ...(result.display?.toolCallIds?.length ? { toolCallIds: result.display.toolCallIds } : {}),
    timestamp: Date.now(),
    model: state.model,
  })
}
