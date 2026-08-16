/**
 * End-to-end check that MCP servers and skills actually load.
 *
 * Unlike the sibling bridge unit tests, this one uses a REAL `McpRuntimePool`
 * and REAL child processes — small inline Node scripts that speak just enough
 * newline-delimited JSON-RPC to complete `initialize` + `tools/list`. So a pass
 * here means a process really spawned, really handshook, and its real tool list
 * really landed in the session registry.
 *
 * What it pins down:
 *   - the MCP-page warm path (`reconcileMcpPool`) connects every enabled server
 *   - the run path (`connectMcpBackground`) then finds them warm and registers
 *     every MCP tool AND every skill tool before the run starts
 *   - warm reuse is genuine (same provider object, no second spawn)
 *   - disabled and non-stdio servers are excluded, with a reported issue
 *   - a server disabled on the MCP page is evicted, not left running
 */
import type { McpServerSummary, McpSettingsView } from '@shared/types/mcp'
import { McpRuntimePool, type McpServerOptions, type ProviderInput } from 'turing-harness'
import { describe, expect, it, vi } from 'vitest'
import type { AgentKernelStandardsContext } from '../../../ports/agent-kernel-service'
import { connectMcpBackground, resolveOpenWaggleMcpServers } from '../turing-openwaggle-bridge'

/**
 * A minimal stdio MCP server. `TOOL` names its single tool so each fixture
 * server is distinguishable in the registry.
 */
function stubServerArgs(tool: string): string[] {
  return [
    '-e',
    `
let buf = "";
process.stdin.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.method === "initialize") {
      respond(msg.id, { protocolVersion: "2024-11-05", capabilities: {}, serverInfo: { name: "stub", version: "0" } });
    } else if (msg.method === "tools/list") {
      respond(msg.id, { tools: [{ name: ${JSON.stringify(tool)}, description: "t", inputSchema: { type: "object" } }] });
    } else if (msg.id !== undefined) {
      respond(msg.id, {});
    }
  }
});
function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\\n");
}
`,
  ]
}

interface ServerFixture {
  readonly name: string
  readonly tool: string
  readonly enabled?: boolean
  readonly transport?: 'stdio' | 'http'
}

function buildView(fixtures: readonly ServerFixture[]): McpSettingsView {
  const mcpServers: Record<string, unknown> = {}
  const servers: McpServerSummary[] = []
  for (const f of fixtures) {
    mcpServers[f.name] = { command: process.execPath, args: stubServerArgs(f.tool) }
    servers.push({
      name: f.name,
      enabled: f.enabled ?? true,
      sourceId: 'project-turing-machine',
      sourceLabel: 'Project OpenWaggle',
      sourcePath: '/tmp/project/.turing-machine/agent/mcp.json',
      command: process.execPath,
      transport: f.transport ?? 'stdio',
      directTools: 'enabled',
    } as McpServerSummary)
  }
  return {
    adapter: { enabled: true, packageSource: 'pi-mcp-adapter', runtimeConfigPath: null },
    sources: [],
    effective: { mcpServers, disabledMcpServers: {}, settings: {}, imports: [] },
    servers,
    runtimeConfigPath: null,
  } as McpSettingsView
}

function buildStandards(skillIds: readonly string[]): AgentKernelStandardsContext {
  return {
    agentsInstruction: 'Follow project instructions.',
    agentsScopedInstructions: [],
    activeSkills: skillIds.map((id) => ({
      id,
      name: id,
      description: `${id} description`,
      body: `${id} body`,
      folderPath: `/tmp/project/.turing-machine/skills/${id}`,
      skillPath: `/tmp/project/.turing-machine/skills/${id}/SKILL.md`,
      hasScripts: false,
    })),
    warnings: [],
  } as AgentKernelStandardsContext
}

/**
 * A session that implements the registry semantics the bridge depends on, over
 * a real pool: `addPooledMcpServer` genuinely borrows (spawning on a miss), and
 * `listCapabilities` genuinely reports the tools the server advertised.
 */
function makeSession(pool: McpRuntimePool, sessionId = 'test-session') {
  const providers = new Map<string, ProviderInput>()
  const session = {
    addPooledMcpServer: async (options: McpServerOptions) => {
      const provider = await pool.borrow(options, sessionId)
      providers.set(options.id, { ...provider, id: options.id })
      return { id: options.id }
    },
    addMcpServer: async () => {
      throw new Error('pooled path expected')
    },
    addSkill: (input: ProviderInput) => {
      providers.set(input.id, input)
    },
    listCapabilities: () => Array.from(providers.values()),
    removeProvider: async (id: string) => providers.delete(id),
  }
  return { session: session as never, providers }
}

