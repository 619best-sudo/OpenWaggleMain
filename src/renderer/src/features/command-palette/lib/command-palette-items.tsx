import type { McpServerSummary } from '@shared/types/mcp'
import type { SkillDiscoveryItem } from '@shared/types/standards'
import { Plug, Shield } from 'lucide-react'
import type {
  CommandPaletteActionHandlers,
  CommandPaletteItem,
} from '../model/command-palette-item'

/**
 * Build the list of skill mention items. Each item, when selected, causes the
 * composer to insert an `SkillMentionNode` whose text content is `/${skill.id}`.
 * Only enabled skills with a successful load appear (disabled/error skills are
 * filtered out so the user never picks something that would silently no-op).
 */
export function createSkillItems(
  slashSkills: readonly SkillDiscoveryItem[],
  lowerQuery: string,
  selectSkill: CommandPaletteActionHandlers['selectSkill'],
): CommandPaletteItem[] {
  const items: CommandPaletteItem[] = []
  for (const skill of slashSkills) {
    if (!skill.enabled || skill.loadStatus !== 'ok') continue
    if (!skillMatchesQuery(skill, lowerQuery)) continue

    items.push({
      id: `skill-${skill.id}`,
      label: skill.name,
      description: skill.description,
      icon: <Shield className="size-3.5" />,
      section: 'Skills',
      action: () => selectSkill(skill.id, skill.name),
    })
  }

  return items
}

/**
 * Build the list of MCP mention items. Enabled servers, when selected, insert
 * an `McpMentionNode` into the composer (text `/serverName`). Disabled servers
 * fall back to the quick-enable toggle because mentioning them is ignored by
 * the run pipeline until they're enabled (mention ∩ enabled, see preflight).
 */
export function createMcpItems(
  servers: readonly McpServerSummary[],
  lowerQuery: string,
  selectMcp: CommandPaletteActionHandlers['selectMcp'],
  toggleMcpServer: (server: McpServerSummary) => void,
): CommandPaletteItem[] {
  const sortedServers = [...servers].sort(
    (a, b) =>
      Number(b.enabled) - Number(a.enabled) ||
      a.name.localeCompare(b.name) ||
      a.sourceLabel.localeCompare(b.sourceLabel),
  )

  const items: CommandPaletteItem[] = []
  for (const server of sortedServers) {
    if (!mcpMatchesQuery(server, lowerQuery)) continue

    items.push({
      id: `mcp-${server.sourceId}-${server.name}`,
      label: server.name,
      description: `${server.sourceLabel} • ${formatMcpTransport(server)}${
        server.enabled ? ' • select to attach to this run' : ' • disabled'
      }`,
      icon: <Plug className="size-3.5" />,
      section: 'MCPs',
      trailing: server.enabled ? 'On' : 'Off',
      trailingBadge: server.sourceLabel,
      action: server.enabled ? () => selectMcp(server.name) : () => toggleMcpServer(server),
    })
  }

  return items
}

function skillMatchesQuery(skill: SkillDiscoveryItem, lowerQuery: string) {
  return (
    !lowerQuery ||
    skill.name.toLowerCase().includes(lowerQuery) ||
    skill.id.includes(lowerQuery) ||
    skill.description.toLowerCase().includes(lowerQuery)
  )
}

const MCP_DISCOVERY_TERMS = ['mcp', 'mcps', 'server', 'servers', 'tool', 'tools'] as const

function mcpMatchesQuery(server: McpServerSummary, lowerQuery: string) {
  if (!lowerQuery) return true

  const lowerName = server.name.toLowerCase()
  const lowerSourceLabel = server.sourceLabel.toLowerCase()
  const lowerTransport = formatMcpTransport(server)
  const statusTerms = server.enabled ? ['enabled', 'active', 'on'] : ['disabled', 'inactive', 'off']

  return (
    lowerName.includes(lowerQuery) ||
    lowerSourceLabel.includes(lowerQuery) ||
    lowerTransport.includes(lowerQuery) ||
    MCP_DISCOVERY_TERMS.some((term) => term.includes(lowerQuery) || lowerQuery.includes(term)) ||
    statusTerms.some((term) => term.includes(lowerQuery) || lowerQuery.includes(term))
  )
}

function formatMcpTransport(server: McpServerSummary) {
  return server.transport === 'unknown' ? 'server' : server.transport
}
