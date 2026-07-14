import type { McpServerSummary } from '@shared/types/mcp'
import type { SkillDiscoveryItem } from '@shared/types/standards'
import type { WagglePreset } from '@shared/types/waggle'
import {
  Archive,
  Copy,
  GitBranch,
  GitPullRequest,
  ListTree,
  MessageSquare,
  Plug,
  Settings,
  Shield,
  ShieldAlert,
  Swords,
  User,
  Waypoints,
} from 'lucide-react'
import { COMMAND_PALETTE } from '../constants/command-palette'
import type {
  CommandPaletteActionHandlers,
  CommandPaletteItem,
} from '../model/command-palette-item'
import { openFeedbackModal } from './command-palette-actions'
import { truncateCommandDescription } from './command-palette-text'

const PAIR_DISCOVERY_TERMS = ['panel', 'pair', 'waggle'] as const
const MCP_DISCOVERY_TERMS = ['mcp', 'mcps', 'server', 'servers', 'tool', 'tools'] as const
const VISIBLE_PANEL_PRESET_IDS: ReadonlySet<string> = new Set(['debate', 'red-team'])

export function createBaseCommands(actions: CommandPaletteActionHandlers) {
  const optionalCommands: CommandPaletteItem[] = []
  appendOptionalCommand(optionalCommands, createSessionTreeCommand(actions))
  appendOptionalCommand(optionalCommands, createForkCommand(actions))
  appendOptionalCommand(optionalCommands, createCloneCommand(actions))

  return [
    {
      id: 'waggle',
      label: 'Council of Experts',
      description: 'Start a Council of Experts session',
      icon: <Waypoints className="size-3.5" />,
      action: actions.startWaggle,
    },
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

export function createPresetItems(
  presets: readonly WagglePreset[],
  lowerQuery: string,
  selectPreset: CommandPaletteActionHandlers['selectPreset'],
) {
  const items: CommandPaletteItem[] = []
  for (const preset of presets) {
    if (!VISIBLE_PANEL_PRESET_IDS.has(String(preset.id))) continue
    if (!presetMatchesQuery(preset, lowerQuery)) continue

    items.push({
      id: `waggle-preset-${preset.id}`,
      label: preset.name,
      description: truncateCommandDescription(
        preset.description,
        COMMAND_PALETTE.WAGGLE_PRESET_DESCRIPTION_LIMIT,
      ),
      icon: presetIcon(preset),
      section: 'Council of Experts',
      trailing: 'Sequential',
      trailingBadge: preset.isBuiltIn ? undefined : 'Custom',
      action: () => selectPreset(preset),
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

export function createConfigureWaggleItem(lowerQuery: string, configureWaggle: () => void) {
  if (!isWaggleFilter(lowerQuery)) return []
  return [
    {
      id: 'configure-waggle',
      label: 'Configure Council of Experts...',
      description: 'Open Council of Experts settings',
      icon: <Settings className="size-3.5" />,
      section: 'configure',
      action: configureWaggle,
    },
  ]
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
  const statusTerms = server.enabled
    ? ['enabled', 'active', 'on']
    : ['disabled', 'inactive', 'off']

  return (
    lowerName.includes(lowerQuery) ||
    lowerSourceLabel.includes(lowerQuery) ||
    lowerTransport.includes(lowerQuery) ||
    MCP_DISCOVERY_TERMS.some((term) => term.includes(lowerQuery) || lowerQuery.includes(term)) ||
    statusTerms.some((term) => term.includes(lowerQuery) || lowerQuery.includes(term))
  )
}

function presetMatchesQuery(preset: WagglePreset, lowerQuery: string) {
  return (
    !lowerQuery ||
    preset.name.toLowerCase().includes(lowerQuery) ||
    PAIR_DISCOVERY_TERMS.some((term) => term.includes(lowerQuery) || lowerQuery.includes(term))
  )
}

function isMcpFilter(lowerQuery: string) {
  return (
    lowerQuery.length > 0 &&
    MCP_DISCOVERY_TERMS.some((term) => term.includes(lowerQuery) || lowerQuery.includes(term))
  )
}

function isWaggleFilter(lowerQuery: string) {
  return (
    lowerQuery.length > 0 &&
    PAIR_DISCOVERY_TERMS.some((term) => term.includes(lowerQuery) || lowerQuery.includes(term)) &&
    !lowerQuery.startsWith(COMMAND_PALETTE.WAGGLE_COMMAND_PREFIX)
  )
}

function presetIcon(preset: WagglePreset) {
  const name = preset.name.toLowerCase()
  if (name.includes('review')) return <GitPullRequest className="size-3.5" />
  if (name.includes('debate')) return <Swords className="size-3.5" />
  if (name.includes('red team')) return <ShieldAlert className="size-3.5" />
  if (name.includes('qa') || name.includes('test')) return <Shield className="size-3.5" />
  return <User className="size-3.5" />
}

function formatMcpTransport(server: McpServerSummary) {
  return server.transport === 'unknown' ? 'server' : server.transport
}

function appendOptionalCommand(commands: CommandPaletteItem[], command: CommandPaletteItem | null) {
  if (command) {
    commands.push(command)
  }
}
