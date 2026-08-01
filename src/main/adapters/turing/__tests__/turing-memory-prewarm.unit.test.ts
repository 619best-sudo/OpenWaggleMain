import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../env', () => ({
  env: {
    OPENWAGGLE_OPENROUTER_API_KEY: 'openrouter-env-key',
    OPENROUTER_API_KEY: undefined,
    OPENWAGGLE_OPENROUTER_BASE_URL: undefined,
    OPENROUTER_BASE_URL: undefined,
    OPENWAGGLE_TURING_MACHINE_TOKEN: 'tm-env-token',
    OPENWAGGLE_TURING_MACHINE_BASE_URL: 'http://localhost:8787/v1',
    TURING_MACHINE_BASE_URL: undefined,
  },
  logLevel: 'error',
}))

vi.mock('../../pi/pi-provider-catalog', () => ({
  createPiRuntimeAuthStorage: () => ({
    get: (providerId: string) =>
      providerId === 'openrouter'
        ? { type: 'api_key', key: 'stored-openrouter-key' }
        : providerId === 'turing-machine'
          ? { type: 'api_key', key: 'stored-tm-key' }
          : undefined,
  }),
  // Default LLM routing goes through the backend, so resolving a config needs
  // the backend base URL.
  resolveTuringMachineBaseUrl: () => 'http://127.0.0.1:3001/turing-machine',
}))

const harnessCreateCount = vi.hoisted(() => ({ value: 0 }))
const attachOpenWaggleRuntimeMock = vi.hoisted(() => vi.fn(async () => ({ issues: [] })))

vi.mock('turing-harness', () => {
  class MockHarness {
    createProjectSession = vi.fn(async () => ({
      session: {
        fileMemoryRuntime: {
          getStatus: () => ({
            llmSyncEnabled: false,
            isRefreshing: false,
          }),
          refreshAllSummaries: vi.fn(async () => undefined),
        },
        addPooledMcpServer: vi.fn(async () => ({ id: 'mcp-1' })),
        addMcpServer: vi.fn(async () => ({ id: 'mcp-1' })),
        addSkill: vi.fn(async () => undefined),
        removeProvider: vi.fn(async () => undefined),
      },
    }))

    constructor() {
      harnessCreateCount.value += 1
    }

    dispose = vi.fn(async () => undefined)
  }

  return {
    Harness: MockHarness,
    FileMemory: {
      open: vi.fn(async () => ({
        getSummarySyncData: () => ({
          llmSyncEnabled: false,
        }),
      })),
    },
    McpRuntimePool: class {
      // The shared pool is constructed by getSharedMcpPool; a bare class is enough.
    },
    // Asset generation defaults to the backend proxy, so building a session's
    // asset backends goes through the harness's backend image seam.
    createBackendImageBackend: vi.fn(() => vi.fn()),
    createOpenRouterImageBackend: vi.fn(() => vi.fn()),
  }
})

// Mock the bridge so prewarm-with-runtime tests can assert the attach is
// attempted without needing the real turing-harness MCP/skill APIs.
vi.mock('../turing-openwaggle-bridge', () => ({
  attachOpenWaggleRuntime: attachOpenWaggleRuntimeMock,
}))

import {
  checkoutWarmProjectSession,
  disposeAllWarmProjectSessions,
  prewarmProjectMemory,
} from '../turing-memory-prewarm'

describe('turing-memory-prewarm', () => {
  beforeEach(() => {
    harnessCreateCount.value = 0
  })

  afterEach(async () => {
    await disposeAllWarmProjectSessions()
  })

  it('reuses the prewarmed spare on checkout without rebuilding for the prompt', async () => {
    const prewarmed = await prewarmProjectMemory('/tmp/repo')
    expect(harnessCreateCount.value).toBe(1)

    const checkedOut = await checkoutWarmProjectSession('pi-session-1', '/tmp/repo')

    // The first prompt reuses the prewarmed spare instead of blocking on a fresh
    // project-session build (the source of new-thread "thinking starts late").
    expect(checkedOut.session).toBe(prewarmed.session)
  })

  it('replenishes a spare after checkout so the next new thread stays warm', async () => {
    await prewarmProjectMemory('/tmp/repo')
    expect(harnessCreateCount.value).toBe(1)

    // Checkout consumes the spare (spare -> assigned) and kicks off building a
    // replacement in the background, so a signature-matching spare is ready for
    // the next thread instead of being built on its critical path.
    await checkoutWarmProjectSession('pi-session-1', '/tmp/repo')
    expect(harnessCreateCount.value).toBe(2)
  })

  it('attaches MCP servers + skills during prewarm when runtime inputs are supplied', async () => {
    attachOpenWaggleRuntimeMock.mockClear()
    const mcpSettings = {
      adapter: { enabled: true, packageSource: '', runtimeConfigPath: null },
      sources: [],
      effective: { mcpServers: {}, disabledMcpServers: {}, settings: {}, imports: [] },
      servers: [
        {
          name: 'fs',
          enabled: true,
          sourceId: 'global-standard',
          sourceLabel: 'Global',
          sourcePath: '/tmp/mcp.json',
          transport: 'stdio',
          directTools: 'inherited',
          command: 'npx',
        },
      ],
      runtimeConfigPath: null,
    } as never
    const standardsContext = {
      agentsInstruction: 'AGENTS',
      agentsScopedInstructions: [],
      activeSkills: [
        {
          id: 'my-skill',
          name: 'My Skill',
          description: 'desc',
          body: 'body',
          skillPath: '/tmp/SKILL.md',
          folderPath: '/tmp/skill',
          hasScripts: false,
        },
      ],
      warnings: [],
    } as never

    await prewarmProjectMemory('/tmp/repo-with-runtime', { mcpSettings, standardsContext })

    // The bridge attach is the single point where MCP clients + skill providers
    // get wired into the prewarmed session. Verifying it was called with the
    // supplied runtime proves the prewarm path actually surfaces extensions.
    expect(attachOpenWaggleRuntimeMock).toHaveBeenCalledTimes(1)
    const calls = attachOpenWaggleRuntimeMock.mock.calls as unknown as unknown[][]
    expect(calls[0]?.[1]).toMatchObject({
      mcpSettings,
      standardsContext,
    })
  })

  it('does not call the bridge when no runtime inputs are supplied', async () => {
    attachOpenWaggleRuntimeMock.mockClear()
    await prewarmProjectMemory('/tmp/repo-no-runtime')
    expect(attachOpenWaggleRuntimeMock).not.toHaveBeenCalled()
  })
})
