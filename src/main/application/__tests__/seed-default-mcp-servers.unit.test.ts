/**
 * First-run MCP seeding.
 *
 * The planner is pure, so these drive it directly with crafted config views.
 * The properties that matter are the destructive-adjacent ones: never clobber
 * a server the user already has, never rewrite a config we failed to parse.
 */

import path from 'node:path'
import type { McpConfigSourceSummary, McpServerSummary, McpSettingsView } from '@shared/types/mcp'
import { describe, expect, it } from 'vitest'
import {
  readMcpConfig,
  withFixture,
} from '../../adapters/pi/__tests__/pi-mcp-config-service.test-utils'
import { createPiMcpConfigServiceForTests } from '../../adapters/pi/pi-mcp-config-service'
import { resolveOpenWaggleMcpServers } from '../../adapters/turing/turing-openwaggle-bridge'
import { planDefaultMcpSeed } from '../seed-default-mcp-servers'

function buildView(options: {
  readonly globalRawJson?: string | null
  readonly servers?: readonly { name: string; enabled: boolean }[]
}): McpSettingsView {
  const sources: McpConfigSourceSummary[] = []
  if (options.globalRawJson !== null) {
    sources.push({
      id: 'global-standard',
      label: 'Global standard MCP',
      path: '/home/u/.config/mcp/mcp.json',
      scope: 'global',
      kind: 'standard',
      editable: true,
      exists: true,
      rawJson: options.globalRawJson ?? '{\n  "mcpServers": {}\n}\n',
      serverCount: 0,
      disabledServerCount: 0,
    })
  }
  return {
    adapter: { enabled: true, packageSource: 'pi-mcp-adapter', runtimeConfigPath: null },
    sources,
    effective: { mcpServers: {}, disabledMcpServers: {}, settings: {}, imports: [] },
    servers: (options.servers ?? []).map(
      (s) =>
        ({
          name: s.name,
          enabled: s.enabled,
          sourceId: 'project-turing-machine',
          sourceLabel: 'Project',
          sourcePath: '/p/.turing-machine/agent/mcp.json',
          command: 'npx',
          transport: 'stdio',
          directTools: 'enabled',
        }) as McpServerSummary,
    ),
    runtimeConfigPath: null,
  } as McpSettingsView
}

