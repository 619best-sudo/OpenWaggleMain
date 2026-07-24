import { randomUUID } from 'node:crypto'
import type { Message, MessageRole } from '@shared/types/agent'
import { MessageId } from '@shared/types/brand'
import type { JsonValue } from '@shared/types/json'
import type { Message as TuringMessage } from 'turing-harness'
import {
  buildPersistedUserMessageParts,
  type PersistedUserMessagePartsPayload,
} from '../../agent/shared'
import type { ProjectedSessionNodeInput } from '../../ports/session-repository'
import { buildMessageNodeContentJson, buildRawNodeContentJson } from '../pi/message-parts'
import { piHistoryToProjectedMessages } from '../pi/pi-message-mapper'

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

/** Project the assistant/tool-result messages a run appended into shared Messages. */
export function turingAppendedToProjectedMessages(appended: readonly TuringMessage[]): Message[] {
  return piHistoryToProjectedMessages(appended.filter(isAssistantOrToolResult))
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
