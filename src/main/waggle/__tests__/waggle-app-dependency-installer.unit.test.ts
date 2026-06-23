import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import * as Effect from 'effect/Effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { McpSettingsView } from '@shared/types/mcp'
import { DEFAULT_SETTINGS, type Settings } from '@shared/types/settings'

const mocks = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  loadSkillCatalogMock: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  execFile: mocks.execFileMock,
}))

vi.mock('../../skills/skill-catalog', () => ({
  loadSkillCatalog: mocks.loadSkillCatalogMock,
}))

import { getWaggleAppInstallStatus } from '../waggle-app-dependency-installer'

const baseSettings: Settings = {
  ...DEFAULT_SETTINGS,
  skillTogglesByProject: {},
}

const baseMcpSettings: McpSettingsView = {
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
}

describe('getWaggleAppInstallStatus active probes', () => {
  let projectPath: string

  beforeEach(async () => {
    projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'waggle-preflight-'))
    await fs.writeFile(
      path.join(projectPath, 'package.json'),
      JSON.stringify({
        name: 'probe-app',
        scripts: {
          dev: 'vite',
          build: 'vite build',
        },
        devDependencies: {
          vite: '^6.0.0',
        },
      }),
      'utf8',
    )
    await fs.writeFile(path.join(projectPath, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0', 'utf8')
    await fs.writeFile(path.join(projectPath, 'vite.config.ts'), 'export default {}', 'utf8')
    await fs.writeFile(path.join(projectPath, 'index.html'), '<!doctype html>', 'utf8')
    await fs.mkdir(path.join(projectPath, 'src'), { recursive: true })
    await fs.writeFile(path.join(projectPath, 'src', 'main.tsx'), 'console.log("boot")', 'utf8')
    await fs.mkdir(path.join(projectPath, 'node_modules'), { recursive: true })
    await fs.mkdir(path.join(projectPath, 'node_modules', '.bin'), { recursive: true })

    mocks.loadSkillCatalogMock.mockResolvedValue({
      projectPath,
      skills: [
        {
          id: 'frontend-implementer',
          name: 'frontend-implementer',
          description: 'Implements frontend UI.',
          folderPath: path.join(projectPath, '.openwaggle/skills/frontend-implementer'),
          skillPath: path.join(projectPath, '.openwaggle/skills/frontend-implementer/SKILL.md'),
          hasScripts: false,
          enabled: true,
          loadStatus: 'ok',
        },
      ],
    })
  })

  afterEach(async () => {
    await fs.rm(projectPath, { recursive: true, force: true })
    mocks.execFileMock.mockReset()
    mocks.loadSkillCatalogMock.mockReset()
  })

  it('marks web workspace runtime ready when active tool probes succeed', async () => {
    mocks.execFileMock.mockImplementation(
      (
        command: string,
        _args: readonly string[],
        _options: Record<string, unknown>,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        callback(null, `${command} 1.0.0\n`, '')
      },
    )

    const status = await getWaggleAppInstallStatus({
      projectPath,
      presetId: 'web-build',
      app: {
        requiredMcps: ['playwright'],
        requiredSkills: ['frontend-implementer'],
      },
      settingsService: {
        get: () => Effect.succeed(baseSettings),
        update: () => Effect.void,
      },
      mcpConfigService: {
        getView: () => Effect.succeed(baseMcpSettings),
        setAdapterEnabled: () => Effect.succeed(baseMcpSettings),
        setServerEnabled: () => Effect.succeed(baseMcpSettings),
        writeSourceConfig: () => Effect.succeed(baseMcpSettings),
      },
    })

    expect(status.preflight?.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'web-workspace-runtime',
          status: 'pass',
          detail: expect.stringMatching(/Web runtime prerequisites look available/i),
        }),
        expect.objectContaining({
          id: 'web-app-entry-files',
          status: 'pass',
          detail: expect.stringMatching(/index\.html/i),
        }),
        expect.objectContaining({
          id: 'web-boot-probe',
          status: 'pass',
          detail: expect.stringMatching(/Verified local web runtime entry via vite --version/i),
        }),
      ]),
    )
    expect(mocks.execFileMock).toHaveBeenCalledWith(
      'node',
      ['--version'],
      expect.objectContaining({ timeout: 2000 }),
      expect.any(Function),
    )
    expect(mocks.execFileMock).toHaveBeenCalledWith(
      'pnpm',
      ['--version'],
      expect.objectContaining({ timeout: 2000 }),
      expect.any(Function),
    )
  })

  it('downgrades web workspace runtime when active tool probes fail', async () => {
    mocks.execFileMock.mockImplementation(
      (
        _command: string,
        _args: readonly string[],
        _options: Record<string, unknown>,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        callback(new Error('probe failed'), '', 'probe failed')
      },
    )

    const status = await getWaggleAppInstallStatus({
      projectPath,
      presetId: 'web-build',
      app: {
        requiredMcps: ['playwright'],
        requiredSkills: ['frontend-implementer'],
      },
      settingsService: {
        get: () => Effect.succeed(baseSettings),
        update: () => Effect.void,
      },
      mcpConfigService: {
        getView: () => Effect.succeed(baseMcpSettings),
        setAdapterEnabled: () => Effect.succeed(baseMcpSettings),
        setServerEnabled: () => Effect.succeed(baseMcpSettings),
        writeSourceConfig: () => Effect.succeed(baseMcpSettings),
      },
    })

    expect(status.preflight?.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'web-workspace-runtime',
          status: 'warn',
          detail: expect.stringMatching(/package-manager tools are not clearly available/i),
        }),
        expect.objectContaining({
          id: 'web-boot-probe',
          status: 'warn',
          detail: expect.stringMatching(/local vite CLI probe did not succeed/i),
        }),
      ]),
    )
  })

  it('falls back to npm commands when the repo has no lockfile', async () => {
    await fs.rm(path.join(projectPath, 'pnpm-lock.yaml'), { force: true })

    mocks.execFileMock.mockImplementation(
      (
        command: string,
        _args: readonly string[],
        _options: Record<string, unknown>,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        callback(null, `${command} 1.0.0\n`, '')
      },
    )

    const status = await getWaggleAppInstallStatus({
      projectPath,
      presetId: 'web-build',
      app: {
        requiredMcps: ['playwright'],
        requiredSkills: ['frontend-implementer'],
      },
      settingsService: {
        get: () => Effect.succeed(baseSettings),
        update: () => Effect.void,
      },
      mcpConfigService: {
        getView: () => Effect.succeed(baseMcpSettings),
        setAdapterEnabled: () => Effect.succeed(baseMcpSettings),
        setServerEnabled: () => Effect.succeed(baseMcpSettings),
        writeSourceConfig: () => Effect.succeed(baseMcpSettings),
      },
    })

    expect(status.preflight?.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'web-workspace-runtime',
          status: 'pass',
          detail: expect.stringMatching(/Commands: npm run dev, npm run build/i),
        }),
      ]),
    )
    expect(mocks.execFileMock).toHaveBeenCalledWith(
      'npm',
      ['--version'],
      expect.objectContaining({ timeout: 2000 }),
      expect.any(Function),
    )
    expect(mocks.execFileMock).not.toHaveBeenCalledWith(
      'pnpm',
      ['--version'],
      expect.anything(),
      expect.any(Function),
    )
  })
})
