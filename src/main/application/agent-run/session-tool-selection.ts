/**
 * Per-session memory of which skills/MCPs the user explicitly attached via
 * composer "/" mentions.
 *
 * The run pipeline is per-message: `payload.text` carries the mentions of the
 * CURRENT message only. This store makes the selection STICKY for the session —
 * a follow-up like "now take a screenshot" (no mention) keeps running with the
 * skills/MCPs the user selected earlier, until the session ends. Entries are
 * in-memory only (restart clears them) and bounded so abandoned sessions don't
 * accumulate.
 *
 * Only what actually ATTACHED is recorded (mentions ∩ enabled): a mention of a
 * disabled MCP is ignored per product policy and must not stick around waiting
 * for the toggle to flip.
 */

import { extractMcpServerReferences } from '@shared/domain/mcp-references'
import { extractExplicitSkillReferences } from '@shared/domain/skill-references'
import type { SessionId } from '@shared/types/brand'
import type { McpSettingsView } from '@shared/types/mcp'

export interface SessionToolSelection {
  readonly skillIds: readonly string[]
  readonly mcpNames: readonly string[]
}

interface MutableSessionToolSelection {
  readonly skillIds: Set<string>
  readonly mcpNames: Set<string>
}

const MAX_TRACKED_SESSIONS = 200
const selections = new Map<SessionId, MutableSessionToolSelection>()

/** Explicit `/x` + `$x` tokens and `/name` MCP mentions in one message's text. */
export interface RunToolMentions {
  /** Explicit skill references (slash + dollar), lowercased, deduped. */
  readonly skillIds: readonly string[]
  /** Slash tokens that matched a KNOWN MCP server name (enabled or not). */
  readonly mcpNamesMentioned: readonly string[]
  /** The subset of `mcpNamesMentioned` whose server is currently enabled. */
  readonly mcpNamesEnabled: readonly string[]
}

export function getSessionToolSelection(sessionId: SessionId): SessionToolSelection {
  const entry = selections.get(sessionId)
  return {
    skillIds: entry ? [...entry.skillIds] : [],
    mcpNames: entry ? [...entry.mcpNames] : [],
  }
}

/**
 * Replace the session's stored selection with what actually ATTACHED this run.
 *
 * Replace (not union) is deliberate: the run path computes
 * `wanted = sticky ∪ mentions` upstream, so unioning here would be redundant —
 * but replacing also PRUNES: a skill/MCP the user explicitly toggles off in
 * Settings drops out of the sticky set on the next run and must be re-mentioned.
 * Also refreshes recency (oldest entries evicted past {@link MAX_TRACKED_SESSIONS}).
 */
export function recordSessionToolSelection(
  sessionId: SessionId,
  selection: SessionToolSelection,
): void {
  const entry: MutableSessionToolSelection = {
    skillIds: new Set(selection.skillIds.map((id) => id.toLowerCase())),
    mcpNames: new Set(selection.mcpNames),
  }
  // Refresh recency for LRU eviction: Map iterates in insertion order.
  selections.delete(sessionId)
  selections.set(sessionId, entry)
  while (selections.size > MAX_TRACKED_SESSIONS) {
    const oldest = selections.keys().next()
    if (oldest.done) break
    selections.delete(oldest.value)
  }
}

export function clearSessionToolSelection(sessionId: SessionId): void {
  selections.delete(sessionId)
}

/**
 * Parse one message's text into tool mentions against the project's MCP view.
 * Skill references keep the legacy explicit semantics (`/x` and `$x`); MCP
 * mentions are slash-only, matched case-insensitively against server names.
 */
export function extractRunToolMentions(
  text: string,
  mcpSettings: McpSettingsView | undefined,
): RunToolMentions {
  const skillIds = extractExplicitSkillReferences(text).allSkillIds
  const allNames = (mcpSettings?.servers ?? []).map((summary) => summary.name)
  const mcpNamesMentioned = extractMcpServerReferences(text, allNames)
  const enabledNames = new Set(
    (mcpSettings?.servers ?? [])
      .filter((summary) => summary.enabled)
      .map((summary) => summary.name),
  )
  return {
    skillIds,
    mcpNamesMentioned,
    mcpNamesEnabled: mcpNamesMentioned.filter((name) => enabledNames.has(name)),
  }
}

/**
 * Narrow an MCP settings view down to the given (enabled) server names so the
 * kernel only sees what this run should attach. Both `servers` summaries and
 * `effective.mcpServers` definitions are filtered — the bridge resolves spawn
 * options from the effective map, so a summary without a definition would be
 * skipped anyway, but a narrowed view also keeps the runtime signature honest.
 */
export function narrowMcpSettingsToServers(
  view: McpSettingsView,
  names: readonly string[],
): McpSettingsView {
  const keep = new Set(names)
  const mcpServers: Record<string, unknown> = {}
  for (const [name, definition] of Object.entries(view.effective.mcpServers)) {
    if (keep.has(name)) mcpServers[name] = definition
  }
  return {
    ...view,
    servers: view.servers.filter((summary) => summary.enabled && keep.has(summary.name)),
    effective: {
      ...view.effective,
      mcpServers: mcpServers as typeof view.effective.mcpServers,
    },
  }
}
