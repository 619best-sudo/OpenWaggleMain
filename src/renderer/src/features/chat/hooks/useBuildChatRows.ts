import type { UIMessage } from '@shared/types/chat-ui'
import type { MachineExecutionState } from '@shared/types/machine'
import { getAgentPhaseTitle } from '@shared/types/phase-titles'
import type { SessionInterruptedRun } from '@shared/types/session'
import type { AgentTransportPhaseEndEvent } from '@shared/types/stream'
import type { PendingUserQuestionRequest } from '@shared/types/user-question'
import type { WaggleMessageMetadata } from '@shared/types/waggle'
import type { StreamingPhaseState } from '@/features/chat/hooks/useStreamingPhase'
import { createRendererLogger } from '@/shared/lib/logger'
import type {
  ChatRow,
  MessageChatRow,
  PhaseTimelineChatRow,
  PhaseTimelineToolDetail,
} from '../lib/types-chat-row'

type ToolResultPart = Extract<UIMessage['parts'][number], { type: 'tool-result' }>
type ToolCallPart = Extract<UIMessage['parts'][number], { type: 'tool-call' }>
type SummaryRow = Extract<ChatRow, { type: 'branch-summary' | 'compaction-summary' }>

const rendererLogger = createRendererLogger('use-build-chat-rows')

function isToolResultOnlyMessage(message: UIMessage) {
  return message.parts.length > 0 && message.parts.every((part) => part.type === 'tool-result')
}

function sameWaggleTurn(
  current: WaggleMessageMetadata | undefined,
  previous: WaggleMessageMetadata | undefined,
) {
  const bothHaveSessionId = current?.sessionId !== undefined && previous?.sessionId !== undefined
  return (
    current !== undefined &&
    previous !== undefined &&
    current.agentIndex === previous.agentIndex &&
    current.agentLabel === previous.agentLabel &&
    current.agentColor === previous.agentColor &&
    current.agentModel === previous.agentModel &&
    current.turnNumber === previous.turnNumber &&
    (!bothHaveSessionId || current.sessionId === previous.sessionId)
  )
}

function getWaggleTurnId(meta: WaggleMessageMetadata, firstMessageId: string) {
  return [
    'waggle-turn',
    meta.sessionId ?? 'session',
    String(meta.turnNumber),
    String(meta.agentIndex),
    firstMessageId,
  ].join(':')
}

function withoutInlineTurnDivider(row: MessageChatRow) {
  return {
    ...row,
    showTurnDivider: false,
    turnDividerProps: undefined,
  }
}

function groupWaggleTurnRows(rows: readonly ChatRow[]) {
  const groupedRows: ChatRow[] = []

  for (const row of rows) {
    if (row.type !== 'message' || row.message.role !== 'assistant' || !row.waggleMeta) {
      groupedRows.push(row)
      continue
    }

    const previousRow = groupedRows[groupedRows.length - 1]
    if (
      previousRow?.type === 'waggle-turn' &&
      sameWaggleTurn(row.waggleMeta, previousRow.messages[0]?.waggleMeta)
    ) {
      groupedRows[groupedRows.length - 1] = {
        ...previousRow,
        messages: [...previousRow.messages, withoutInlineTurnDivider(row)],
      }
      continue
    }

    groupedRows.push({
      type: 'waggle-turn',
      id: getWaggleTurnId(row.waggleMeta, row.message.id),
      agentColor: row.waggleMeta.agentColor,
      turnDividerProps: {
        turnNumber: row.waggleMeta.turnNumber,
        agentLabel: row.waggleMeta.agentLabel,
        agentColor: row.waggleMeta.agentColor,
        agentModel: row.waggleMeta.agentModel,
      },
      messages: [withoutInlineTurnDivider(row)],
    })
  }

  return groupedRows
}

function toolCallIds(message: UIMessage) {
  const ids = new Set<string>()
  for (const part of message.parts) {
    if (part.type === 'tool-call') {
      ids.add(part.id)
    }
  }
  return ids
}

function canNestToolResultMessage(target: UIMessage, toolResults: readonly ToolResultPart[]) {
  if (target.role !== 'assistant') {
    return false
  }

  const ids = toolCallIds(target)
  return toolResults.some((part) => ids.has(part.toolCallId))
}

function appendToolResultParts(target: UIMessage, toolResults: readonly ToolResultPart[]) {
  const existingResultIds = new Set(
    target.parts.filter((part) => part.type === 'tool-result').map((part) => part.toolCallId),
  )
  const nextResults = toolResults.filter((part) => !existingResultIds.has(part.toolCallId))
  return nextResults.length > 0 ? { ...target, parts: [...target.parts, ...nextResults] } : target
}