describe('planDefaultMcpSeed', () => {
  it('seeds playwright into an empty global config', () => {
    const plan = planDefaultMcpSeed(buildView({}))

    expect(plan.seeded).toEqual(['playwright'])
    expect(plan.skipped).toEqual([])
    const written = JSON.parse(plan.rawJson as string)
    // The spawn commands come from the shared recipe table, not a second copy.
    expect(written.mcpServers.playwright).toEqual({
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
    })
    // Device automation needs no server — the agent harness drives devices
    // through its built-in mobilecli-backed toolkit, so playwright is the only
    // entry written.
    expect(Object.keys(written.mcpServers)).toEqual(['playwright'])
    expect(plan.rawJson?.endsWith('\n')).toBe(true)
  })

  it('preserves unrelated servers and settings already in the file', () => {
    const existing = JSON.stringify({
      settings: { toolPrefix: 'short' },
      mcpServers: { figma: { command: 'npx', args: ['-y', 'figma-ui-mcp'] } },
    })

    const plan = planDefaultMcpSeed(buildView({ globalRawJson: existing }))

    const written = JSON.parse(plan.rawJson as string)
    expect(written.settings).toEqual({ toolPrefix: 'short' })
    expect(written.mcpServers.figma).toEqual({ command: 'npx', args: ['-y', 'figma-ui-mcp'] })
    expect(Object.keys(written.mcpServers).sort()).toEqual(['figma', 'playwright'])
  })

  it('does not overwrite a playwright the user already configured', () => {
    const existing = JSON.stringify({
      mcpServers: { playwright: { command: 'my-own-playwright', args: ['--custom'] } },
    })

    const plan = planDefaultMcpSeed(buildView({ globalRawJson: existing }))

    expect(plan.skipped).toEqual(['playwright'])
    expect(plan.seeded).toEqual([])
    expect(plan.rawJson).toBeNull()
  })

  it('leaves a deliberately disabled server disabled', () => {
    // A user who turned Playwright off must not get it re-added as enabled.
    const existing = JSON.stringify({
      mcpServers: {},
      openwaggle: {
        disabledMcpServers: { playwright: { command: 'npx', args: ['-y', '@playwright/mcp'] } },
      },
    })

    const plan = planDefaultMcpSeed(buildView({ globalRawJson: existing }))

    expect(plan.skipped).toEqual(['playwright'])
    expect(plan.seeded).toEqual([])
    expect(plan.rawJson).toBeNull()
  })

  it('skips a server already provided by another config source', () => {
    // Configured in a project source — adding it globally too would shadow or
    // duplicate the user's own definition.
    const plan = planDefaultMcpSeed(buildView({ servers: [{ name: 'figma', enabled: true }] }))

    expect(plan.seeded).toEqual(['playwright'])
  })

  it('writes nothing when the default is already present', () => {
    const plan = planDefaultMcpSeed(
      buildView({
        servers: [{ name: 'playwright', enabled: true }],
      }),
    )

    expect(plan.rawJson).toBeNull()
    expect(plan.seeded).toEqual([])
    expect(plan.skipped).toEqual(['playwright'])
  })

  it('refuses to rewrite a config that is not valid JSON', () => {
    // Destroying a hand-edited file is far worse than not seeding.
    expect(() => planDefaultMcpSeed(buildView({ globalRawJson: '{ "mcpServers": ' }))).toThrow(
      /not valid JSON/,
    )
  })

  it('writes nothing when the global source is unavailable', () => {
    const plan = planDefaultMcpSeed(buildView({ globalRawJson: null }))

    expect(plan.rawJson).toBeNull()
    expect(plan.seeded).toEqual([])
  })
})

describe('seeded defaults reach the runtime', () => {
  it('round-trips through the real config service into resolved MCP servers', async () => {
    // The planner producing correct JSON isn't enough — the sourceId has to
    // resolve, the write has to land at the global path, and the bridge has to
    // pick the servers back up. This drives all three against real files.
    await withFixture(async ({ home, agentDir, project }) => {
      const service = createPiMcpConfigServiceForTests({ homeDir: home, agentDir })

      const before = await service.getView(project)
      const plan = planDefaultMcpSeed(before)
      expect(plan.seeded).toEqual(['playwright'])

      await service.writeSourceConfig({
        projectPath: null,
        sourceId: 'global-standard',
        rawJson: plan.rawJson as string,
      })

      // Landed at ~/.config/mcp/mcp.json.
      expect(await readMcpConfig(path.join(home, '.config', 'mcp', 'mcp.json'))).toEqual({
        mcpServers: {
          playwright: { command: 'npx', args: ['-y', '@playwright/mcp@latest'] },
        },
      })

      // Visible and enabled to a project that has no MCP config of its own.
      const after = await service.getView(project)
      const seeded = after.servers.filter((s) => s.name === 'playwright')
      expect(seeded.map((s) => s.name)).toEqual(['playwright'])
      expect(seeded.every((s) => s.enabled)).toBe(true)
      expect(seeded.every((s) => s.sourceId === 'global-standard')).toBe(true)

      // And the bridge turns them into spawnable server options for a run.
      const { servers, issues } = resolveOpenWaggleMcpServers(after)
      expect(issues).toEqual([])
      expect(servers.map((s) => s.id)).toEqual(['turing-machine:mcp:playwright'])
      expect(servers.find((s) => s.name === 'playwright')?.args).toEqual([
        '-y',
        '@playwright/mcp@latest',
      ])

      // Re-planning now finds them and writes nothing — the seed is idempotent
      // even if the settings flag were somehow lost.
      expect(planDefaultMcpSeed(after).rawJson).toBeNull()
    })
  })
})
