import type { McpSettingsView } from '@shared/types/mcp'
import type { ProjectMemoryStatus } from '@shared/types/project-memory'
import * as Effect from 'effect/Effect'
import type { Layer as LayerType } from 'effect/Layer'
import * as Layer from 'effect/Layer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, (...args: unknown[]) => unknown>()

// Mock electron's ipcMain so `typedHandle` records each handler by channel.
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    },
    on: vi.fn(),
  },
}))

// Mock the runtime so the Effect runs with the test layer providing the
// SettingsService + McpConfigService contexts the handler requires. The layer
// is set lazily in beforeEach (vi.hoisted runs before imports, so Layer can't
// be referenced at hoist time).
const { runtimeMock } = vi.hoisted(() => ({
  runtimeMock: { currentLayer: null as LayerType<unknown> | null },
}))
vi.mock('../../runtime', () => ({
  runAppEffectExit: (effect: Effect.Effect<unknown, unknown>) => {
    if (!runtimeMock.currentLayer) throw new Error('TestLayer not set before handler call')
    return Effect.runPromiseExit(Effect.provide(effect, runtimeMock.currentLayer))
  },
}))

vi.mock('../../logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

// Mock the prewarm engine so we can assert it is called (and fire-and-forget).
const prewarmProjectMemoryMock = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const getProjectMemoryStatusMock = vi.hoisted(() => vi.fn())
const refreshProjectMemoryMock = vi.hoisted(() => vi.fn())
vi.mock('../../adapters/turing/turing-memory-prewarm', () => ({
  prewarmProjectMemory: prewarmProjectMemoryMock,
  getProjectMemoryStatus: getProjectMemoryStatusMock,
  refreshProjectMemory: refreshProjectMemoryMock,
}))

// Mock the standards-context builder so the prewarm handler's runtime input
// resolution is hermetic.
vi.mock('../../agent/standards-context-projection', () => ({
  buildTuringStandardsContext: vi.fn(async () => ({
    agentsInstruction: '',
    agentsScopedInstructions: [],
    activeSkills: [],
    warnings: [],
  })),
}))

import { McpConfigService } from '../../ports/mcp-config-service'
import { SettingsService } from '../../services/settings-service'
import { registerProjectMemoryHandlers } from '../project-memory-handler'

const emptyMcpView: McpSettingsView = {
  adapter: { enabled: false, packageSource: '', runtimeConfigPath: null },
  sources: [],
  effective: { mcpServers: {}, disabledMcpServers: {}, settings: {}, imports: [] },
  servers: [],
  runtimeConfigPath: null,
}

const sampleStatus: ProjectMemoryStatus = {
  projectPath: '/tmp/project',
  isEnabled: false,
  isRefreshing: false,
}

const TestLayer = Layer.mergeAll(
  Layer.succeed(SettingsService, {
    get: () => Effect.succeed({ skillTogglesByProject: {} } as never),
    update: () => Effect.void,
    initialize: () => Effect.void,
    flushForTests: () => Effect.void,
  }),
  Layer.succeed(McpConfigService, {
    getView: () => Effect.succeed(emptyMcpView),
    setAdapterEnabled: () => Effect.succeed(emptyMcpView),
    setServerEnabled: () => Effect.succeed(emptyMcpView),
    writeSourceConfig: () => Effect.succeed(emptyMcpView),
  }),
)

describe('project-memory-handler', () => {
  beforeEach(() => {
    handlers.clear()
    runtimeMock.currentLayer = TestLayer as LayerType<unknown>
    prewarmProjectMemoryMock.mockClear()
    getProjectMemoryStatusMock.mockClear()
    refreshProjectMemoryMock.mockClear()
    getProjectMemoryStatusMock.mockResolvedValue(sampleStatus)
    refreshProjectMemoryMock.mockResolvedValue(sampleStatus)
  })

  it('registers the three project-memory channels', () => {
    registerProjectMemoryHandlers()
    expect(handlers.has('project-memory:get-status')).toBe(true)
    expect(handlers.has('project-memory:refresh')).toBe(true)
    expect(handlers.has('project-memory:prewarm')).toBe(true)
  })

  it('get-status delegates to getProjectMemoryStatus', async () => {
    registerProjectMemoryHandlers()
    const handler = handlers.get('project-memory:get-status')!
    const result = await handler({} as never, '/tmp/project', 'model-ref')

    expect(getProjectMemoryStatusMock).toHaveBeenCalledWith('/tmp/project', 'model-ref')
    expect(result).toEqual(sampleStatus)
  })

  it('refresh delegates to refreshProjectMemory', async () => {
    registerProjectMemoryHandlers()
    const handler = handlers.get('project-memory:refresh')!
    const result = await handler({} as never, '/tmp/project', 'model-ref', 'pi-1')

    expect(refreshProjectMemoryMock).toHaveBeenCalledWith('/tmp/project', 'model-ref', 'pi-1')
    expect(result).toEqual(sampleStatus)
  })

  it('prewarm is fire-and-forget: returns immediately while the build runs in the background', async () => {
    registerProjectMemoryHandlers()
    const handler = handlers.get('project-memory:prewarm')!

    const result = await handler({} as never, '/tmp/project', 'model-ref')

    // The IPC resolves to undefined (the channel contract), and the prewarm
    // engine was kicked — proving the spare build was started in the background.
    expect(result).toBeUndefined()
    expect(prewarmProjectMemoryMock).toHaveBeenCalledTimes(1)
    expect(prewarmProjectMemoryMock).toHaveBeenCalledWith(
      '/tmp/project',
      expect.objectContaining({ modelRef: 'model-ref' }),
    )
  })

  it('prewarm still resolves when MCP view resolution fails (best-effort downgrade)', async () => {
    const failingMcpLayer = Layer.succeed(McpConfigService, {
      getView: (() => Effect.fail(new Error('config unreadable'))) as never,
      setAdapterEnabled: () => Effect.dieMessage('not used'),
      setServerEnabled: () => Effect.dieMessage('not used'),
      writeSourceConfig: () => Effect.dieMessage('not used'),
    })
    runtimeMock.currentLayer = Layer.mergeAll(
      Layer.succeed(SettingsService, {
        get: () => Effect.succeed({ skillTogglesByProject: {} } as never),
        update: () => Effect.void,
        initialize: () => Effect.void,
        flushForTests: () => Effect.void,
      }),
      failingMcpLayer,
    ) as LayerType<unknown>

    registerProjectMemoryHandlers()
    const handler = handlers.get('project-memory:prewarm')!

    // Should not throw — the failure is swallowed and prewarm proceeds without MCP.
    const result = await handler({} as never, '/tmp/project')
    expect(result).toBeUndefined()
    expect(prewarmProjectMemoryMock).toHaveBeenCalledWith(
      '/tmp/project',
      expect.not.objectContaining({ mcpSettings: expect.anything() }),
    )
  })
})
