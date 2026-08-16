import { randomUUID } from 'node:crypto'
import type { Message, MessageRole } from '@shared/types/agent'
import { MessageId } from '@shared/types/brand'
import type { JsonValue } from '@shared/types/json'
import type { Message as TuringMessage } from 'turing-harness'
import {
  buildPersistedUserMessageParts,
  type PersistedUserMessagePartsPayload,
} from '../../agent/shared'
import { createLogger } from '../../logger'
import type { ProjectedSessionNodeInput } from '../../ports/session-repository'
import { historyToProjectedMessages } from '../message-projection/message-mapper'
import {
  buildMessageNodeContentJson,
  buildRawNodeContentJson,
} from '../message-projection/message-parts'

const logger = createLogger('turing-message-projection')

function previewText(text: string, max = 60): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine
}

function describeProjected(message: Message): Record<string, unknown> {
  const textPart = message.parts.find((part) => part.type === 'text') as
    | { content?: string }
    | undefined
  const toolCalls = message.parts
    .filter((part) => part.type === 'tool-call')
    .map((part) => (part as { toolCall?: { id?: string; name?: string } }).toolCall)
  return {
    id: message.id,
    role: message.role,
    text: textPart?.content ? previewText(textPart.content) : null,
    toolCalls: toolCalls.map((tc) => ({ id: tc?.id, name: tc?.name })),
  }
}

/**
 * turing-harness message shapes are structurally identical to pi's runtime
 * messages (assistant `content[]` blocks; `toolResult` with
 * `toolCallId`/`toolName`/`content`/`isError`/`details`), so the existing
 * vendor-neutral pi projection helper converts them directly.
 */

type TuringAssistantMessage = Extract<TuringMessage, { role: 'assistant' }>
type TuringToolResultMessage = Extract<TuringMessage, { role: 'toolResult' }>

function isAssistantOrToolResult(
  message: TuringMessage,
): message is TuringAssistantMessage | TuringToolResultMessage {
  return message.role === 'assistant' || message.role === 'toolResult'
}

/**
 * The ALL-CAPS section markers that make up the turing-harness 4P handoff
 * CONTRACT — the machine-readable payload each phase emits for the next phase
 * and the host (parsed into phase cards: planJson/qaPlan/uiSummary/category/...).
 * They are NOT user-facing prose, so an assistant text block that contains them
 * is a phase-final handoff, not a chat message, and must not render as a bubble
 * alongside the phase card that already represents it.
 */
const HANDOFF_CONTRACT_MARKERS = [
  'SUMMARY:',
  'UI SUMMARY:',
  'TOOL CHAIN:',
  'CHAT SUMMARY:',
  'TOOL TRANSCRIPT:',
  'CATEGORY:',
  'PROJECT:',
  'RUN:',
  'STOP:',
  'VERIFY:',
  'CAPABILITIES:',
  'PROVIDER ASSIGNMENTS:',
  'FILE SEARCH:',
  'PLAN_JSON:',
  'PLANS_JSON:',
  'PLAN:',
  'ACCEPTANCE:',
  'CHANGES:',
  'QA_PLAN:',
  'VERDICT:',
  'FIX:',
  'MEMORY UPDATES:',
  'FILE MEMORY UPDATES:',
  'DEBUG_LOGS:',
]

const HANDOFF_MARKER_PATTERN = new RegExp(
  // Anchor to START-OF-STRING only (no `m` flag, no `\n` alternative). A genuine
  // phase-handoff contract BEGINS its text block with one of these markers; a
  // marker buried mid-paragraph (e.g. the model's own `**RUN SUMMARY:` recap at
  // the end of an answer) is natural prose, not a contract, and must not cause
  // the whole text part to be stripped. Without this anchor, `\n\s*RUN\b` would
  // match `**RUN SUMMARY:` on its own line and erase the entire user-facing
  // answer, leaving only the reasoning/thinking block.
  `^\\s*\\*?\\*?(${HANDOFF_CONTRACT_MARKERS.map((marker) => marker.replace(/:/g, '')).join('|')})\\b`,
)

/** Does this assistant text part look like a phase-final handoff contract? */
function isHandoffContractText(text: string): boolean {
  return HANDOFF_MARKER_PATTERN.test(text)
}

/**
 * Extract the user-facing prose from a phase-final handoff text block. The
 * harness designates `UI SUMMARY:` as the single user-facing status line; when
 * present, keep ONLY that (the rest is machine contract the phase card already
 * parses). When absent, the whole block is contract → drop it (empty string).
 */
