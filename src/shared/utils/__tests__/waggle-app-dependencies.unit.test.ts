import { describe, expect, it } from 'vitest'
import { buildWaggleAppInstallStatus } from '../waggle-app-dependencies'

describe('buildWaggleAppInstallStatus', () => {
  it('marks known installed dependencies as ready', () => {
    const status = buildWaggleAppInstallStatus({
      app: {
        requiredMcps: ['playwright'],
        requiredSkills: ['ui-critic'],
      },
      mcpSettings: {
        adapter: {
          enabled: true,
          packageSource: 'extensions/pi-mcp-adapter',
          runtimeConfigPath: null,
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
            sourceId: 'project-openwaggle',
            sourceLabel: 'Project OpenWaggle',
            sourcePath: '/tmp/project/.openwaggle/agent/mcp.json',
            command: 'npx',
            transport: 'stdio',
            directTools: 'inherited',
          },
        ],
        runtimeConfigPath: null,
      },
      catalog: {
        projectPath: '/tmp/project',
        skills: [
          {
            id: 'ui-critic',
            name: 'ui-critic',
            description: 'Critiques UI changes.',
            folderPath: '/tmp/project/.openwaggle/skills/ui-critic',
            skillPath: '/tmp/project/.openwaggle/skills/ui-critic/SKILL.md',
            hasScripts: false,
            enabled: true,
            loadStatus: 'ok',
          },
        ],
      },
    })

    expect(status.ready).toBe(true)
    expect(status.requiredDependencyCount).toBe(2)
    expect(status.optionalDependencyCount).toBe(0)
    expect(status.installedCount).toBe(2)
    expect(status.missingCount).toBe(0)
    expect(status.unsupportedCount).toBe(0)
    expect(status.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'playwright',
          required: true,
          description:
            'Lets Waggle agents inspect and automate browser UI state during UI-focused flows.',
          setupSteps: expect.arrayContaining([
            'Confirm the target project can run locally before using browser automation.',
          ]),
        }),
      ]),
    )
  })

  it('marks unknown dependency ids as unsupported', () => {
    const status = buildWaggleAppInstallStatus({
      app: {
        requiredMcps: ['custom-mcp'],
        requiredSkills: ['custom-skill'],
      },
      mcpSettings: null,
      catalog: null,
    })

    expect(status.ready).toBe(false)
    expect(status.installedCount).toBe(0)
    expect(status.missingCount).toBe(0)
    expect(status.unsupportedCount).toBe(2)
    expect(status.dependencies).toEqual([
      expect.objectContaining({
        kind: 'mcp',
        id: 'custom-mcp',
        required: true,
        state: 'unsupported',
      }),
      expect.objectContaining({
        kind: 'skill',
        id: 'custom-skill',
        required: true,
        state: 'unsupported',
      }),
    ])
  })

  it('does not block readiness when only optional dependencies are missing', () => {
    const status = buildWaggleAppInstallStatus({
      app: {
        requiredMcps: ['playwright'],
        requiredSkills: [],
        optionalMcps: ['figma', 'ffmpeg'],
        optionalSkills: ['media-director'],
      },
      mcpSettings: {
        adapter: {
          enabled: true,
          packageSource: 'extensions/pi-mcp-adapter',
          runtimeConfigPath: null,
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
            sourceId: 'project-openwaggle',
            sourceLabel: 'Project OpenWaggle',
            sourcePath: '/tmp/project/.openwaggle/agent/mcp.json',
            command: 'npx',
            transport: 'stdio',
            directTools: 'inherited',
          },
        ],
        runtimeConfigPath: null,
      },
      catalog: null,
    })

    expect(status.ready).toBe(true)
    expect(status.requiredDependencyCount).toBe(1)
    expect(status.optionalDependencyCount).toBe(3)
    expect(status.installedCount).toBe(1)
    expect(status.optionalMissingCount).toBe(3)
    expect(status.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'playwright', required: true, state: 'installed' }),
        expect.objectContaining({ id: 'figma', required: false, state: 'missing' }),
        expect.objectContaining({ id: 'ffmpeg', required: false, state: 'missing' }),
        expect.objectContaining({ id: 'media-director', required: false, state: 'missing' }),
      ]),
    )
  })

  it('treats database and sql as the same MCP server recipe', () => {
    const status = buildWaggleAppInstallStatus({
      app: {
        requiredMcps: ['sql'],
        requiredSkills: [],
      },
      mcpSettings: {
        adapter: {
          enabled: true,
          packageSource: 'extensions/pi-mcp-adapter',
          runtimeConfigPath: null,
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
            name: 'database',
            enabled: true,
            sourceId: 'project-openwaggle',
            sourceLabel: 'Project OpenWaggle',
            sourcePath: '/tmp/project/.openwaggle/agent/mcp.json',
            command: 'npx',
            transport: 'stdio',
            directTools: 'inherited',
          },
        ],
        runtimeConfigPath: null,
      },
      catalog: null,
    })

    expect(status.ready).toBe(true)
    expect(status.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'sql', required: true, state: 'installed' }),
      ]),
    )
  })

  it('treats disabled but known dependencies as missing', () => {
    const status = buildWaggleAppInstallStatus({
      app: {
        requiredMcps: ['playwright'],
        requiredSkills: ['ui-critic'],
      },
      mcpSettings: {
        adapter: {
          enabled: true,
          packageSource: 'extensions/pi-mcp-adapter',
          runtimeConfigPath: null,
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
            enabled: false,
            sourceId: 'project-openwaggle',
            sourceLabel: 'Project OpenWaggle',
            sourcePath: '/tmp/project/.openwaggle/agent/mcp.json',
            command: 'npx',
            transport: 'stdio',
            directTools: 'inherited',
          },
        ],
        runtimeConfigPath: null,
      },
      catalog: {
        projectPath: '/tmp/project',
        skills: [
          {
            id: 'ui-critic',
            name: 'ui-critic',
            description: 'Critiques UI changes.',
            folderPath: '/tmp/project/.openwaggle/skills/ui-critic',
            skillPath: '/tmp/project/.openwaggle/skills/ui-critic/SKILL.md',
            hasScripts: false,
            enabled: false,
            loadStatus: 'ok',
          },
        ],
      },
    })

    expect(status.ready).toBe(false)
    expect(status.installedCount).toBe(0)
    expect(status.missingCount).toBe(2)
    expect(status.unsupportedCount).toBe(0)
  })

  it('recognizes frontend-ui-audit starter dependency ids as supported', () => {
    const status = buildWaggleAppInstallStatus({
      app: {
        requiredMcps: ['playwright'],
        requiredSkills: ['frontend-implementer', 'ui-screenshot-auditor'],
      },
      mcpSettings: null,
      catalog: null,
    })

    expect(status.ready).toBe(false)
    expect(status.installedCount).toBe(0)
    expect(status.missingCount).toBe(3)
    expect(status.unsupportedCount).toBe(0)
    expect(status.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'playwright', state: 'missing' }),
        expect.objectContaining({ id: 'frontend-implementer', state: 'missing' }),
        expect.objectContaining({ id: 'ui-screenshot-auditor', state: 'missing' }),
      ]),
    )
  })

  it('recognizes qa-debug starter dependency ids as supported', () => {
    const status = buildWaggleAppInstallStatus({
      app: {
        requiredMcps: [],
        requiredSkills: [],
        optionalMcps: ['playwright', 'mobile-mcp', 'mobile-device', 'postman', 'database'],
        optionalSkills: ['frontend-implementer', 'ui-screenshot-auditor', 'backend-auditor'],
      },
      mcpSettings: null,
      catalog: null,
    })

    expect(status.ready).toBe(true)
    expect(status.installedCount).toBe(0)
    expect(status.missingCount).toBe(0)
    expect(status.unsupportedCount).toBe(0)
    expect(status.optionalMissingCount).toBe(8)
    expect(status.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'playwright', required: false, state: 'missing' }),
        expect.objectContaining({ id: 'mobile-mcp', required: false, state: 'missing' }),
        expect.objectContaining({ id: 'mobile-device', required: false, state: 'missing' }),
        expect.objectContaining({ id: 'postman', required: false, state: 'missing' }),
        expect.objectContaining({ id: 'database', required: false, state: 'missing' }),
        expect.objectContaining({ id: 'frontend-implementer', required: false, state: 'missing' }),
        expect.objectContaining({ id: 'ui-screenshot-auditor', required: false, state: 'missing' }),
        expect.objectContaining({ id: 'backend-auditor', required: false, state: 'missing' }),
      ]),
    )
  })

  it('recognizes development-qa starter dependency ids as supported', () => {
    const status = buildWaggleAppInstallStatus({
      app: {
        requiredMcps: ['playwright', 'mobile-mcp', 'postman', 'database'],
        requiredSkills: ['ui-screenshot-auditor', 'backend-auditor'],
      },
      mcpSettings: null,
      catalog: null,
    })

    expect(status.ready).toBe(false)
    expect(status.installedCount).toBe(0)
    expect(status.missingCount).toBe(6)
    expect(status.unsupportedCount).toBe(0)
    expect(status.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'playwright', state: 'missing' }),
        expect.objectContaining({ id: 'mobile-mcp', state: 'missing' }),
        expect.objectContaining({ id: 'postman', state: 'missing' }),
        expect.objectContaining({ id: 'database', state: 'missing' }),
        expect.objectContaining({ id: 'ui-screenshot-auditor', state: 'missing' }),
        expect.objectContaining({ id: 'backend-auditor', state: 'missing' }),
      ]),
    )
  })

  it('recognizes security-audit starter dependency ids as supported', () => {
    const status = buildWaggleAppInstallStatus({
      app: {
        requiredMcps: [],
        requiredSkills: ['security-auditor'],
      },
      mcpSettings: null,
      catalog: null,
    })

    expect(status.ready).toBe(false)
    expect(status.installedCount).toBe(0)
    expect(status.missingCount).toBe(1)
    expect(status.unsupportedCount).toBe(0)
    expect(status.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'security-auditor', state: 'missing' }),
      ]),
    )
  })

  it('recognizes performance-inspector starter dependency ids as supported', () => {
    const status = buildWaggleAppInstallStatus({
      app: {
        requiredMcps: ['chrome-devtools', 'mobile-mcp', 'postman', 'sql'],
        requiredSkills: ['performance-auditor'],
      },
      mcpSettings: null,
      catalog: null,
    })

    expect(status.ready).toBe(false)
    expect(status.installedCount).toBe(0)
    expect(status.missingCount).toBe(5)
    expect(status.unsupportedCount).toBe(0)
    expect(status.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'chrome-devtools', state: 'missing' }),
        expect.objectContaining({ id: 'mobile-mcp', state: 'missing' }),
        expect.objectContaining({ id: 'postman', state: 'missing' }),
        expect.objectContaining({ id: 'sql', state: 'missing' }),
        expect.objectContaining({ id: 'performance-auditor', state: 'missing' }),
      ]),
    )
  })

  it('recognizes game-factory starter dependency ids as supported', () => {
    const status = buildWaggleAppInstallStatus({
      app: {
        requiredMcps: [
          'playwright',
          'chrome-devtools',
          'blender',
          '3d-asset-processing',
          'gltf-mcp',
          'multimodal-media',
          'ffmpeg',
        ],
        requiredSkills: [
          'game-planner-director',
          'game-skeleton-prototype-builder',
          'game-world-presentation-builder',
          'game-character-actor-builder',
          'game-qa-runtime-governor',
          'game-loop-contract-governor',
        ],
      },
      mcpSettings: null,
      catalog: null,
    })

    expect(status.ready).toBe(false)
    expect(status.installedCount).toBe(0)
    expect(status.missingCount).toBe(13)
    expect(status.unsupportedCount).toBe(0)
    expect(status.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'playwright', state: 'missing' }),
        expect.objectContaining({ id: 'chrome-devtools', state: 'missing' }),
        expect.objectContaining({ id: 'blender', state: 'missing' }),
        expect.objectContaining({ id: '3d-asset-processing', state: 'missing' }),
        expect.objectContaining({ id: 'gltf-mcp', state: 'missing' }),
        expect.objectContaining({ id: 'multimodal-media', state: 'missing' }),
        expect.objectContaining({ id: 'ffmpeg', state: 'missing' }),
        expect.objectContaining({ id: 'game-planner-director', state: 'missing' }),
        expect.objectContaining({ id: 'game-skeleton-prototype-builder', state: 'missing' }),
        expect.objectContaining({ id: 'game-world-presentation-builder', state: 'missing' }),
        expect.objectContaining({ id: 'game-character-actor-builder', state: 'missing' }),
        expect.objectContaining({ id: 'game-qa-runtime-governor', state: 'missing' }),
        expect.objectContaining({ id: 'game-loop-contract-governor', state: 'missing' }),
      ]),
    )
  })

  it('recognizes figma-backed web and mobile dependency ids as supported', () => {
    const status = buildWaggleAppInstallStatus({
      app: {
        requiredMcps: ['playwright', 'figma', 'mobile-mcp'],
        requiredSkills: ['frontend-implementer', 'ui-screenshot-auditor'],
      },
      mcpSettings: null,
      catalog: null,
    })

    expect(status.ready).toBe(false)
    expect(status.installedCount).toBe(0)
    expect(status.missingCount).toBe(5)
    expect(status.unsupportedCount).toBe(0)
    expect(status.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'playwright', state: 'missing' }),
        expect.objectContaining({
          id: 'figma',
          state: 'missing',
          description:
            'Lets Waggle agents inspect design files and compare implementation against source designs.',
        }),
        expect.objectContaining({ id: 'mobile-mcp', state: 'missing' }),
        expect.objectContaining({ id: 'frontend-implementer', state: 'missing' }),
        expect.objectContaining({ id: 'ui-screenshot-auditor', state: 'missing' }),
      ]),
    )
  })
})
