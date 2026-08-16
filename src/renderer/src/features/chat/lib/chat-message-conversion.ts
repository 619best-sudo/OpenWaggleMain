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
  const cache = conversionCacheForSession(session.id)
  return session.messages.map((msg) => {
    // Results co-located with their call in this same message are resolved by the
    // inline block's per-message fallback; don't pre-attach them.
    const sameMessageResultIds = new Set<string>()
    for (const part of msg.parts) {
      if (part.type === 'tool-result') sameMessageResultIds.add(String(part.toolResult.id))
    }
    // Identity stability: every hydration used to build fresh message and part
    // objects for the WHOLE session, which defeated every row memoization in the
    // transcript (rows compare by message identity) and re-parsed all completed
    // markdown — the end-of-run full re-render. The fingerprint covers the
    // message itself AND the cross-message outputs attached to its calls (a
    // result persisted later changes an earlier call's UI shape), so a byte-equal
    // node reconverts to the SAME object and the row bails out. Re-parsing the
    // same JSON text yields the same key order, so JSON.stringify is a stable
    // fingerprint for DB-projection objects.
    const attachedOutputs: Record<string, JsonValue> = {}
    for (const part of msg.parts) {
      if (part.type !== 'tool-call') continue
      const id = String(part.toolCall.id)
      if (!sameMessageResultIds.has(id)) {
        const output = toolResultByCallId.get(id)
        if (output !== undefined) attachedOutputs[id] = output
      }
    }
    const fingerprint = `${JSON.stringify(msg)}\n${JSON.stringify(attachedOutputs)}`
    const cached = cache.get(String(msg.id))
    if (cached && cached.fingerprint === fingerprint) {
      return cached.ui
    }
    const ui = convertPersistedMessage(msg, toolResultByCallId, sameMessageResultIds)
    cache.set(String(msg.id), { fingerprint, ui })
    return ui
  })
}

/** Extracted per-message conversion so the cache path can share it. */
function convertPersistedMessage(
  msg: SessionDetail['messages'][number],
  toolResultByCallId: ReadonlyMap<string, JsonValue>,
  sameMessageResultIds: ReadonlySet<string>,
): UIMessage {
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
}

/**
 * Fingerprint → converted-message cache, per session. Bounded: a session's
 * fingerprint entries are proportional to its message count, and only tiny
 * fingerprint strings plus the (already-retained) UI objects are stored.
 */
interface ConversionCacheEntry {
  readonly fingerprint: string
  readonly ui: UIMessage
}

const CONVERSION_CACHE_MAX_SESSIONS = 8
const conversionCacheBySession = new Map<string, Map<string, ConversionCacheEntry>>()

function conversionCacheForSession(sessionId: string): Map<string, ConversionCacheEntry> {
  const existing = conversionCacheBySession.get(sessionId)
  if (existing) {
    // LRU touch so the most recently hydrated sessions survive eviction.
    conversionCacheBySession.delete(sessionId)
    conversionCacheBySession.set(sessionId, existing)
    return existing
  }
  const fresh = new Map<string, ConversionCacheEntry>()
  conversionCacheBySession.set(sessionId, fresh)
  while (conversionCacheBySession.size > CONVERSION_CACHE_MAX_SESSIONS) {
    const oldest = conversionCacheBySession.keys().next().value
    if (oldest === undefined) break
    conversionCacheBySession.delete(oldest)
  }
  return fresh
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