/** Tool names currently registered, sorted. */
function toolNames(providers: Map<string, ProviderInput>): string[] {
  return Array.from(providers.values())
    .flatMap((p) => p.tools.map((t) => t.name))
    .sort()
}

describe('MCP + skill loading', () => {
  it('loads every enabled MCP server and every skill into the session', async () => {
    const pool = new McpRuntimePool({ idleTimeoutMs: 60_000, log: silent() })
    const view = buildView([
      { name: 'alpha', tool: 'alpha_tool' },
      { name: 'beta', tool: 'beta_tool' },
      { name: 'gamma', tool: 'gamma_tool' },
    ])
    const { session, providers } = makeSession(pool)

    try {
      const { ready } = await connectMcpBackground(
        session,
        { mcpSettings: view, standardsContext: buildStandards(['ui_critic', 'seo_auditor']) },
        { projectPath: '/tmp/project', mcpPool: pool },
      )
      const result = await ready

      // Every server connected — none silently dropped.
      expect(result.failedMcpNames).toEqual([])
      expect([...result.connectedMcpIds].sort()).toEqual([
        'turing-machine:mcp:alpha',
        'turing-machine:mcp:beta',
        'turing-machine:mcp:gamma',
      ])
      // Each server's REAL advertised tool list came back over JSON-RPC.
      expect(result.connectedMcpToolNames).toEqual({
        alpha: ['alpha_tool'],
        beta: ['beta_tool'],
        gamma: ['gamma_tool'],
      })
      // Both skills registered as callable tools, under the namespaced name
      // `sanitizeSkillToolName` assigns.
      expect([...result.skillToolNames].sort()).toEqual([
        'turing_machine_skill_seo_auditor',
        'turing_machine_skill_ui_critic',
      ])
      // And the session registry holds MCP tools and skill tools together.
      expect(toolNames(providers)).toEqual([
        'alpha_tool',
        'beta_tool',
        'gamma_tool',
        'turing_machine_skill_seo_auditor',
        'turing_machine_skill_ui_critic',
      ])
    } finally {
      await pool.dispose()
    }
  })

  it('reuses warm pool entries instead of respawning on the next run', async () => {
    const pool = new McpRuntimePool({ idleTimeoutMs: 60_000, log: silent() })
    const view = buildView([{ name: 'alpha', tool: 'alpha_tool' }])
    const { servers } = resolveOpenWaggleMcpServers(view)

    try {
      // Warm path: what the MCP page does after a save.
      await Promise.all(servers.map((options) => pool.prewarm(options)))
      expect(pool.pooledIds()).toEqual(['turing-machine:mcp:alpha'])

      // Run path: a fresh session borrows.
      const first = makeSession(pool, 'session-1')
      await (
        await connectMcpBackground(
          first.session,
          { mcpSettings: view, standardsContext: buildStandards([]) },
          { projectPath: '/tmp/project', mcpPool: pool },
        )
      ).ready

      // A second, unrelated session borrows the same server.
      const second = makeSession(pool, 'session-2')
      await (
        await connectMcpBackground(
          second.session,
          { mcpSettings: view, standardsContext: buildStandards([]) },
          { projectPath: '/tmp/project', mcpPool: pool },
        )
      ).ready

      // Same underlying provider object => same child process, no respawn.
      const a = first.providers.get('turing-machine:mcp:alpha')
      const b = second.providers.get('turing-machine:mcp:alpha')
      expect(a?.tools[0]?.execute).toBe(b?.tools[0]?.execute)
      expect(pool.pooledIds()).toEqual(['turing-machine:mcp:alpha'])
    } finally {
      await pool.dispose()
    }
  })

  it('skips disabled and non-stdio servers, and reports why', async () => {
    const pool = new McpRuntimePool({ idleTimeoutMs: 60_000, log: silent() })
    const view = buildView([
      { name: 'alpha', tool: 'alpha_tool' },
      { name: 'turned_off', tool: 'off_tool', enabled: false },
      { name: 'remote', tool: 'remote_tool', transport: 'http' },
    ])
    const { session, providers } = makeSession(pool)

    try {
      const result = await (
        await connectMcpBackground(
          session,
          { mcpSettings: view, standardsContext: buildStandards([]) },
          { projectPath: '/tmp/project', mcpPool: pool },
        )
      ).ready

      expect(result.connectedMcpIds).toEqual(['turing-machine:mcp:alpha'])
      expect(toolNames(providers)).toEqual(['alpha_tool'])
      // The non-stdio server is a visible skip, not a silent drop — the user
      // enabled it and deserves to know it isn't bridged.
      expect(result.issues.map((i) => i.kind)).toEqual(['mcp-skip'])
      expect(result.issues[0]?.message).toMatch(/remote/)
      // A server the user turned off produces no issue at all.
      expect(result.issues[0]?.message).not.toMatch(/turned_off/)
    } finally {
      await pool.dispose()
    }
  })

  it('evicts a server that was disabled on the MCP page', async () => {
    const { reconcileMcpPool } = await import('../turing-memory-prewarm')
    const projectPath = '/tmp/project-evict'

    const before = buildView([
      { name: 'alpha', tool: 'alpha_tool' },
      { name: 'beta', tool: 'beta_tool' },
    ])
    await reconcileMcpPool(projectPath, before)

    const { getSharedMcpPool } = await import('../turing-memory-prewarm')
    const pool = getSharedMcpPool(projectPath)
    try {
      expect(pool.pooledIds().sort()).toEqual(['turing-machine:mcp:alpha', 'turing-machine:mcp:beta'])

      // User toggles beta off; the page fires reconcile with the new view.
      const after = buildView([
        { name: 'alpha', tool: 'alpha_tool' },
        { name: 'beta', tool: 'beta_tool', enabled: false },
      ])
      await reconcileMcpPool(projectPath, after)

      // beta's process is gone — not left alive for the 24h idle window.
      expect(pool.pooledIds()).toEqual(['turing-machine:mcp:alpha'])

      // And a run started now sees only alpha.
      const { session, providers } = makeSession(pool)
      const result = await (
        await connectMcpBackground(
          session,
          { mcpSettings: after, standardsContext: buildStandards([]) },
          { projectPath, mcpPool: pool },
        )
      ).ready
      expect(result.connectedMcpIds).toEqual(['turing-machine:mcp:alpha'])
      expect(toolNames(providers)).toEqual(['alpha_tool'])
    } finally {
      await pool.dispose()
    }
  })
})

