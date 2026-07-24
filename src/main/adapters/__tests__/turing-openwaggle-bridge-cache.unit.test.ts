import type { McpServerOptions, ProviderInput } from 'turing-harness'
import { describe, expect, it, vi } from 'vitest'
import type { McpSettingsView } from '@shared/types/mcp'
import type { AgentKernelStandardsContext } from '../../ports/agent-kernel-service'
import { attachOpenWaggleRuntime } from '../turing/turing-openwaggle-bridge'

/**
 * Builds the minimal Session surface that `attachOpenWaggleRuntime` actually
 * touches: addMcpServer (returns a ProviderListItem with the requested id),
 * addSkill (returns whatever the registry would), listCapabilities (used by
 * the clear step), and removeProvider (the actual teardown call).
 *
 * The `as never` cast is the established idiom in the sibling bridge test — the
 * full `Session` interface pulls in a long tool/registry graph that the unit
 * test never exercises, so we mock the surface we touch and let the rest pass
 * through.
 */
function makeSessionMock() {
  const addMcpServer = vi.fn(
    async (options: McpServerOptions): Promise<{ id: string }> => ({ id: options.id }),
  )
  const addSkill = vi.fn((_input: ProviderInput) => undefined)
  const listCapabilities = vi.fn((): ReadonlyArray<{ id: string; kind: string }> => [])
  const removeProvider = vi.fn(async (_id: string) => true)

  const session = {
    addMcpServer,
    addSkill,
    listCapabilities,
    removeProvider,
  }

  return { session: session as never, addMcpServer, addSkill, listCapabilities, removeProvider }
}

const mcpSettings: McpSettingsView = {
  adapter: {
    enabled: true,
    packageSource: 'pi-mcp-adapter',
    runtimeConfigPath: null,
  },
  sources: [],
  effective: {
    mcpServers: {
      playwright: { command: 'npx', args: ['-y', 'playwright@1.58.2'] },
    },
    disabledMcpServers: {},
    settings: {},
    imports: [],
  },
  servers: [
    {
      name: 'playwright',
      enabled: true,
      sourceId: 'project-openwaggle',
      sourceLabel: 'Project OpenWaggle',
      sourcePath: '/tmp/project/.openwaggle/agent/mcp.json',
      command: 'npx',
      transport: 'stdio',
      directTools: 'enabled',
    },
  ],
  runtimeConfigPath: null,
}

const standardsContext: AgentKernelStandardsContext = {
  agentsInstruction: 'Follow project instructions.',
  agentsScopedInstructions: [],
  activeSkills: [
    {
      id: 'ui_critic',
      name: 'UI Critic',
      description: 'Review UI polish.',
      body: 'Check alignment and contrast.',
      folderPath: '/tmp/project/.openwaggle/skills/ui_critic',
      skillPath: '/tmp/project/.openwaggle/skills/ui_critic/SKILL.md',
      hasScripts: false,
    },
  ],
  warnings: [],
}