function attachToolResultSource(toolResults: readonly ToolResultPart[], sourceMessageId: string) {
  return toolResults.map((part) => ({ ...part, sourceMessageId }))
}

function getSummaryRow(message: UIMessage): SummaryRow | null {
  const branchSummary = message.metadata?.branchSummary
  if (branchSummary) {
    return {
      type: 'branch-summary',
      id: message.id,
      summary: branchSummary.summary,
    }
  }

  const compactionSummary = message.metadata?.compactionSummary
  if (compactionSummary) {
    return {
      type: 'compaction-summary',
      id: message.id,
      summary: compactionSummary.summary,
      tokensBefore: compactionSummary.tokensBefore,
    }
  }

  return null
}

function buildToolDetailLookup(messages: readonly UIMessage[]) {
  const toolCalls = new Map<string, ToolCallPart>()
  const toolResults = new Map<string, ToolResultPart>()

  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === 'tool-call') {
        toolCalls.set(part.id, part)
        continue
      }

      if (part.type === 'tool-result') {
        toolResults.set(part.toolCallId, part)
      }
    }
  }

  return { toolCalls, toolResults }
}

function createPhaseRows(
  message: UIMessage,
  toolLookup: ReturnType<typeof buildToolDetailLookup>,
): PhaseTimelineChatRow[] {
  const phaseTranscript = message.metadata?.phaseTranscript
  if (!phaseTranscript) {
    return []
  }

  return phaseTranscript.phases.map((phase) => ({
    type: 'phase',
    id: `${message.id}:${phase.id}`,
    sourceMessageId: message.id,
    phase: {
      ...phase,
      tools: phase.tools.map<PhaseTimelineToolDetail>((tool) => ({
        ...tool,
        toolCall: toolLookup.toolCalls.get(tool.toolCallId),
        toolResult: toolLookup.toolResults.get(tool.toolCallId),
      })),
      ...(phase.pendingUserQuestion ? { pendingUserQuestion: phase.pendingUserQuestion } : {}),
    },
  }))
}

function createLivePhaseRows(
  livePhaseEvents: readonly AgentTransportPhaseEndEvent[],
  toolLookup: ReturnType<typeof buildToolDetailLookup>,
): PhaseTimelineChatRow[] {
  return livePhaseEvents.map((event) => ({
    type: 'phase',
    id: `live-phase:${event.phaseId}`,
    sourceMessageId: `live-phase:${event.phaseId}`,
    phase: {
      id: event.phaseId,
      label: event.label,
      activityText:
        event.summary ?? event.pendingUserQuestion?.reason ?? `${event.label} completed.`,
      status: event.status,
      elapsedMs: 0,
      ...(event.summary ? { summary: event.summary } : {}),
      ...(event.planJson !== undefined ? { planJson: event.planJson } : {}),
      ...(event.planSet !== undefined ? { planSet: event.planSet } : {}),
      ...(event.qaPlan !== undefined ? { qaPlan: event.qaPlan } : {}),
      ...(event.pendingUserQuestion ? { pendingUserQuestion: event.pendingUserQuestion } : {}),
      tools: (event.toolCallIds ?? []).map<PhaseTimelineToolDetail>((toolCallId) => ({
        toolCallId,
        toolName:
          toolLookup.toolCalls.get(toolCallId)?.name ??
          toolLookup.toolResults.get(toolCallId)?.toolName ??
          'tool',
        status: toolLookup.toolResults.has(toolCallId) ? 'completed' : 'running',
        toolCall: toolLookup.toolCalls.get(toolCallId),
        toolResult: toolLookup.toolResults.get(toolCallId),
      })),
    },
  }))
}

function createLivePendingQuestionPhaseRow(
  request: PendingUserQuestionRequest,
  phase: StreamingPhaseState,
): PhaseTimelineChatRow {
  const livePhaseLabel = phase.current?.label ?? getAgentPhaseTitle(request.phase)

  return {
    type: 'phase',
    id: `live-pending-question:${request.phase}`,
    sourceMessageId: `live-pending-question:${request.phase}`,
    phase: {
      id: request.phase,
      label: livePhaseLabel,
      activityText: request.reason ?? 'Waiting for your answer to continue.',
      status: 'running',
      elapsedMs: phase.current?.elapsedMs ?? 0,
      tools: [],
      pendingUserQuestion: request,
    },
  }
}

