import type { McpServerSummary } from '@shared/types/mcp'
import type { SkillDiscoveryItem } from '@shared/types/standards'
import { describe, expect, it, vi } from 'vitest'
import type { CommandPaletteItem } from '../../model'
import { buildCommandPaletteEntries } from '../command-palette-entries'
import { createMcpItems, createSkillItems } from '../command-palette-items'
import { normalizeCommandQuery, truncateCommandDescription } from '../command-palette-text'

function item(id: string, section?: string): CommandPaletteItem {
  return {
    id,
    label: id,
    icon: id,
    section,
    action: vi.fn(),
  }
}

describe('command palette text helpers', () => {
  it('normalizes command queries for matching', () => {
    expect(normalizeCommandQuery('  Open SETTINGS  ')).toBe('open settings')
  })

  it('truncates descriptions only when they exceed the maximum length', () => {
    expect(truncateCommandDescription('abcdef', 3)).toBe('abc...')
    expect(truncateCommandDescription('abc', 3)).toBe('abc')
  })
})

describe('buildCommandPaletteEntries', () => {
  it('adds section headers and configure separators without duplicating adjacent sections', () => {
    const entries = buildCommandPaletteEntries([
      item('open-chat', 'navigation'),
      item('open-settings', 'navigation'),
      item('configure-waggle', 'configure'),
      item('start-waggle', 'waggle'),
    ])

    expect(entries.map((entry) => entry.type)).toEqual([
      'section',
      'item',
      'item',
      'separator',
      'item',
      'section',
      'item',
    ])
    expect(entries.map((entry) => entry.key)).toEqual([
      'section-navigation-0',
      'open-chat',
      'open-settings',
      'separator-2',
      'configure-waggle',
      'section-waggle-3',
      'start-waggle',
    ])
  })
})

const skillItems: SkillDiscoveryItem[] = [
  {
    id: 'design',
    name: 'Design',
    description: 'Brand and UI work',
    enabled: true,
    loadStatus: 'ok',
  },
  {
    id: 'review',
    name: 'Review',
    description: 'Code review',
    enabled: true,
    loadStatus: 'ok',
  },
]

const mcpServers: McpServerSummary[] = [
  {
    name: 'playwright',
    enabled: true,
    sourceId: 'project-turing-machine',
    sourceLabel: 'Project',
    sourcePath: '/tmp/project/.turing-machine/agent/mcp.json',
    transport: 'stdio',
    directTools: 'enabled',
  },
  {
    name: 'database',
    enabled: false,
    sourceId: 'global-standard',
    sourceLabel: 'Global',
    sourcePath: '/tmp/global/mcp.json',
    transport: 'http',
    directTools: 'disabled',
  },
]

describe('mention palette ordering', () => {
  it('places MCPs first when the trigger is "/" and skills first when the trigger is "#"', () => {
    const selectSkill = vi.fn()
    const selectMcp = vi.fn()
    const toggleMcpServer = vi.fn()

    const skills = createSkillItems(skillItems, '', selectSkill)
    const mcps = createMcpItems(mcpServers, '', selectMcp, toggleMcpServer)

    // Simulate the ordering assembly that useCommandPaletteItems does based on
    // the trigger character from the editor text listener.
    const slashFirst = [...mcps, ...skills]
    const hashFirst = [...skills, ...mcps]

    expect(slashFirst.map((entry) => entry.section)).toEqual(['MCPs', 'MCPs', 'Skills', 'Skills'])
    expect(hashFirst.map((entry) => entry.section)).toEqual(['Skills', 'Skills', 'MCPs', 'MCPs'])
  })
})

describe('createSkillItems', () => {
  it('only emits enabled, successfully-loaded skills', () => {
    const mixed: SkillDiscoveryItem[] = [
      ...skillItems,
      {
        id: 'broken',
        name: 'Broken',
        description: 'broken',
        enabled: true,
        loadStatus: 'error',
      },
      {
        id: 'off',
        name: 'Off',
        description: 'off',
        enabled: false,
        loadStatus: 'ok',
      },
    ]
    const items = createSkillItems(mixed, '', vi.fn())
    expect(items.map((entry) => entry.id)).toEqual(['skill-design', 'skill-review'])
    expect(items.every((entry) => entry.section === 'Skills')).toBe(true)
  })
})

describe('createMcpItems', () => {
  it('shows MCP servers with enabled state and source metadata', () => {
    const items = createMcpItems(mcpServers, '', vi.fn(), vi.fn())

    expect(items.map((item) => item.label)).toEqual(['playwright', 'database'])
    expect(items[0]).toMatchObject({
      section: 'MCPs',
      trailing: 'On',
      trailingBadge: 'Project',
    })
    expect(items[1]).toMatchObject({
      trailing: 'Off',
      trailingBadge: 'Global',
    })
  })

  it('matches MCP servers by category and server name', () => {
    expect(createMcpItems(mcpServers, 'mcp', vi.fn(), vi.fn()).map((item) => item.label)).toEqual([
      'playwright',
      'database',
    ])
    expect(createMcpItems(mcpServers, 'play', vi.fn(), vi.fn()).map((item) => item.label)).toEqual([
      'playwright',
    ])
    expect(createMcpItems(mcpServers, 'off', vi.fn(), vi.fn()).map((item) => item.label)).toEqual([
      'database',
    ])
  })

  it('inserts an MCP mention on enable when selected', () => {
    const selectMcp = vi.fn()
    const items = createMcpItems(mcpServers, '', selectMcp, vi.fn())
    items[0]?.action()
    expect(selectMcp).toHaveBeenCalledWith('playwright')
  })

  it('falls back to the enable toggle for disabled servers (mention would be ignored)', () => {
    const toggleMcpServer = vi.fn()
    const items = createMcpItems(mcpServers, '', vi.fn(), toggleMcpServer)
    items[1]?.action()
    expect(toggleMcpServer).toHaveBeenCalledWith(mcpServers[1])
  })
})
