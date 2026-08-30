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
/** Ids passed to `pool.prewarm()` across the run, in order. */
const prewarmedServerIds = vi.hoisted(() => [] as string[])
const primedServerIds = vi.hoisted(() => [] as string[])

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
    // Registered at module load: the module hands the harness its Chromium
    // provisioning hook, which the harness invokes only from a failed launch.
    setBrowserBootstrap: vi.fn(),
    FileMemory: {
      open: vi.fn(async () => ({
        getSummarySyncData: () => ({
          llmSyncEnabled: false,
        }),
      })),
    },
    // The shared pool is constructed by getSharedMcpPool. Record what the warm
    // path asks it to connect so the prewarm contract can be asserted without
    // spawning real MCP child processes.
    McpRuntimePool: class {
      private readonly ids = new Set<string>()
      getInstanceId() {
        return 1
      }
      has(opts: { id: string }) {
        return this.ids.has(opts.id)
      }
      pooledIds() {
        return Array.from(this.ids)
      }
      async prewarm(opts: { id: string }) {
        this.ids.add(opts.id)
        prewarmedServerIds.push(opts.id)
      }
      async evictById(id: string) {
        this.ids.delete(id)
      }
      clearFailureCooldowns() {}
      async dispose() {
        this.ids.clear()
      }
    },
    primeMcpServerCache: vi.fn(async (opts: { id: string }) => {
      primedServerIds.push(opts.id)
    }),
    // The pool is constructed with a tool cache; without this the factory is
    // missing the constructor and `getSharedMcpPool` throws before prewarming.
    McpToolCache: class {
      get() {
        return undefined
      }
      set() {}
      forget() {}
    },
    // Asset generation defaults to the backend proxy, so building a session's
    // asset backends goes through the harness's backend image seam.
    createBackendImageBackend: vi.fn(() => vi.fn()),
    createOpenRouterImageBackend: vi.fn(() => vi.fn()),
  }
})

// Stub only the attach. `resolveOpenWaggleMcpServers` stays REAL: the warm path
// depends on it producing byte-identical server options to the run path, so
// mocking it would hide exactly the drift that would break pool reuse.
vi.mock('../turing-openwaggle-bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../turing-openwaggle-bridge')>()),
  attachOpenWaggleRuntime: attachOpenWaggleRuntimeMock,
}))

import {
  checkoutWarmProjectSession,
  disposeAllWarmProjectSessions,
  prewarmProjectMemory,
} from '../turing-memory-prewarm'

/**
 * The pool warm-up is fire-and-forget off `createWarmProjectSession` and goes
 * through a dynamic import, so it lands a few microtask turns after
 * `prewarmProjectMemory` resolves.
 */
async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for background prewarm')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

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

  it('warms enabled MCP servers into the shared pool without attaching them to the session', async () => {
    attachOpenWaggleRuntimeMock.mockClear()
    prewarmedServerIds.length = 0
    primedServerIds.length = 0
    const mcpSettings = {
      adapter: { enabled: true, packageSource: '', runtimeConfigPath: null },
      sources: [],
      // The summary says which servers are enabled; `effective.mcpServers` holds
      // the actual spawn definition. A summary without a matching definition is
      // skipped, so both halves have to be present for the server to resolve.
      effective: {
        mcpServers: {
          fs: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] },
        },
        disabledMcpServers: {},
        settings: {},
        imports: [],
      },
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
    await waitFor(() => prewarmedServerIds.length > 0)

    // Warm (pool) and attach (session) are deliberately split. Prewarm connects
    // the server into the shared pool so a later run's `borrow()` is a Map
    // lookup, and registers nothing on the spare session — that's what lets a
    // spare stay MCP-free while the pool is shared and hot.
    expect(prewarmedServerIds).toEqual(['turing-machine:mcp:fs'])
    // Priming is NOT done here any more: it lives in the pool's cold-spawn path
    // so it cannot delay a server that is served from the tool cache and never
    // spawns. An up-front barrier here blocked every server behind the slowest
    // `npm cache add`.
    expect(primedServerIds).toEqual([])
    expect(attachOpenWaggleRuntimeMock).not.toHaveBeenCalled()
  })

  it('does not touch the pool or the bridge when no runtime inputs are supplied', async () => {
    attachOpenWaggleRuntimeMock.mockClear()
    prewarmedServerIds.length = 0
    await prewarmProjectMemory('/tmp/repo-no-runtime')
    expect(attachOpenWaggleRuntimeMock).not.toHaveBeenCalled()
    expect(prewarmedServerIds).toEqual([])
  })
})
