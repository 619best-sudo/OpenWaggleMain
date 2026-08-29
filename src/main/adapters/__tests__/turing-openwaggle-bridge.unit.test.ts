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
          sourceId: 'project-turing-machine',
          sourceLabel: 'Project OpenWaggle',
          sourcePath: '/tmp/project/.turing-machine/agent/mcp.json',
          url: 'http://localhost:8123/sse',
          transport: 'http',
          directTools: 'enabled',
        },
        {
          name: 'playwright',
          enabled: true,
          sourceId: 'project-turing-machine',
          sourceLabel: 'Project OpenWaggle',
          sourcePath: '/tmp/project/.turing-machine/agent/mcp.json',
          command: 'npx',
          transport: 'stdio',
          directTools: 'enabled',
        },
      ],
      runtimeConfigPath: null,
    })

    expect(resolved.servers).toEqual([
      {
        id: 'turing-machine:mcp:playwright',
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
              sourceId: 'project-turing-machine',
              sourceLabel: 'Project OpenWaggle',
              sourcePath: '/tmp/project/.turing-machine/agent/mcp.json',
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
              folderPath: '/tmp/project/.turing-machine/skills/ui_critic',
              skillPath: '/tmp/project/.turing-machine/skills/ui_critic/SKILL.md',
              hasScripts: false,
            },
          ],
          warnings: [],
        },
      },
    )

    expect(addMcpServer).toHaveBeenCalledWith({
      id: 'turing-machine:mcp:playwright',
      name: 'playwright',
      command: 'npx',
      args: ['-y', 'playwright@1.58.2'],
    })
    expect(addSkill).toHaveBeenCalledTimes(1)
    const skillProvider = addSkill.mock.calls[0]?.[0] as ProviderInput
    expect(skillProvider.id).toBe('turing-machine:skill:ui_critic')
    expect(skillProvider.kind).toBe('skill')
    expect(skillProvider.tools[0]?.name).toBe('turing_machine_skill_ui_critic')
    expect(result.enabledMcpNames).toEqual(['playwright'])
    expect(result.attemptedMcpNames).toEqual(['playwright'])
    expect(result.connectedMcpIds).toEqual(['turing-machine:mcp:playwright'])
    expect(result.skillToolNames).toEqual(['turing_machine_skill_ui_critic'])
    await expect(skillProvider.tools[0]?.execute('tool', {}, {} as never)).resolves.toMatchObject({
      output: expect.stringContaining('Check alignment and contrast.'),
    })
  })

  it('builds a structured bridge debug snapshot with the resolved prepare tools', () => {
    const value = buildOpenWaggleRuntimeDebugValue(
      {
        listCapabilities: () => [
          { id: 'builtin:ls', kind: 'tool' },
          { id: 'turing-machine:mcp:playwright', kind: 'mcp' },
          { id: 'turing-machine:skill:ui_critic', kind: 'skill' },
        ],
        toolsForCategorizer: () => [
          { name: 'ls' },
          { name: 'read' },
          { name: 'playwright_navigate' },
        ],
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
          agentsInstruction: '',
          agentsScopedInstructions: [],
          activeSkills: [
            {
              id: 'ui_critic',
              name: 'UI Critic',
              description: 'Review UI polish.',
              body: 'Check alignment and contrast.',
              folderPath: '/tmp/project/.turing-machine/skills/ui_critic',
              skillPath: '/tmp/project/.turing-machine/skills/ui_critic/SKILL.md',
              hasScripts: false,
            },
          ],
          warnings: [],
        },
        bridge: {
          issues: [],
          connectedMcpToolNames: {},
          failedMcpNames: [],
          enabledMcpNames: ['playwright'],
          attemptedMcpNames: ['playwright'],
          connectedMcpIds: ['turing-machine:mcp:playwright'],
          skillToolNames: ['turing_machine_skill_ui_critic'],
        },
      },
    )

    expect(value).toEqual({
      mcpAdapterEnabled: true,
      mcpRuntimeConfigPath: '/tmp/runtime.json',
      enabledMcpNames: ['playwright'],
      // The debug stub's session never ran a selection, so it reads empty.
      // In a real run the selection is the enabled set (enabled = used).
      selectedMcpNames: [],
      attemptedMcpNames: ['playwright'],
      connectedMcpIds: ['turing-machine:mcp:playwright'],
      bridgeIssues: [],
      activeSkillIds: ['ui_critic'],
      activeSkillToolNames: ['turing_machine_skill_ui_critic'],
      providerIds: [
        'builtin:ls',
        'turing-machine:mcp:playwright',
        'turing-machine:skill:ui_critic',
      ],
      providerKinds: [
        { id: 'builtin:ls', kind: 'tool' },
        { id: 'turing-machine:mcp:playwright', kind: 'mcp' },
        { id: 'turing-machine:skill:ui_critic', kind: 'skill' },
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
            folderPath: '/tmp/project/.turing-machine/skills/ui_critic',
            skillPath: '/tmp/project/.turing-machine/skills/ui_critic/SKILL.md',
            hasScripts: false,
          },
        ],
        warnings: ['Skill catalog warning'],
      },
      bridge: {
        connectedMcpToolNames: {},
        failedMcpNames: [],
        issues: [
          {
            kind: 'mcp-skip',
            message:
              'Skipped MCP "browserUse" because only stdio MCP servers can be bridged into turing-harness right now.',
          },
        ],
        skillToolNames: ['turing_machine_skill_ui_critic'],
      },
    })

    expect(prompt).toContain('TURING MACHINE AGENT INSTRUCTIONS:')
    expect(prompt).toContain('Prefer project scripts.')
    expect(prompt).toContain('TURING MACHINE SCOPED INSTRUCTIONS:')
    expect(prompt).toContain('TURING MACHINE ACTIVE SKILLS:')
    expect(prompt).toContain('tool: turing_machine_skill_ui_critic')
    expect(prompt).toContain('TURING MACHINE STANDARDS WARNINGS:')
    expect(prompt).toContain('Skill catalog warning')
    expect(prompt).toContain('TURING MACHINE MCP BRIDGE NOTES:')
    expect(prompt).toContain('USER TASK:\n\nBuild the feature')
  })

  describe('connected MCP tool guidance', () => {
    const promptFor = (connectedMcpToolNames: Record<string, readonly string[]>) =>
      buildOpenWaggleRuntimePrompt('Change the popup title', {
        bridge: {
          connectedMcpToolNames,
          failedMcpNames: [],
          issues: [],
          skillToolNames: [],
        },
      })

    it('routes screen verification through activity_inspect rather than a raw screenshot', () => {
      // The line this replaced ("Prefer these MCP tools over bash ... for
      // screenshots") competed with the harness, whose verification gate
      // credits `activity_inspect` (capture + evaluate) and deliberately does
      // NOT credit a bare screenshot. A run that obeyed it captured screens the
      // gate could not use and finished reporting the change unverified.
      const prompt = promptFor({ 'device-server': ['mobile_take_screenshot', 'mobile_launch_app'] })

      expect(prompt).toContain(
        'VERIFYING A SCREEN: call `activity_inspect`, not a raw screenshot tool.',
      )
      expect(prompt).toContain('a capture, not an evaluation')
      expect(prompt).toContain('media_analysis')
      expect(prompt).not.toContain('Prefer these MCP tools over bash')
    })

    it('still points taps, gestures and inspection at the raw MCP tools', () => {
      const prompt = promptFor({ playwright: ['browser_take_screenshot', 'browser_click'] })
      expect(prompt).toContain('taps, typing, gestures, element lists')
      expect(prompt).toContain('Do not shell out to curl')
    })

    it('names bash as the way an app gets onto a device', () => {
      // The other half of the old line. "Prefer MCP over bash for device
      // interaction" steered the model away from the one step no MCP tool
      // performs; it reached for `flutter build apk`, which installs nothing.
      const prompt = promptFor({ 'device-server': ['mobile_take_screenshot'] })

      expect(prompt).toContain('GETTING THE APP ONTO A DEVICE IS A `bash` JOB')
      expect(prompt).toContain('BUILDS, INSTALLS AND LAUNCHES')
      expect(prompt).toContain('background: true')
    })

    it('points at the project for the actual command instead of naming one', () => {
      // This prompt is built before the run and knows nothing about the repo.
      // The harness's verify round reads the project's own scripts/Makefile/
      // docs and quotes the real commands; a generic `flutter run -d <id>` here
      // would contradict it for any app with flavors or a custom entrypoint.
      const prompt = promptFor({ 'device-server': ['mobile_take_screenshot'] })

      expect(prompt).toContain('the command THIS project declares')
      expect(prompt).toContain('README / CLAUDE.md / AGENTS.md')
      expect(prompt).not.toMatch(/flutter run|react-native run-|gradle assemble|flutter build/)
    })

    it('omits the device block when no device MCP is connected', () => {
      const prompt = promptFor({ playwright: ['browser_take_screenshot'] })
      expect(prompt).toContain('VERIFYING A SCREEN')
      expect(prompt).not.toContain('GETTING THE APP ONTO A DEVICE')
    })

    it('omits screen guidance entirely when nothing can capture a screen', () => {
      const prompt = promptFor({ filesystem: ['read_file', 'write_file'] })
      expect(prompt).toContain('CONNECTED MCP TOOLS')
      expect(prompt).not.toContain('VERIFYING A SCREEN')
      expect(prompt).not.toContain('GETTING THE APP ONTO A DEVICE')
    })

    it('every CONNECTED server is advertised — enabled is used, no per-run filter', () => {
      // The run selects every enabled server (turing-classic-run), and only
      // enabled servers are connected (the bridge), so anything in the
      // connection snapshot must appear in the prompt — advertising a
      // connected server is advertising a tool the chain actually holds.
      const prompt = buildOpenWaggleRuntimePrompt('Change the popup title', {
        bridge: {
          connectedMcpToolNames: {
            'chrome-devtools': ['browser_navigate', 'browser_click'],
            playwright: ['browser_navigate', 'browser_snapshot'],
          },
          failedMcpNames: [],
          issues: [],
          skillToolNames: [],
        },
      })
      expect(prompt).toContain('chrome-devtools: browser_navigate, browser_click')
      expect(prompt).toContain('playwright: browser_navigate, browser_snapshot')
    })

    it('says nothing about MCP routing when no server is connected', () => {
      const prompt = promptFor({})
      expect(prompt).not.toContain('CONNECTED MCP TOOLS')
      expect(prompt).not.toContain('VERIFYING A SCREEN')
    })
  })
})