describe('turing OpenWaggle bridge — runtime cache', () => {
  it('reuses a prior attach when the same session is wired with the same runtime', async () => {
    const { session, addMcpServer, addSkill, listCapabilities, removeProvider } = makeSessionMock()

    const first = await attachOpenWaggleRuntime(session, { mcpSettings, standardsContext })

    expect(addMcpServer).toHaveBeenCalledTimes(1)
    expect(addSkill).toHaveBeenCalledTimes(1)
    expect(listCapabilities).toHaveBeenCalledTimes(1)
    expect(removeProvider).not.toHaveBeenCalled()

    // Second attach with the exact same runtime shape should hit the fast path:
    // the signature is unchanged, so the cache returns the prior BridgeResult
    // without clearing providers or reconnecting MCP servers.
    const second = await attachOpenWaggleRuntime(session, { mcpSettings, standardsContext })

    expect(second).toBe(first)
    expect(addMcpServer).toHaveBeenCalledTimes(1)
    expect(addSkill).toHaveBeenCalledTimes(1)
    expect(listCapabilities).toHaveBeenCalledTimes(1)
    expect(removeProvider).not.toHaveBeenCalled()
  })

  it('reconnects MCP servers when the resolved runtime signature changes', async () => {
    const { session, addMcpServer, addSkill, listCapabilities, removeProvider } = makeSessionMock()

    await attachOpenWaggleRuntime(session, { mcpSettings, standardsContext })

    // Tweak the MCP command — a real config change should drop the cache and
    // force a fresh clear + reconnect.
    const changedSettings = {
      ...mcpSettings,
      effective: {
        ...mcpSettings.effective,
        mcpServers: {
          playwright: { command: 'pnpm', args: ['dlx', 'playwright@1.58.2'] },
        },
      },
    }

    const second = await attachOpenWaggleRuntime(session, {
      mcpSettings: changedSettings,
      standardsContext,
    })

    // The MCP command change invalidates the cached signature, so the full
    // attach path runs again: clear, reconnect MCP, re-register skills.
    expect(addMcpServer).toHaveBeenCalledTimes(2)
    expect(addSkill).toHaveBeenCalledTimes(2)
    expect(listCapabilities).toHaveBeenCalledTimes(2)
    expect(removeProvider).not.toHaveBeenCalled()
    // The second call's result must reflect the new command, not the cached one.
    expect(second.connectedMcpIds).toEqual(['openwaggle:mcp:playwright'])
    expect(addMcpServer.mock.calls[1]?.[0]?.command).toBe('pnpm')
  })

  it('does not share the cache between distinct session objects', async () => {
    const a = makeSessionMock()
    const b = makeSessionMock()

    await attachOpenWaggleRuntime(a.session, { mcpSettings, standardsContext })
    await attachOpenWaggleRuntime(b.session, { mcpSettings, standardsContext })

    // Each session performs its own first-time attach.
    expect(a.addMcpServer).toHaveBeenCalledTimes(1)
    expect(b.addMcpServer).toHaveBeenCalledTimes(1)
    expect(a.addSkill).toHaveBeenCalledTimes(1)
    expect(b.addSkill).toHaveBeenCalledTimes(1)
  })

  it('caches a partial attach so subsequent runs hit the fast-path', async () => {
    const { session, addMcpServer, listCapabilities, removeProvider } = makeSessionMock()
    addMcpServer.mockResolvedValueOnce({ id: 'openwaggle:mcp:ok' })
    addMcpServer.mockRejectedValueOnce(new Error('spawn failed'))

    const first = await attachOpenWaggleRuntime(session, { mcpSettings, standardsContext })

    expect(first.issues).toEqual([
      expect.objectContaining({
        kind: 'mcp-fail',
        message: expect.stringContaining('spawn failed'),
      }),
    ])
    expect(first.connectedMcpIds).toEqual(['openwaggle:mcp:ok'])
    // The first run still attempted the clear + add path.
    expect(addMcpServer).toHaveBeenCalledTimes(2)
    expect(listCapabilities).toHaveBeenCalledTimes(1)
    expect(removeProvider).not.toHaveBeenCalled()

    // Second call: signature matches, fast-path returns the cached result
    // immediately — no extra spawn, no extra clear, no second tools/list.
    const second = await attachOpenWaggleRuntime(session, { mcpSettings, standardsContext })

    expect(addMcpServer).toHaveBeenCalledTimes(2) // unchanged — no respawn
    expect(listCapabilities).toHaveBeenCalledTimes(1) // unchanged
    expect(second.connectedMcpIds).toEqual(['openwaggle:mcp:ok'])
    expect(second.issues).toEqual(first.issues) // same fail preserved
  })
})

describe('turing OpenWaggle bridge — parallel MCP attach', () => {
  it('spawns multiple MCP servers concurrently rather than serially', async () => {
    // Track the order in which addMcpServer is *entered*. If the bridge
    // serialises the loop, every entry is observed before the next resolves
    // (interleaving is empty). If the bridge parallelises, the slower server
    // is still pending when the faster one resolves.
    const entryOrder: string[] = []
    const resolveOrder: string[] = []
    const makeSlow = (id: string, ms: number) =>
      vi.fn(async (options: McpServerOptions): Promise<{ id: string }> => {
        entryOrder.push(id)
        await new Promise((r) => setTimeout(r, ms))
        resolveOrder.push(id)
        return { id: options.id }
      })

    const slowA = makeSlow('openwaggle:mcp:playwright', 80)
    const slowB = makeSlow('openwaggle:mcp:browserUse', 5)

    const session = {
      addMcpServer: vi.fn((options: McpServerOptions) => {
        // Route to the per-server mock so we can record the right call shape.
        if (options.id === slowA.mock.calls[0]?.[0]?.id) return slowA(options)
        if (options.id === slowB.mock.calls[0]?.[0]?.id) return slowB(options)
        return options.id === 'openwaggle:mcp:playwright' ? slowA(options) : slowB(options)
      }),
      addSkill: vi.fn(),
      listCapabilities: vi.fn(() => []),
      removeProvider: vi.fn(async () => true),
    } as never

    const twoServerSettings: McpSettingsView = {
      ...mcpSettings,
      effective: {
        ...mcpSettings.effective,
        mcpServers: {
          playwright: { command: 'node', args: ['./playwright.js'] },
          browserUse: { command: 'node', args: ['./browser.js'] },
        },
      },
      servers: [
        { name: 'playwright', enabled: true, sourceId: 'project-openwaggle', sourceLabel: 's', sourcePath: '/p', command: 'node', transport: 'stdio', directTools: 'enabled' },
        { name: 'browserUse', enabled: true, sourceId: 'project-openwaggle', sourceLabel: 's', sourcePath: '/p', command: 'node', transport: 'stdio', directTools: 'enabled' },
      ],
    }

    const result = await attachOpenWaggleRuntime(session, { mcpSettings: twoServerSettings, standardsContext })

    // Both servers were attached, in any order.
    expect([...result.connectedMcpIds].sort()).toEqual(
      ['openwaggle:mcp:browserUse', 'openwaggle:mcp:playwright'].sort(),
    )
    // Both servers were *entered* before either resolved — proof of parallel
    // scheduling. (A serial loop would resolve playwright before browserUse
    // even entered.)
    expect(entryOrder).toEqual(['openwaggle:mcp:playwright', 'openwaggle:mcp:browserUse'])
    expect(resolveOrder).toEqual(['openwaggle:mcp:browserUse', 'openwaggle:mcp:playwright'])
  })
})
