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
import { clearSessionToolSelection } from '../agent-run/session-tool-selection'
import type { AgentRunInput } from '../agent-run/types'

// `buildTuringStandardsContext` calls into the filesystem (AGENTS.md resolution
// + skill catalog scan). Mock it so the preflight unit test stays hermetic; we
// only need to assert that its RESULT is threaded through and that the run's
// selected skill ids are passed in, not that the loader itself works (that's
// covered elsewhere). `vi.hoisted` because vi.mock factories are hoisted above
// top-level declarations.
const { buildTuringStandardsContextMock } = vi.hoisted(() => ({
  buildTuringStandardsContextMock: vi.fn(async () => ({
    agentsInstruction: 'AGENTS',
    agentsScopedInstructions: [],
    activeSkills: [],
    warnings: [],
  })),
}))
vi.mock('../../agent/standards-context-projection', () => ({
  buildTuringStandardsContext: buildTuringStandardsContextMock,
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
    buildTuringStandardsContextMock.mockClear()
    // The session tool selection is a module-level singleton — isolate tests.
    clearSessionToolSelection(session.id)
  })

  it('narrows mcpSettings to the servers mentioned in the message', async () => {
    const result = await Effect.runPromise(
      loadAgentRunPreflight({
        ...baseInput,
        payload: { ...baseInput.payload, text: '/test-server do things' },
      }).pipe(Effect.provide(TestLayer)),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.mcpSettings?.servers.map((server) => server.name)).toEqual(['test-server'])
  })

  it('sends no MCP servers when the message mentions none (strict gating)', async () => {
    const result = await Effect.runPromise(
      loadAgentRunPreflight(baseInput).pipe(Effect.provide(TestLayer)),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.mcpSettings?.servers).toEqual([])
  })

  it('ignores mentions of disabled MCP servers', async () => {
    const disabledView: McpSettingsView = {
      ...mcpView,
      servers: [{ ...mcpView.servers[0], enabled: false }],
    }
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
      Layer.succeed(McpConfigService, {
        getView: () => Effect.succeed(disabledView),
        setAdapterEnabled: () => Effect.succeed(disabledView),
        setServerEnabled: () => Effect.succeed(disabledView),
        writeSourceConfig: () => Effect.succeed(disabledView),
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

    const result = await Effect.runPromise(
      loadAgentRunPreflight({
        ...baseInput,
        payload: { ...baseInput.payload, text: '/test-server go' },
      }).pipe(Effect.provide(layer)),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.mcpSettings?.servers).toEqual([])
  })

  it('keeps the selection sticky across sends within the same session', async () => {
    const run = (text: string) =>
      Effect.runPromise(
        loadAgentRunPreflight({ ...baseInput, payload: { ...baseInput.payload, text } }).pipe(
          Effect.provide(TestLayer),
        ),
      )

    await run('/test-server open the site')
    const followUp = await run('now take a screenshot')

    expect(followUp.ok).toBe(true)
    if (!followUp.ok) return
    expect(followUp.mcpSettings?.servers.map((server) => server.name)).toEqual(['test-server'])
  })

  it('resolves a turing standards context and passes the run-selected skill ids', async () => {
    const result = await Effect.runPromise(
      loadAgentRunPreflight({
        ...baseInput,
        payload: { ...baseInput.payload, text: '/code-review check this' },
      }).pipe(Effect.provide(TestLayer)),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.standardsContext).toBeDefined()
    expect(result.standardsContext?.agentsInstruction).toBe('AGENTS')
    expect(buildTuringStandardsContextMock).toHaveBeenCalledWith(
      session.projectPath,
      DEFAULT_SETTINGS,
      { selectedSkillIds: ['code-review'] },
    )
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

    const result = await Effect.runPromise(
      loadAgentRunPreflight(baseInput).pipe(Effect.provide(layer)),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // MCP resolution failed → mcpSettings is absent, but the run can still proceed.
    expect(result.mcpSettings).toBeUndefined()
  })
})
