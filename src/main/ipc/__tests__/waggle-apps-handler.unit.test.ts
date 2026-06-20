import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { WagglePresetId } from '@shared/types/brand'
import type { McpSettingsView } from '@shared/types/mcp'
import { DEFAULT_SETTINGS } from '@shared/types/settings'
import { WAGGLE_INHERIT_MODEL, type WagglePreset } from '@shared/types/waggle'
import { Layer } from 'effect'
import * as Effect from 'effect/Effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { McpConfigService } from '../../ports/mcp-config-service'
import { SettingsService } from '../../services/settings-service'

const { typedHandleMock } = vi.hoisted(() => ({
  typedHandleMock: vi.fn(),
}))

vi.mock('../typed-ipc', () => ({
  typedHandle: typedHandleMock,
}))

import { registerWaggleAppsHandlers } from '../waggle-apps-handler'

function samplePreset(): WagglePreset {
  return {
    id: WagglePresetId('preset-1'),
    name: 'Review Pair',
    description: 'Two-agent code review',
    config: {
      mode: 'sequential',
      agents: [
        {
          label: 'Reviewer',
          model: WAGGLE_INHERIT_MODEL,
          roleDescription: 'Reviews the result',
          color: 'blue',
        },
        {
          label: 'Implementer',
          model: WAGGLE_INHERIT_MODEL,
          roleDescription: 'Implements the change',
          color: 'amber',
        },
      ],
      stop: { primary: 'consensus', maxTurnsSafety: 8 },
    },
    app: {
      requiredMcps: [],
      requiredSkills: ['ui-critic'],
    },
    isBuiltIn: false,
    createdAt: 1,
    updatedAt: 1,
  }
}

function blankMcpSettingsView(projectPath: string): McpSettingsView {
  return {
    adapter: {
      enabled: false,
      packageSource: 'extensions/pi-mcp-adapter',
      runtimeConfigPath: null,
    },
    sources: [
      {
        id: 'project-openwaggle',
        label: 'Project OpenWaggle',
        path: path.join(projectPath, '.openwaggle', 'agent', 'mcp.json'),
        scope: 'project' as const,
        kind: 'openwaggle' as const,
        exists: false,
        editable: true,
        serverCount: 0,
        disabledServerCount: 0,
        rawJson: '{\n  "mcpServers": {}\n}\n',
      },
    ],
    effective: {
      mcpServers: {},
      disabledMcpServers: {},
      settings: {},
      imports: [],
    },
    servers: [],
    runtimeConfigPath: null,
  }
}

function getInvokeHandler(name: string, projectPath: string) {
  const call = typedHandleMock.mock.calls.find(
    (args: readonly unknown[]) => args[0] === name && typeof args[1] === 'function',
  )
  const handler = call?.[1]
  if (typeof handler !== 'function') {
    return undefined
  }

  let settingsState = {
    ...DEFAULT_SETTINGS,
    skillTogglesByProject: {} as Record<string, Record<string, boolean>>,
  }
  const mcpView = blankMcpSettingsView(projectPath)

  const testLayer = Layer.mergeAll(
    Layer.succeed(SettingsService, {
      get: () => Effect.succeed(settingsState),
      update: (partial) =>
        Effect.sync(() => {
          settingsState = { ...settingsState, ...partial }
        }),
      initialize: () => Effect.void,
      flushForTests: () => Effect.void,
    }),
    Layer.succeed(McpConfigService, {
      getView: () => Effect.succeed(mcpView),
      setAdapterEnabled: () => Effect.succeed(mcpView),
      setServerEnabled: () => Effect.succeed(mcpView),
      writeSourceConfig: () => Effect.succeed(mcpView),
    }),
  )

  return (...args: unknown[]) => Effect.runPromise(Effect.provide(handler(...args), testLayer))
}

describe('registerWaggleAppsHandlers', () => {
  let tmpRoot = ''
  let projectPath = ''

  beforeEach(async () => {
    typedHandleMock.mockReset()
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ow-waggle-apps-'))
    projectPath = path.join(tmpRoot, 'project')
    await fs.mkdir(projectPath, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true })
  })

  it('registers the Waggle app install IPC channels', () => {
    registerWaggleAppsHandlers()

    const channels = typedHandleMock.mock.calls.map((args: unknown[]) => args[0])
    expect(channels).toContain('waggle-apps:get-install-status')
    expect(channels).toContain('waggle-apps:install-dependencies')
  })

  it('reports missing starter skills before installation and installed after install', async () => {
    const preset = samplePreset()

    registerWaggleAppsHandlers()
    const getStatusHandler = getInvokeHandler('waggle-apps:get-install-status', projectPath)
    const installHandler = getInvokeHandler('waggle-apps:install-dependencies', projectPath)

    const beforeInstall = await getStatusHandler?.({}, preset, projectPath)
    expect(beforeInstall).toEqual(
      expect.objectContaining({
        ready: false,
        installedCount: 0,
        missingCount: 1,
      }),
    )

    const installResult = await installHandler?.({}, preset, projectPath)
    expect(installResult).toEqual(
      expect.objectContaining({
        installedDependencyIds: ['ui-critic'],
        unsupportedDependencyIds: [],
        status: expect.objectContaining({
          ready: true,
          installedCount: 1,
        }),
      }),
    )

    const skillPath = path.join(projectPath, '.openwaggle', 'skills', 'ui-critic', 'SKILL.md')
    await expect(fs.readFile(skillPath, 'utf8')).resolves.toContain('name: ui-critic')
  })
})
