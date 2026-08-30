import type { SessionId } from '@shared/types/brand'
import type { McpSettingsView } from '@shared/types/mcp'
import { describe, expect, it } from 'vitest'
import {
  clearSessionToolSelection,
  extractRunToolMentions,
  getSessionToolSelection,
  narrowMcpSettingsToServers,
  recordSessionToolSelection,
} from '../session-tool-selection'

const sessionId = 'session-tool-selection-1' as never as SessionId

const mcpView: McpSettingsView = {
  adapter: { enabled: true, packageSource: 'pkg', runtimeConfigPath: null },
  sources: [],
  effective: {
    mcpServers: {
      playwright: { command: 'npx' },
      'chrome-devtools': { command: 'npx' },
    },
    disabledMcpServers: {},
    settings: {},
    imports: [],
  },
  servers: [
    {
      name: 'playwright',
      enabled: true,
      sourceId: 'global-standard',
      sourceLabel: 'Global',
      sourcePath: '/tmp/mcp.json',
      transport: 'stdio',
      directTools: 'inherited',
      command: 'npx',
    },
    {
      name: 'chrome-devtools',
      enabled: false,
      sourceId: 'global-standard',
      sourceLabel: 'Global',
      sourcePath: '/tmp/mcp.json',
      transport: 'stdio',
      directTools: 'inherited',
      command: 'npx',
    },
  ],
  runtimeConfigPath: null,
}

describe('extractRunToolMentions', () => {
  it('splits skill refs from MCP mentions and reports disabled MCPs separately', () => {
    const mentions = extractRunToolMentions('/design /playwright /chrome-devtools', mcpView)
    expect(mentions.skillIds).toEqual(['design', 'playwright', 'chrome-devtools'])
    expect(mentions.mcpNamesMentioned).toEqual(['playwright', 'chrome-devtools'])
    expect(mentions.mcpNamesEnabled).toEqual(['playwright'])
  })

  it('returns empty mentions for plain text', () => {
    const mentions = extractRunToolMentions('just a normal prompt', mcpView)
    expect(mentions.skillIds).toEqual([])
    expect(mentions.mcpNamesMentioned).toEqual([])
  })
})

describe('session tool selection store', () => {
  it('replaces the selection per session (pruning toggle-offs)', () => {
    clearSessionToolSelection(sessionId)
    recordSessionToolSelection(sessionId, { skillIds: ['design'], mcpNames: ['playwright'] })
    expect(getSessionToolSelection(sessionId)).toEqual({
      skillIds: ['design'],
      mcpNames: ['playwright'],
    })

    // Replace, not union: what the user toggled off must not linger.
    recordSessionToolSelection(sessionId, { skillIds: [], mcpNames: [] })
    expect(getSessionToolSelection(sessionId)).toEqual({ skillIds: [], mcpNames: [] })
  })

  it('isolates sessions and clears cleanly', () => {
    clearSessionToolSelection(sessionId)
    recordSessionToolSelection(sessionId, { skillIds: ['a'], mcpNames: [] })
    expect(getSessionToolSelection('other' as never as SessionId)).toEqual({
      skillIds: [],
      mcpNames: [],
    })
    clearSessionToolSelection(sessionId)
    expect(getSessionToolSelection(sessionId)).toEqual({ skillIds: [], mcpNames: [] })
  })

  it('evicts oldest sessions past the bound', () => {
    clearSessionToolSelection(sessionId)
    recordSessionToolSelection(sessionId, { skillIds: ['first'], mcpNames: [] })
    for (let i = 0; i < 220; i++) {
      recordSessionToolSelection(`session-${i}` as never as SessionId, {
        skillIds: [`s${i}`],
        mcpNames: [],
      })
    }
    expect(getSessionToolSelection(sessionId).skillIds).toEqual([])
  })
})

describe('narrowMcpSettingsToServers', () => {
  it('filters both servers and effective definitions to the selection', () => {
    const narrowed = narrowMcpSettingsToServers(mcpView, ['playwright'])
    expect(narrowed.servers.map((server) => server.name)).toEqual(['playwright'])
    expect(Object.keys(narrowed.effective.mcpServers)).toEqual(['playwright'])
    // Unrelated fields pass through untouched.
    expect(narrowed.adapter).toEqual(mcpView.adapter)
    expect(narrowed.sources).toEqual(mcpView.sources)
  })
})