function computePhaseBackedAssistantMessageIds(_messages: readonly UIMessage[]) {
  // "Show all bubbles" policy: the raw per-phase assistant messages that precede
  // a persisted phase-transcript node are NO LONGER suppressed — they render as
  // normal chat bubbles next to the phase cards. (Previously this walked back
  // from each phase-transcript message and hid the assistant turns behind it.)
  // Kept as a no-op so the call sites and their intent stay explicit and this is
  // a one-line revert if the phase-cards-only view is wanted again.
  return new Set<string>()
}

function hasLegacyToolTranscriptContent(message: UIMessage) {
  return message.parts.some(
    (part) => part.type === 'thinking' || part.type === 'tool-call' || part.type === 'tool-result',
  )
}

function hasRenderableAssistantBubbleContent(message: UIMessage) {
  return message.parts.some((part) => {
    if (part.type === 'text') {
      return part.content.trim().length > 0
    }

    return (
      part.type === 'image' ||
      part.type === 'audio' ||
      part.type === 'video' ||
      part.type === 'document'
    )
  })
}

function tryNestToolResultMessage(rows: ChatRow[], message: UIMessage) {
  if (!isToolResultOnlyMessage(message)) {
    return false
  }

  const previousRow = rows[rows.length - 1]
  const toolResults = message.parts.filter((part) => part.type === 'tool-result')
  const sourcedToolResults = attachToolResultSource(toolResults, message.id)
  if (
    previousRow?.type !== 'message' ||
    !canNestToolResultMessage(previousRow.message, sourcedToolResults)
  ) {
    return false
  }

  rows[rows.length - 1] = {
    ...previousRow,
    message: appendToolResultParts(previousRow.message, sourcedToolResults),
  }
  return true
}

function createMessageRow({
  message,
  meta,
  previousVisibleWaggleMeta,
  isStreaming,
  isLoading,
}: {
  readonly message: UIMessage
  readonly meta: WaggleMessageMetadata | undefined
  readonly previousVisibleWaggleMeta: WaggleMessageMetadata | undefined
  readonly isStreaming: boolean
  readonly isLoading: boolean
}): MessageChatRow {
  const showTurnDivider =
    !!meta && message.role === 'assistant' && !sameWaggleTurn(meta, previousVisibleWaggleMeta)
  return {
    type: 'message',
    message,
    isStreaming,
    isRunActive: isLoading,
    showTurnDivider,
    turnDividerProps: showTurnDivider
      ? {
          turnNumber: meta.turnNumber,
          agentLabel: meta.agentLabel,
          agentColor: meta.agentColor,
          agentModel: meta.agentModel,
        }
      : undefined,
    assistantModel: message.role === 'assistant' ? meta?.agentModel : undefined,
    waggle: meta ? { agentLabel: meta.agentLabel, agentColor: meta.agentColor } : undefined,
    waggleMeta: meta,
  }
}

function appendStatusRows(rows: ChatRow[], params: BuildChatRowsParams) {
  const waitingForUserQuestion =
    params.pendingUserQuestionRequest !== null && params.pendingUserQuestionRequest !== undefined

  if (waitingForUserQuestion) {
    if (params.error && !params.isLoading) {
      rows.push({
        type: 'error',
        error: params.error,
        lastUserMessage: params.lastUserMessage,
        dismissedError: params.dismissedError,
        sessionId: params.sessionId ? String(params.sessionId) : null,
      })
    }
    return
  }

  if (params.phase.current) {
    rows.push({
      type: 'phase-indicator',
      label: 'Working',
      elapsedMs: params.phase.current.elapsedMs,
    })
  }
  if (!params.phase.current && params.isLoading) {
    rows.push({
      type: 'phase-indicator',
      label: 'Thinking',
      elapsedMs: params.phase.totalElapsedMs,
    })
  }
  if (!params.isLoading && !params.phase.current && params.phase.completed.length > 0) {
    rows.push({
      type: 'run-summary',
      phases: params.phase.completed,
      totalMs: params.phase.totalElapsedMs,
      completedAtMs: params.phase.completedAtMs,
    })
  }
  if (params.error && !params.isLoading) {
    rows.push({
      type: 'error',
      error: params.error,
      lastUserMessage: params.lastUserMessage,
      dismissedError: params.dismissedError,
      sessionId: params.sessionId ? String(params.sessionId) : null,
    })
  }
}

