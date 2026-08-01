import type { McpSettingsView } from '@shared/types/mcp'
import type { SessionDetail } from '@shared/types/session'
import { DEFAULT_SETTINGS } from '@shared/types/settings'
import { Layer } from 'effect'
import * as Effect from 'effect/Effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentKernelService } from '../../ports/agent-kernel-service'
import { McpConfigService } from '../../ports/mcp-config-service'
import { ProviderService } from '../../ports/provider-service'
import { SessionProjectionRepository } from '../../ports/session-projection-repository'
import { SettingsService } from '../../services/settings-service'
import { loadAgentRunPreflight } from '../agent-run/preflight'
import type { AgentRunInput } from '../agent-run/types'

// `buildTuringStandardsContext` calls into the filesystem (AGENTS.md resolution
// + skill catalog scan). Mock it so the preflight unit test stays hermetic; we
// only need to assert that its RESULT is threaded through, not that the loader
// itself works (that's covered elsewhere).
vi.mock('../../agent/standards-context-projection', () => ({
  buildTuringStandardsContext: vi.fn(async () => ({
    agentsInstruction: 'AGENTS',
    agentsScopedInstructions: [],
    activeSkills: [],
    warnings: [],
  })),
  projectStandardsContextForTuring: vi.fn((ctx: unknown) => ctx),
}))

const session: SessionDetail = {
  id: 'session-preflight-1' as never,
  piSessionId: 'pi-preflight-1',
  projectPath: '/tmp/preflight-project',
  title: 'Preflight test',
  createdAt: 0,
  updatedAt: 0,
  messages: [],
} as unknown as SessionDetail

const baseInput: AgentRunInput = {
  sessionId: session.id,
  runId: 'run-preflight-1',
  payload: { text: 'hello', thinkingLevel: 'medium', attachments: [] },
  model: 'openai/gpt-5.4' as never,
  signal: new AbortController().signal,
  onEvent: () => undefined,
}

const mcpView: McpSettingsView = {
  adapter: { enabled: true, packageSource: 'pkg', runtimeConfigPath: null },
  sources: [],
  effective: { mcpServers: {}, disabledMcpServers: {}, settings: {}, imports: [] },
  servers: [
    {
      name: 'test-server',
      enabled: true,
      sourceId: 'global-standard',
      sourceLabel: 'Global',
      sourcePath: '/tmp/mcp.json',
      transport: 'stdio',
      directTools: 'inherited',
      command: 'node',
    },
  ],
  runtimeConfigPath: null,
}

let mcpGetViewMock: ReturnType<typeof vi.fn>

const TestLayer = Layer.mergeAll(
  Layer.succeed(SessionProjectionRepository, {
    get: () => Effect.succeed(session),
    getOptional: () => Effect.succeed(session),
    list: () => Effect.succeed([]),
    listDetails: () => Effect.succeed([]),
    create: () => Effect.succeed(session),
    delete: () => Effect.void,
    archive: () => Effect.void,
    unarchive: () => Effect.void,
    listArchived: () => Effect.succeed([]),
    updateTitle: () => Effect.void,
  }),
  Layer.succeed(ProviderService, {
    get: () => Effect.succeed(undefined),
    getAll: () => Effect.succeed([]),
    getProviderForModel: () => Effect.dieMessage('not used'),
    isKnownModel: () => Effect.succeed(true),
  }),
  Layer.succeed(SettingsService, {
    get: () => Effect.succeed(DEFAULT_SETTINGS),
    update: () => Effect.void,
    initialize: () => Effect.void,
    flushForTests: () => Effect.void,
  }),
  Layer.succeed(McpConfigService, {
    getView: () => Effect.succeed(mcpView),
    setAdapterEnabled: () => Effect.succeed(mcpView),
    setServerEnabled: () => Effect.succeed(mcpView),
    writeSourceConfig: () => Effect.succeed(mcpView),
  }),
  Layer.succeed(AgentKernelService, {
    createSession: () => Effect.dieMessage('not used'),
    run: () => Effect.dieMessage('not used'),
    getContextUsage: () => Effect.dieMessage('not used'),
    compact: () => Effect.dieMessage('not used'),
    navigateTree: () => Effect.dieMessage('not used'),
    forkSession: () => Effect.dieMessage('not used'),
    getSessionSnapshot: () => Effect.dieMessage('not used'),
  }),
)

describe('loadAgentRunPreflight', () => {
  beforeEach(() => {
    mcpGetViewMock = vi.fn(() => Effect.succeed(mcpView))
  })

  it('resolves mcpSettings from McpConfigService and threads it into the success result', async () => {
    const result = await Effect.runPromise(loadAgentRunPreflight(baseInput).pipe(Effect.provide(TestLayer)))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.mcpSettings).toEqual(mcpView)
  })

  it('resolves a turing standards context with all-enabled skills', async () => {
    const result = await Effect.runPromise(loadAgentRunPreflight(baseInput).pipe(Effect.provide(TestLayer)))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.standardsContext).toBeDefined()
    expect(result.standardsContext?.agentsInstruction).toBe('AGENTS')
  })

  it('still succeeds when MCP view resolution fails (best-effort downgrade)', async () => {
    const failingMcpLayer = Layer.succeed(McpConfigService, {
      getView: (() => Effect.fail(new Error('mcp config unreadable'))) as never,
      setAdapterEnabled: () => Effect.dieMessage('not used'),
      setServerEnabled: () => Effect.dieMessage('not used'),
      writeSourceConfig: () => Effect.dieMessage('not used'),
    })
    const layer = Layer.mergeAll(
      Layer.succeed(SessionProjectionRepository, {
        get: () => Effect.succeed(session),
        getOptional: () => Effect.succeed(session),
        list: () => Effect.succeed([]),
        listDetails: () => Effect.succeed([]),
        create: () => Effect.succeed(session),
        delete: () => Effect.void,
        archive: () => Effect.void,
        unarchive: () => Effect.void,
        listArchived: () => Effect.succeed([]),
        updateTitle: () => Effect.void,
      }),
      Layer.succeed(ProviderService, {
        get: () => Effect.succeed(undefined),
        getAll: () => Effect.succeed([]),
        getProviderForModel: () => Effect.dieMessage('not used'),
        isKnownModel: () => Effect.succeed(true),
      }),
      Layer.succeed(SettingsService, {
        get: () => Effect.succeed(DEFAULT_SETTINGS),
        update: () => Effect.void,
        initialize: () => Effect.void,
        flushForTests: () => Effect.void,
      }),
      failingMcpLayer,
      Layer.succeed(AgentKernelService, {
        createSession: () => Effect.dieMessage('not used'),
        run: () => Effect.dieMessage('not used'),
        getContextUsage: () => Effect.dieMessage('not used'),
        compact: () => Effect.dieMessage('not used'),
        navigateTree: () => Effect.dieMessage('not used'),
        forkSession: () => Effect.dieMessage('not used'),
        getSessionSnapshot: () => Effect.dieMessage('not used'),
      }),
    )

    const result = await Effect.runPromise(loadAgentRunPreflight(baseInput).pipe(Effect.provide(layer)))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // MCP resolution failed → mcpSettings is absent, but the run can still proceed.
    expect(result.mcpSettings).toBeUndefined()
  })
})
