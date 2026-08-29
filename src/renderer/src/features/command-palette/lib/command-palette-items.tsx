import type { McpServerSummary } from '@shared/types/mcp'
import type { SkillDiscoveryItem } from '@shared/types/standards'
import {
  Archive,
  Copy,
  GitBranch,
  ListTree,
  MessageSquare,
  Plug,
  Settings,
  Shield,
} from 'lucide-react'
import { COMMAND_PALETTE } from '../constants/command-palette'
import type {
  CommandPaletteActionHandlers,
  CommandPaletteItem,
} from '../model/command-palette-item'
import { openFeedbackModal } from './command-palette-actions'
import { truncateCommandDescription } from './command-palette-text'

const MCP_DISCOVERY_TERMS = ['mcp', 'mcps', 'server', 'servers', 'tool', 'tools'] as const

export function createBaseCommands(actions: CommandPaletteActionHandlers) {
  const optionalCommands: CommandPaletteItem[] = []
  appendOptionalCommand(optionalCommands, createSessionTreeCommand(actions))
  appendOptionalCommand(optionalCommands, createForkCommand(actions))
  appendOptionalCommand(optionalCommands, createCloneCommand(actions))

  return [
    {
      id: 'mcp',
      label: 'MCPs',
      description: 'Select MCP servers for this project',
      icon: <Plug className="size-3.5" />,
      action: actions.configureMcp,
    },
    {
      id: 'feedback',
      label: 'Feedback',
      icon: <MessageSquare className="size-3.5" />,
      action: openFeedbackModal,
    },
    {
      id: 'compact',
      label: 'Compact session',
      description: 'Run /compact with optional instructions',
      icon: <Archive className="size-3.5" />,
      action: actions.insertCompactCommand,
    },
    ...optionalCommands,
  ]
}

export function filterBaseCommands(commands: readonly CommandPaletteItem[], lowerQuery: string) {
  if (!lowerQuery) return commands
  return commands.filter((command) => commandMatchesQuery(command, lowerQuery))
}

export function createSkillItems(
  slashSkills: readonly SkillDiscoveryItem[],
  lowerQuery: string,
  selectSkill: CommandPaletteActionHandlers['selectSkill'],
) {
  const items: CommandPaletteItem[] = []
  for (const skill of slashSkills) {
    if (!skill.enabled || skill.loadStatus !== 'ok') continue
    if (!skillMatchesQuery(skill, lowerQuery)) continue

    items.push({
      id: `skill-${skill.id}`,
      label: skill.name,
      description: truncateCommandDescription(skill.description, COMMAND_PALETTE.DESCRIPTION_LIMIT),
      icon: <Shield className="size-3.5" />,
      section: 'Skills',
      action: () => selectSkill(skill.id, skill.name),
    })
  }

  return items
}

export function createMcpItems(
  servers: readonly McpServerSummary[],
  lowerQuery: string,
  toggleMcpServer: CommandPaletteActionHandlers['toggleMcpServer'],
) {
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
      description: truncateCommandDescription(
        `${server.sourceLabel} • ${formatMcpTransport(server)}`,
        COMMAND_PALETTE.DESCRIPTION_LIMIT,
      ),
      icon: <Plug className="size-3.5" />,
      section: 'MCPs',
      trailing: server.enabled ? 'On' : 'Off',
      trailingBadge: server.sourceLabel,
      action: () => toggleMcpServer(server),
    })
  }

  return items
}

export function createConfigureMcpItem(lowerQuery: string, configureMcp: () => void) {
  if (!isMcpFilter(lowerQuery)) return []
  return [
    {
      id: 'configure-mcp',
      label: 'Configure MCPs...',
      description: 'Open MCP settings',
      icon: <Settings className="size-3.5" />,
      section: 'configure',
      action: configureMcp,
    },
  ]
}

function createSessionTreeCommand(actions: CommandPaletteActionHandlers) {
  if (!actions.openSessionTree) return null
  return {
    id: 'session-tree',
    label: 'Open Session Tree',
    description: 'Navigate the Pi session tree',
    icon: <ListTree className="size-3.5" />,
    action: actions.openSessionTree,
  }
}

function createForkCommand(actions: CommandPaletteActionHandlers) {
  if (!actions.forkToNewSession) return null
  return {
    id: 'session-fork-to-new',
    label: 'Fork to new session...',
    description: 'Select a previous user message and continue in a new session',
    icon: <GitBranch className="size-3.5" />,
    action: actions.forkToNewSession,
  }
}

function createCloneCommand(actions: CommandPaletteActionHandlers) {
  if (!actions.cloneToNewSession) return null
  return {
    id: 'session-clone-to-new',
    label: 'Clone to new session',
    description: 'Duplicate the current session position',
    icon: <Copy className="size-3.5" />,
    action: actions.cloneToNewSession,
  }
}

function commandMatchesQuery(command: CommandPaletteItem, lowerQuery: string) {
  return (
    command.label.toLowerCase().includes(lowerQuery) ||
    Boolean(command.description?.toLowerCase().includes(lowerQuery))
  )
}

function skillMatchesQuery(skill: SkillDiscoveryItem, lowerQuery: string) {
  return (
    !lowerQuery ||
    skill.name.toLowerCase().includes(lowerQuery) ||
    skill.id.includes(lowerQuery) ||
    skill.description.toLowerCase().includes(lowerQuery)
  )
}

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

function isMcpFilter(lowerQuery: string) {
  return (
    lowerQuery.length > 0 &&
    MCP_DISCOVERY_TERMS.some((term) => term.includes(lowerQuery) || lowerQuery.includes(term))
  )
}

function formatMcpTransport(server: McpServerSummary) {
  return server.transport === 'unknown' ? 'server' : server.transport
}

function appendOptionalCommand(commands: CommandPaletteItem[], command: CommandPaletteItem | null) {
  if (command) {
    commands.push(command)
  }
}