interface BuildChatRowsParams {
  messages: UIMessage[]
  allMessages?: readonly UIMessage[]
  machinePlan: MachineExecutionState | null
  isLoading: boolean
  error: Error | undefined
  lastUserMessage: string | null
  dismissedError: string | null
  sessionId: string | null
  waggleMetadataLookup: Readonly<Record<string, WaggleMessageMetadata>>
  phase: StreamingPhaseState
  interruptedRun?: SessionInterruptedRun
  pendingUserQuestionRequest?: PendingUserQuestionRequest | null
  livePhaseEvents?: readonly AgentTransportPhaseEndEvent[]
}

function appendInterruptedRunRow(rows: ChatRow[], params: BuildChatRowsParams) {
  if (!params.interruptedRun || params.isLoading) {
    return
  }
  rows.push({
    type: 'interrupted-run',
    runId: params.interruptedRun.runId,
    branchId: params.interruptedRun.branchId,
    runMode: params.interruptedRun.runMode,
    model: params.interruptedRun.model,
    interruptedAt: params.interruptedRun.interruptedAt,
  })
}

// Identity-memoized: row building re-runs on every stream event, and in machine
// mode `messageText` is called for each user message to match the machine
// request. Keying on message identity means only the active message re-extracts
// (the messages array is prefix-stable while streaming). Different derivation
// from `getUIMessageText` (single-`\n` join + trim), so it has its own cache.
const messageTextCache = new WeakMap<UIMessage, string>()

function messageText(message: UIMessage) {
  const cached = messageTextCache.get(message)
  if (cached !== undefined) {
    return cached
  }
  const text = message.parts
    .filter(
      (part): part is Extract<UIMessage['parts'][number], { type: 'text' }> => part.type === 'text',
    )
    .map((part) => part.content)
    .join('\n')
    .trim()
  messageTextCache.set(message, text)
  return text
}

function createSyntheticUserMessage(id: string, text: string): UIMessage {
  return {
    id,
    role: 'user',
    parts: [{ type: 'text', content: text }],
  }
}

function findSyntheticMachineRequestInsertIndex(rows: ChatRow[]) {
  const firstAssistantIndex = rows.findIndex(
    (row) => row.type === 'message' && row.message.role === 'assistant',
  )

  if (firstAssistantIndex >= 0) {
    return firstAssistantIndex
  }

  const interruptedRunCount = rows.filter((row) => row.type === 'interrupted-run').length
  return interruptedRunCount
}

