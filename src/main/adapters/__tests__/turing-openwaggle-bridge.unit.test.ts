import type { ProviderInput } from 'turing-harness'
import { describe, expect, it, vi } from 'vitest'
import {
  attachOpenWaggleRuntime,
  buildOpenWaggleRuntimeDebugValue,
  buildOpenWaggleRuntimePrompt,
  resolveOpenWaggleMcpServers,
} from '../turing/turing-openwaggle-bridge'

describe('turing OpenWaggle bridge', () => {
  it('converts enabled stdio MCPs into harness MCP server options and skips unsupported transports', () => {
    const resolved = resolveOpenWaggleMcpServers({
      adapter: {
        enabled: true,
        packageSource: 'pi-mcp-adapter',
        runtimeConfigPath: null,
      },
      sources: [],
      effective: {
        mcpServers: {
          playwright: {
            command: 'npx',
            args: ['-y', 'playwright@1.58.2'],
            env: { FOO: 'bar', BAD: 1 },
            cwd: '/tmp/project',
          },
          browserUse: {
            url: 'http://localhost:8123/sse',
          },
        },
        disabledMcpServers: {},
        settings: {},
        imports: [],
      },
      servers: [
        {
          name: 'browserUse',
          enabled: true,
          sourceId: 'project-openwaggle',
          sourceLabel: 'Project OpenWaggle',
          sourcePath: '/tmp/project/.openwaggle/agent/mcp.json',
          url: 'http://localhost:8123/sse',
          transport: 'http',
          directTools: 'enabled',
        },
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
    })

    expect(resolved.servers).toEqual([
      {
        id: 'openwaggle:mcp:playwright',
        name: 'playwright',
        command: 'npx',
        args: ['-y', 'playwright@1.58.2'],
        env: { FOO: 'bar' },
        cwd: '/tmp/project',
      },
    ])
    expect(resolved.issues).toEqual([
      {
        kind: 'mcp-skip',
        message:
          'Skipped MCP "browserUse" because only stdio MCP servers can be bridged into turing-harness right now.',
      },
    ])
  })

  it('registers active skills as harness skill providers and connects MCP servers', async () => {
    const addMcpServer = vi.fn(async (input) => ({ id: input.id }))
    const addSkill = vi.fn((_input: ProviderInput) => undefined)
    const result = await attachOpenWaggleRuntime(
      {
        addMcpServer,
        addSkill,
        listCapabilities: () => [],
        removeProvider: vi.fn(async () => undefined),
      } as never,
      {
        mcpSettings: {
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
        },
        standardsContext: {
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
        },
      },
    )

    expect(addMcpServer).toHaveBeenCalledWith({
      id: 'openwaggle:mcp:playwright',
      name: 'playwright',
      command: 'npx',
      args: ['-y', 'playwright@1.58.2'],
    })
    expect(addSkill).toHaveBeenCalledTimes(1)
    const skillProvider = addSkill.mock.calls[0]?.[0] as ProviderInput
    expect(skillProvider.id).toBe('openwaggle:skill:ui_critic')
    expect(skillProvider.kind).toBe('skill')
    expect(skillProvider.tools[0]?.name).toBe('openwaggle_skill_ui_critic')
    expect(result.enabledMcpNames).toEqual(['playwright'])
    expect(result.attemptedMcpNames).toEqual(['playwright'])
    expect(result.connectedMcpIds).toEqual(['openwaggle:mcp:playwright'])
    expect(result.skillToolNames).toEqual(['openwaggle_skill_ui_critic'])
    await expect(skillProvider.tools[0]?.execute('tool', {}, {} as never)).resolves.toMatchObject({
      output: expect.stringContaining('Check alignment and contrast.'),
    })
  })

  it('builds a structured bridge debug snapshot with the resolved prepare tools', () => {
    const value = buildOpenWaggleRuntimeDebugValue(
      {
        listCapabilities: () => [
          { id: 'builtin:ls', kind: 'tool' },
          { id: 'openwaggle:mcp:playwright', kind: 'mcp' },
          { id: 'openwaggle:skill:ui_critic', kind: 'skill' },
        ],
        toolsForPhase: () => [{ name: 'ls' }, { name: 'read' }, { name: 'playwright_navigate' }],
      } as never,
      {
        mcpSettings: {
          adapter: {
            enabled: true,
            packageSource: 'pi-mcp-adapter',
            runtimeConfigPath: '/tmp/runtime.json',
          },
          sources: [],
          effective: {
            mcpServers: {},
            disabledMcpServers: {},
            settings: {},
            imports: [],
          },
          servers: [
            {
              name: 'playwright',
              enabled: true,
              sourceId: 'global-pi',
              sourceLabel: 'Global Pi',
              sourcePath: '/tmp/mcp.json',
              command: 'npx',
              transport: 'stdio',
              directTools: 'enabled',
            },
          ],
          runtimeConfigPath: '/tmp/runtime.json',
        },
        standardsContext: {
          agentsInstruction: null,
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
        },
        bridge: {
          issues: [],
          enabledMcpNames: ['playwright'],
          attemptedMcpNames: ['playwright'],
          connectedMcpIds: ['openwaggle:mcp:playwright'],
          skillToolNames: ['openwaggle_skill_ui_critic'],
        },
      },
    )

    expect(value).toEqual({
      mcpAdapterEnabled: true,
      mcpRuntimeConfigPath: '/tmp/runtime.json',
      enabledMcpNames: ['playwright'],
      attemptedMcpNames: ['playwright'],
      connectedMcpIds: ['openwaggle:mcp:playwright'],
      bridgeIssues: [],
      activeSkillIds: ['ui_critic'],
      activeSkillToolNames: ['openwaggle_skill_ui_critic'],
      providerIds: ['builtin:ls', 'openwaggle:mcp:playwright', 'openwaggle:skill:ui_critic'],
      providerKinds: [
        { id: 'builtin:ls', kind: 'tool' },
        { id: 'openwaggle:mcp:playwright', kind: 'mcp' },
        { id: 'openwaggle:skill:ui_critic', kind: 'skill' },
      ],
      prepareTools: ['ls', 'read', 'playwright_navigate'],
    })
  })

  it('builds a hidden runtime prompt from standards context and bridge warnings', () => {
    const prompt = buildOpenWaggleRuntimePrompt('Build the feature', {
      standardsContext: {
        agentsInstruction: 'Prefer project scripts.',
        agentsScopedInstructions: [
          {
            scopeRelativeDir: 'src',
            filePath: '/tmp/project/.agents/src/AGENTS.md',
            content: 'Keep adapters thin.',
          },
        ],
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
        warnings: ['Skill catalog warning'],
      },
      bridge: {
        issues: [
          {
            kind: 'mcp-skip',
            message:
              'Skipped MCP "browserUse" because only stdio MCP servers can be bridged into turing-harness right now.',
          },
        ],
        skillToolNames: ['openwaggle_skill_ui_critic'],
      },
    })

    expect(prompt).toContain('OPENWAGGLE AGENT INSTRUCTIONS:')
    expect(prompt).toContain('Prefer project scripts.')
    expect(prompt).toContain('OPENWAGGLE SCOPED INSTRUCTIONS:')
    expect(prompt).toContain('OPENWAGGLE ACTIVE SKILLS:')
    expect(prompt).toContain('tool: openwaggle_skill_ui_critic')
    expect(prompt).toContain('OPENWAGGLE STANDARDS WARNINGS:')
    expect(prompt).toContain('Skill catalog warning')
    expect(prompt).toContain('OPENWAGGLE MCP BRIDGE NOTES:')
    expect(prompt).toContain('USER TASK:\n\nBuild the feature')
  })
})
