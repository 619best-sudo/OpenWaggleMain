import { extractExplicitSkillReferences } from './skill-references'

/**
 * Match slash tokens in free text ("/playwright") against MCP server names.
 *
 * The composer inserts a mention node whose text is `/serverName` when an MCP
 * is picked from the palette, and the run pipeline parses those tokens back out
 * of `payload.text` to gate which MCPs attach to a run — only explicitly
 * selected servers reach the model. Only exact case-insensitive matches against
 * `serverNames` count; unknown tokens and `$`-refs are ignored (those belong to
 * the skill namespace).
 */
export function extractMcpServerReferences(text: string, serverNames: readonly string[]): string[] {
  if (!text || serverNames.length === 0) return []
  const canonicalByName = new Map(serverNames.map((name) => [name.toLowerCase(), name as string]))
  const out: string[] = []
  const seen = new Set<string>()
  for (const token of extractExplicitSkillReferences(text).slashSkillIds) {
    const canonical = canonicalByName.get(token)
    if (canonical && !seen.has(canonical)) {
      seen.add(canonical)
      out.push(canonical)
    }
  }
  return out
}
