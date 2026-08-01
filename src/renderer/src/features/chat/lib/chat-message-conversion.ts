import { matchBy } from '@diegogbrisa/ts-match'
import type { MessagePart } from '@shared/types/agent'
import type { UIMessage } from '@shared/types/chat-ui'
import type { JsonValue } from '@shared/types/json'
import type { SessionDetail } from '@shared/types/session'
import { formatAttachmentPreview } from './chat-attachment-preview'

/**
 * Convert a persisted agent message part into renderer UI parts.
 * This is the boundary between storage transport shapes and chat presentation state.
 *
 * `toolResultByCallId` recovers a tool call's result for its UI part. Persisted
 * tool results live in their OWN message (a `tool-result` role node, see
 * `entry-projections.ts`), separate from the assistant message that issued the
 * call. Without this lookup the hydrated tool-call part would have no `output`,
 * which makes read/edit/write tool strips lose their expandable body (and become
 * unclickable) the moment a run completes and the snapshot replaces the live
 * stream.
 *
 * `skipResultIds` lists result ids already present in the SAME message as the
 * call. When the result is co-located with its call the inline block resolves it
 * via its own per-message fallback, so we leave the part untouched to keep the
 * conversion output stable for that common case. We only pre-attach results that
 * live in a DIFFERENT message — which is the real persisted shape for Pi sessions
 * and the case that was collapsing tool strips after hydration.
 */
export function messagePartToUIParts(
  part: MessagePart,
  toolResultByCallId?: ReadonlyMap<string, JsonValue>,
  skipResultIds?: ReadonlySet<string>,
): UIMessage['parts'] {
  return matchBy(part, 'type')
    .with('text', (value): UIMessage['parts'] => [{ type: 'text', content: value.text }])
    .with('tool-call', (value): UIMessage['parts'] => {
      const id = String(value.toolCall.id)
      // Skip a result that lives in the same message (the inline block's
      // per-message fallback already resolves it); only attach cross-message
      // results so the hydrated shape matches the streamed shape where needed.
      const output = skipResultIds?.has(id) ? undefined : toolResultByCallId?.get(id)
      return [
        {
          type: 'tool-call',
          id,
          name: value.toolCall.name,
          arguments: JSON.stringify(value.toolCall.args),
          state: value.toolCall.state ?? 'input-complete',
          // Attach the recovered result so expandable tool bodies (read/edit/
          // write, media, ask_user_question) survive run-completion hydration.
          ...(output !== undefined ? { output } : {}),
        },
      ]
    })
    .with('tool-result', (value): UIMessage['parts'] => [
      {
        type: 'tool-result',
        toolCallId: String(value.toolResult.id),
        content: value.toolResult.result,
        state: value.toolResult.isError ? 'error' : 'complete',
      },
    ])
    .with('attachment', (value): UIMessage['parts'] => [
      {
        type: 'text',
        content: formatAttachmentPreview(value.attachment),
      },
    ])
    .with('reasoning', (value): UIMessage['parts'] => [
      {
        type: 'thinking',
        content: value.text,
      },
    ])
    .exhaustive()
}

/**
 * Index every persisted tool-result part by its toolCallId, scanning ALL session
 * messages. Results are stored as standalone `tool-result` role messages, so a
 * single message's own parts are not enough — this cross-message view is what
 * lets `messagePartToUIParts` re-attach `output` to the originating call.
 */
export function buildToolResultLookup(
  messages: ReadonlyArray<{ readonly parts: readonly MessagePart[] }>,
) {
  const lookup = new Map<string, JsonValue>()
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.type !== 'tool-result') continue
      // First write wins: in a branching/replay scenario earlier occurrences
      // are the canonical match for the visible branch.
      if (!lookup.has(String(part.toolResult.id))) {
        lookup.set(String(part.toolResult.id), part.toolResult.result)
      }
    }
  }
  return lookup
}

export function sessionToUIMessages(session: SessionDetail): UIMessage[] {
  const toolResultByCallId = buildToolResultLookup(session.messages)
  return session.messages.map((msg) => {
    // Results co-located with their call in this same message are resolved by the
    // inline block's per-message fallback; don't pre-attach them.
    const sameMessageResultIds = new Set<string>()
    for (const part of msg.parts) {
      if (part.type === 'tool-result') sameMessageResultIds.add(String(part.toolResult.id))
    }
    return {
      id: String(msg.id),
      role: msg.role,
      parts: msg.parts.flatMap((part) =>
        messagePartToUIParts(part, toolResultByCallId, sameMessageResultIds),
      ),
      createdAt: new Date(msg.createdAt),
      ...(msg.metadata?.branchSummary ||
      msg.metadata?.compactionSummary ||
      msg.metadata?.phaseTranscript
        ? {
            metadata: {
              ...(msg.metadata.branchSummary ? { branchSummary: msg.metadata.branchSummary } : {}),
              ...(msg.metadata.compactionSummary
                ? { compactionSummary: msg.metadata.compactionSummary }
                : {}),
              ...(msg.metadata.phaseTranscript
                ? { phaseTranscript: msg.metadata.phaseTranscript }
                : {}),
            },
          }
        : {}),
    }
  })
}
export function buildPartialAssistantMessage(
  parts: readonly MessagePart[],
  messageId?: string,
): UIMessage | null {
  // The background-run snapshot may carry a tool-result part alongside its call
  // in the same array; recover it the same way the full-session path does.
  const toolResultByCallId = buildToolResultLookup([{ parts }])
  const sameMessageResultIds = new Set<string>()
  for (const part of parts) {
    if (part.type === 'tool-result') sameMessageResultIds.add(String(part.toolResult.id))
  }
  const uiParts: UIMessage['parts'] = parts.flatMap((part) =>
    messagePartToUIParts(part, toolResultByCallId, sameMessageResultIds),
  )
  if (uiParts.length === 0) {
    return null
  }

  return {
    id: messageId ?? `bg-stream-${Date.now()}`,
    role: 'assistant',
    parts: uiParts,
    createdAt: new Date(),
  }
}