function extractUserFacingProse(text: string): string {
  const match = text.match(
    /(?:^|\n)\s*\*?\*?UI SUMMARY:?\s*\*?\*?\s*([\s\S]*?)(?:\n\s*\*?\*?[A-Z][A-Z _]{2,}:|\n\s*```|$)/i,
  )
  const prose = match?.[1]?.trim()
  if (prose) return prose
  // No UI SUMMARY section → the entire text is machine contract; nothing user-facing.
  return ''
}

/**
 * Strip the machine handoff contract from assistant text parts, keeping only
 * genuine user-facing prose. Tool-call / tool-result / image parts are always
 * preserved (they are the actual work, shown in tool blocks + phase cards). A
 * text part with no contract markers is conversational and kept verbatim.
 */
function stripHandoffContractFromMessages(messages: readonly Message[]): Message[] {
  return messages.map((message) => {
    if (message.role !== 'assistant') return message
    let changed = false
    const nextParts = message.parts
      .map((part) => {
        if (part.type !== 'text') return part
        if (!isHandoffContractText(part.text)) return part
        changed = true
        const prose = extractUserFacingProse(part.text)
        return prose ? { ...part, text: prose } : null
      })
      .filter((part): part is NonNullable<typeof part> => part !== null)
    if (!changed) return message
    return { ...message, parts: nextParts }
  })
}

/**
 * Project the assistant/tool-result messages a run appended into shared Messages.
 *
 * `streamedAssistantIds` (optional) are the messageIds the event mapper assigned
 * to each streamed assistant turn, IN STREAM ORDER. When supplied, they are
 * assigned positionally to the projected assistant messages so the persisted
 * snapshot's ids AGREE with the live stream. Without this, projection mints
 * fresh ids and the renderer can't dedup the streamed messages against the
 * snapshot on hydration → every turn renders twice.
 */
export function turingAppendedToProjectedMessages(
  appended: readonly TuringMessage[],
  streamedAssistantIds?: readonly string[],
): Message[] {
  const filtered = appended.filter(isAssistantOrToolResult)
  logger.info('project: input appended', {
    rawCount: appended.length,
    assistantOrToolCount: filtered.length,
    rawRoles: appended.map((message) => message.role),
    streamedIdCount: streamedAssistantIds?.length ?? 0,
  })
  const projected = historyToProjectedMessages(filtered)
  const withStreamedIds = applyStreamedAssistantIds(projected, streamedAssistantIds)
  const stripped = stripHandoffContractFromMessages(withStreamedIds)
  logger.info('project: output projected', {
    count: stripped.length,
    messages: stripped.map((message) => describeProjected(message)),
  })
  return stripped
}

/**
 * Assign the streamed assistant-turn ids (positionally) to the projected
 * assistant messages. The mapper emits one `message_start…message_end` per
 * assistant turn, and the projection produces one assistant message per turn
 * (toolResults fold into the preceding assistant message), so the two sequences
 * are 1:1 in order. If counts ever diverge we leave the ids alone rather than
 * misalign them.
 */
function applyStreamedAssistantIds(
  messages: readonly Message[],
  streamedAssistantIds: readonly string[] | undefined,
): Message[] {
  if (!streamedAssistantIds?.length) return [...messages]
  const assistantIndices = messages
    .map((message, index) => (message.role === 'assistant' ? index : -1))
    .filter((index) => index >= 0)
  if (assistantIndices.length !== streamedAssistantIds.length) {
    logger.warn('streamed id count does not match projected assistant count; leaving ids as-is', {
      streamedCount: streamedAssistantIds.length,
      projectedAssistantCount: assistantIndices.length,
    })
    return [...messages]
  }
  return messages.map((message, index) => {
    const position = assistantIndices.indexOf(index)
    if (position < 0) return message
    const streamedId = streamedAssistantIds[position]
    if (!streamedId) return message
    return { ...message, id: MessageId(streamedId) }
  })
}

/** Build the full new-message list for a run: the user turn + everything appended. */
export function buildTuringRunNewMessages(
  payload: PersistedUserMessagePartsPayload,
  appended: readonly TuringMessage[],
): Message[] {
  const userMessage: Message = {
    id: MessageId(randomUUID()),
    role: 'user',
    parts: buildPersistedUserMessageParts(payload),
    createdAt: Date.now(),
  }
  return [userMessage, ...turingAppendedToProjectedMessages(appended)]
}

/**
 * Variant that reuses an ALREADY-PROJECTED appended-message list instead of
 * re-projecting the raw turing messages. Projection mints a fresh id per
 * assistant/tool message, so calling it twice for the same run produces TWO
 * independent id sets for identical content — the persisted snapshot and the
 * returned `newMessages` then disagree on ids, dedup-by-id fails, and every
 * turn renders twice. Project ONCE (in the run-result builder) and thread that
 * single projection into both the snapshot and the returned messages.
 */
export function buildTuringRunNewMessagesFromProjected(
  payload: PersistedUserMessagePartsPayload,
  projectedAppended: readonly Message[],
): Message[] {
  const userMessage: Message = {
    id: MessageId(randomUUID()),
    role: 'user',
    parts: buildPersistedUserMessageParts(payload),
    createdAt: Date.now(),
  }
  return [userMessage, ...projectedAppended]
}

export interface TuringSessionSnapshot {
  readonly nodes: readonly ProjectedSessionNodeInput[]
  readonly activeNodeId: string | null
}

export function reparentProjectedNodesToTail(
  nodes: readonly ProjectedSessionNodeInput[],
  parentId: string | null,
  startIndex = 0,
): ProjectedSessionNodeInput[] {
  const reparented: ProjectedSessionNodeInput[] = []
  let nextParentId = parentId
  for (const [index, node] of nodes.entries()) {
    reparented.push({
      ...node,
      parentId: nextParentId,
      pathDepth: startIndex + index,
      createdOrder: startIndex + index,
    })
    nextParentId = node.id
  }
  return reparented
}

export interface TuringProjectedSessionNode {
  readonly id: string
  readonly piEntryType: string
  readonly kind: ProjectedSessionNodeInput['kind']
  readonly role: MessageRole | null
  readonly timestampMs: number
  readonly contentJson: string
  readonly metadataJson: string
}

export type TuringSessionSnapshotTimelineEntry =
  | {
      readonly type: 'message'
      readonly message: Message
    }
  | {
      readonly type: 'node'
      readonly node: TuringProjectedSessionNode
    }

function nodeKindForRole(role: MessageRole): ProjectedSessionNodeInput['kind'] {
  if (role === 'user') return 'user_message'
  if (role === 'assistant') return 'assistant_message'
  return 'system_message'
}

function projectedNodeFromMessage(message: Message): TuringProjectedSessionNode {
  return {
    id: message.id,
    piEntryType: 'message',
    kind: nodeKindForRole(message.role),
    role: message.role,
    timestampMs: message.createdAt,
    contentJson: buildMessageNodeContentJson([...message.parts], message.model ?? null),
    metadataJson: '{}',
  }
}

export function buildCustomSessionNode(input: {
  readonly nodeId?: string
  readonly customType: string
  readonly data: JsonValue
  readonly timestampMs: number
}): TuringProjectedSessionNode {
  return {
    id: input.nodeId ?? randomUUID(),
    piEntryType: 'custom',
    kind: 'custom',
    role: null,
    timestampMs: input.timestampMs,
    contentJson: buildRawNodeContentJson({
      customType: input.customType,
      data: input.data,
    }),
    metadataJson: '{}',
  }
}

export function buildSessionSnapshotFromTimeline(
  entries: readonly TuringSessionSnapshotTimelineEntry[],
): TuringSessionSnapshot {
  const nodes: ProjectedSessionNodeInput[] = []
  let parentId: string | null = null
  let activeNodeId: string | null = null

  for (const [index, entry] of entries.entries()) {
    const node = entry.type === 'message' ? projectedNodeFromMessage(entry.message) : entry.node
    nodes.push({
      id: node.id,
      parentId,
      piEntryType: node.piEntryType,
      kind: node.kind,
      role: node.role,
      timestampMs: node.timestampMs,
      contentJson: node.contentJson,
      metadataJson: node.metadataJson,
      pathDepth: index,
      createdOrder: index,
    })
    parentId = node.id
    activeNodeId = node.id
  }

  return { nodes, activeNodeId }
}

/**
 * Build the session snapshot from the FULL conversation (prior turns + this
 * run's new messages), not just the current turn. turing-harness is stateless
 * per run, but `persistSnapshot` REPLACES the whole node tree — so the snapshot
 * has to carry the entire history or earlier turns are lost. Each message's own
 * stable `id` is used as the node id (matching the ids returned in
 * `newMessages`), so re-persisting across runs neither churns ids nor breaks
 * branch derivation / the sidebar thread tree. The tree is linear: each node's
 * parent is the previous message.
 */
export function buildSessionSnapshotFromMessages(
  messages: readonly Message[],
): TuringSessionSnapshot {
  return buildSessionSnapshotFromTimeline(
    messages.map((message) => ({
      type: 'message' as const,
      message,
    })),
  )
}