export function buildChatRows(params: BuildChatRowsParams): ChatRow[] {
  const rows: ChatRow[] = []
  appendInterruptedRunRow(rows, params)
  let lastUserRowIndex = -1
  let renderedPendingQuestionPhase = false
  const hasPhaseTranscriptMessages = params.messages.some(
    (message) => !!message.metadata?.phaseTranscript,
  )
  const phaseBackedAssistantMessageIds = computePhaseBackedAssistantMessageIds(params.messages)
  const toolLookup = buildToolDetailLookup(params.allMessages ?? params.messages)
  const livePhaseRows = hasPhaseTranscriptMessages
    ? []
    : createLivePhaseRows(params.livePhaseEvents ?? [], toolLookup)
  const machineOriginalRequest =
    params.machinePlan?.originalRequest?.replace(/\s+/g, ' ').trim() ?? null
  let hasVisibleOriginalRequest = false
  const lastUserMessageIndex = (() => {
    for (let index = params.messages.length - 1; index >= 0; index -= 1) {
      if (params.messages[index]?.role === 'user') {
        return index
      }
    }
    return -1
  })()
  // UserQuestionCard and PlanReviewActions are now inline in the transcript
  // (not inside a phase card), so assistant messages behind them should stay
  // visible — the user can still see tools and context while answering.
  const hideCurrentTurnAssistantMessages = false

  const lastMessage = params.messages[params.messages.length - 1]
  const lastIsStreaming = params.isLoading && lastMessage?.role === 'assistant'
  let previousVisibleWaggleMeta: WaggleMessageMetadata | undefined

  for (let index = 0; index < params.messages.length; index += 1) {
    const message = params.messages[index]
    const phaseRows = createPhaseRows(message, toolLookup)
    if (phaseRows.length > 0) {
      // Phase cards are fully suppressed — tool calls render inline via
      // AssistantMessageBubble's InlineToolBlock. UserQuestionCard and
      // PlanReviewActions now render as standalone inline rows below.
      const pendingRows = phaseRows.filter(
        (row) => row.phase.pendingUserQuestion !== undefined,
      )
      if (pendingRows.length > 0) {
        renderedPendingQuestionPhase = true
      }
      continue
    }

    const summaryRow = getSummaryRow(message)
    if (summaryRow) {
      rows.push(summaryRow)
      continue
    }
    if (tryNestToolResultMessage(rows, message)) {
      continue
    }

    if (message.role === 'assistant' && phaseBackedAssistantMessageIds.has(message.id)) {
      continue
    }

    if (
      message.role === 'assistant' &&
      hasLegacyToolTranscriptContent(message) &&
      (hasPhaseTranscriptMessages || !hasRenderableAssistantBubbleContent(message)) &&
      phaseBackedAssistantMessageIds.has(message.id)
    ) {
      continue
    }

    if (
      hideCurrentTurnAssistantMessages &&
      message.role === 'assistant' &&
      index > lastUserMessageIndex
    ) {
      continue
    }

    const meta = params.waggleMetadataLookup[message.id]
    rows.push(
      createMessageRow({
        message,
        meta,
        previousVisibleWaggleMeta,
        isStreaming: lastIsStreaming && index === params.messages.length - 1,
        isLoading: params.isLoading,
      }),
    )
    if (message.role === 'user') {
      lastUserRowIndex = rows.length - 1
      if (machineOriginalRequest && messageText(message) === machineOriginalRequest) {
        hasVisibleOriginalRequest = true
      }
    }

    if (meta && message.role === 'assistant') {
      previousVisibleWaggleMeta = meta
    }
  }

  if (livePhaseRows.length > 0) {
    // Phase cards are fully suppressed.
    const livePendingRows = livePhaseRows.filter(
      (row) => row.phase.pendingUserQuestion !== undefined,
    )
    if (livePendingRows.length > 0) {
      renderedPendingQuestionPhase = true
    }
  }

  // UserQuestionCard and PlanReviewActions are rendered in ChatPanel
  // (outside the transcript) — no phase card rows needed.
  if (params.machinePlan) {
    if (machineOriginalRequest && !hasVisibleOriginalRequest) {
      const syntheticUserRow = createMessageRow({
        message: createSyntheticUserMessage(
          `machine-request:${params.machinePlan.generatedAt}`,
          machineOriginalRequest,
        ),
        meta: undefined,
        previousVisibleWaggleMeta,
        isStreaming: false,
        isLoading: params.isLoading,
      })
      const syntheticInsertIndex = findSyntheticMachineRequestInsertIndex(rows)
      rows.splice(syntheticInsertIndex, 0, syntheticUserRow)
      lastUserRowIndex = syntheticInsertIndex
    }

    const machineTimelineRow: ChatRow = {
      type: 'machine-timeline',
      id: `machine-timeline:${params.machinePlan.generatedAt}`,
      plan: params.machinePlan,
      variant: 'primary',
    }
    if (lastUserRowIndex >= 0) {
      rows.splice(lastUserRowIndex + 1, 0, machineTimelineRow)
    } else {
      rows.push(machineTimelineRow)
    }
  }

  appendStatusRows(rows, params)
  if (
    params.machinePlan &&
    (params.machinePlan.phase === 'completed' || params.machinePlan.phase === 'failed')
  ) {
    rows.push({
      type: 'machine-timeline',
      id: `machine-timeline-summary:${params.machinePlan.generatedAt}`,
      plan: params.machinePlan,
      variant: 'summary',
    })
  }
  const groupedRows = groupWaggleTurnRows(rows)
  // ORDER DEBUG: the final rendered row order — this is exactly what the user
  // sees. Assembling it walks every row's text, so it stays behind the debug
  // level: row building runs on every transcript re-render.
  if (rendererLogger.isDebugEnabled?.() === true) {
    rendererLogger.debug('built chat rows', {
      messageCount: params.messages.length,
      isLoading: params.isLoading,
      hasPhaseTranscriptMessages,
      completedPhaseCount: params.phase.completed.length,
      pendingUserQuestionPhase: params.pendingUserQuestionRequest?.phase ?? null,
      rows: groupedRows.map((row) => {
        if (row.type === 'message') {
          return {
            type: row.type,
            id: row.message.id,
            role: row.message.role,
            text: messageText(row.message).replace(/\s+/g, ' ').slice(0, 50) || null,
          }
        }
        if (row.type === 'phase') {
          return { type: row.type, phaseId: row.phase.id, status: row.phase.status }
        }
        return { type: row.type, id: 'id' in row ? row.id : null }
      }),
    })
  }
  return groupedRows
}