function silent() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

describe('a slow server must not hide the fast ones', () => {
  it('snapshot() reports servers already attached while another is still connecting', async () => {
    // The real failure: chrome-devtools-mcp (a `github:` spec) took ~15s while
    // playwright was up in under a second. `ready` waits for all of them, the
    // run's 8s deadline expired, and the prompt was built with NO connected MCP
    // tools — so the model insisted Playwright was unavailable.
    const pool = new McpRuntimePool({ idleTimeoutMs: 60_000, log: silent() })
    const view = buildView([
      { name: 'fast', tool: 'fast_tool' },
      { name: 'slow', tool: 'slow_tool' },
    ])
    const { session, providers } = makeSession(pool)

    // Make 'slow' hang past the observation point.
    const realAdd = (session as unknown as { addPooledMcpServer: unknown }).addPooledMcpServer as (
      o: McpServerOptions,
    ) => Promise<{ id: string }>
    ;(session as unknown as { addPooledMcpServer: unknown }).addPooledMcpServer = async (
      options: McpServerOptions,
    ) => {
      if (options.id.endsWith('slow')) {
        await new Promise((resolve) => setTimeout(resolve, 3_000))
      }
      return realAdd(options)
    }

    try {
      const { ready, snapshot } = await connectMcpBackground(
        session,
        { mcpSettings: view, standardsContext: buildStandards(['ui_critic']) },
        { projectPath: '/tmp/project-partial', mcpPool: pool },
      )

      // Observe well before `slow` can finish.
      await new Promise((resolve) => setTimeout(resolve, 1_200))
      const partial = snapshot()

      expect(partial.connectedMcpIds).toEqual(['turing-machine:mcp:fast'])
      expect(Object.keys(partial.connectedMcpToolNames)).toEqual(['fast'])
      // Skills register synchronously, so they are never what we are waiting on.
      expect(partial.skillToolNames).toEqual(['turing_machine_skill_ui_critic'])

      // And the eventual result still contains both.
      const final = await ready
      expect([...final.connectedMcpIds].sort()).toEqual([
        'turing-machine:mcp:fast',
        'turing-machine:mcp:slow',
      ])
      expect(toolNames(providers)).toContain('slow_tool')
    } finally {
      await pool.dispose()
    }
  })
})
