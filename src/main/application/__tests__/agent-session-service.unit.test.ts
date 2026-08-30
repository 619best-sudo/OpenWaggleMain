import { SessionId, SessionNodeId, SupportedModelId } from '@shared/types/brand'
import type { SessionNode, SessionTree } from '@shared/types/session'
import { Layer } from 'effect'
import * as Effect from 'effect/Effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TuringHarnessAgentKernelLive } from '../../adapters/turing/turing-agent-kernel-adapter'
import { AgentKernelMissingEntryError, AgentKernelService } from '../../ports/agent-kernel-service'
import { SessionProjectionRepository } from '../../ports/session-projection-repository'
import { SessionRepository } from '../../ports/session-repository'
import {
  cloneAgentSessionToNewSession,
  compactAgentSession,
  forkAgentSessionToNewSession,
  getAgentContextUsage,
  navigateAgentSessionTree,
} from '../agent-session-service'
import {
  sessionServiceForkedSession,
  sessionServiceProviderLayer,
  sessionServiceSession,
  sessionServiceSettingsLayer,
} from './agent-session-service.test-utils'

const persistSnapshotMock = vi.fn()
const compactMock = vi.fn()
const navigateTreeMock = vi.fn()
const forkSessionMock = vi.fn()
const createProjectionMock = vi.fn()
const getProjectionMock = vi.fn()

const session = sessionServiceSession
const forkedSession = sessionServiceForkedSession

const TestSessionProjectionLayer = Layer.succeed(SessionProjectionRepository, {
  get: (id) =>
    Effect.sync(() => {
      getProjectionMock(id)
      return id === forkedSession.id ? forkedSession : session
    }),
  getOptional: () => Effect.succeed(session),
  list: () => Effect.succeed([]),
  listDetails: () => Effect.succeed([]),
  create: (input) =>
    Effect.sync(() => {
      createProjectionMock(input)
      return forkedSession
    }),
  delete: () => Effect.void,
  archive: () => Effect.void,
  unarchive: () => Effect.void,
  listArchived: () => Effect.succeed([]),
  updateTitle: () => Effect.void,
})

/** Shared so the context-meter suite can override a single method. */
const TestSessionRepositoryStub = {
  list: () => Effect.succeed([]),
  listArchivedBranches: () => Effect.succeed([]),
  getTree: () => Effect.succeed(null),
  getWorkspace: () => Effect.succeed(null),
  persistSnapshot: (input) =>
    Effect.sync(() => {
      persistSnapshotMock(input)
    }),
  updateRuntime: () => Effect.void,
  renameBranch: () => Effect.void,
  archiveBranch: () => Effect.void,
  restoreBranch: () => Effect.void,
  updateTreeUiState: () => Effect.void,
  updateBranchUiState: () => Effect.void,
  recordActiveRun: () => Effect.void,
  clearActiveRun: () => Effect.void,
  clearInterruptedRuns: () => Effect.void,
  listActiveRunsForRecovery: () => Effect.succeed([]),
  markActiveRunInterrupted: () => Effect.void,
} satisfies Parameters<typeof SessionRepository.of>[0]

const TestSessionLayer = Layer.succeed(SessionRepository, TestSessionRepositoryStub)

const TestAgentKernelLayer = Layer.succeed(AgentKernelService, {
  createSession: () => Effect.fail(new Error('createSession is not used')),
  run: () => Effect.fail(new Error('run is not used')),
  getContextUsage: () => Effect.fail(new Error('getContextUsage is not used')),
  compact: (input) =>
    Effect.tryPromise({
      try: async () => compactMock(input),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    }),
  navigateTree: (input) =>
    Effect.tryPromise({
      try: async () => navigateTreeMock(input),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    }),
  forkSession: (input) =>
    Effect.tryPromise({
      try: async () => forkSessionMock(input),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    }),
  getSessionSnapshot: () => Effect.fail(new Error('getSessionSnapshot is not used')),
})

const TestLayer = Layer.mergeAll(
  TestSessionProjectionLayer,
  sessionServiceProviderLayer,
  sessionServiceSettingsLayer,
  TestSessionLayer,
  TestAgentKernelLayer,
)

describe('agent session commands', () => {
  beforeEach(() => {
    persistSnapshotMock.mockReset()
    compactMock.mockReset()
    navigateTreeMock.mockReset()
    forkSessionMock.mockReset()
    createProjectionMock.mockReset()
    getProjectionMock.mockReset()
  })

  it('forwards manual compaction lifecycle events while persisting the compacted session snapshot', async () => {
    const events: unknown[] = []
    compactMock.mockImplementation(async (input) => {
      input.onEvent({
        type: 'compaction_start',
        reason: 'manual',
        timestamp: 10,
        model: SupportedModelId('openai/gpt-5.4'),
      })
      input.onEvent({
        type: 'compaction_end',
        reason: 'manual',
        result: {
          summary: 'Kept the active task context.',
          firstKeptEntryId: 'kept-user',
          tokensBefore: 123456,
        },
        aborted: false,
        willRetry: false,
        timestamp: 20,
        model: SupportedModelId('openai/gpt-5.4'),
      })
      return {
        summary: 'Kept the active task context.',
        firstKeptEntryId: 'kept-user',
        tokensBefore: 123456,
        piSessionId: 'pi-session-1',
        piSessionFile: '/tmp/pi-session-1.jsonl',
        sessionSnapshot: {
          activeNodeId: 'compaction-summary',
          nodes: [],
        },
      }
    })

    const result = await Effect.runPromise(
      compactAgentSession({
        sessionId: SessionId('session-1'),
        model: SupportedModelId('openai/gpt-5.4'),
        onEvent: (event) => events.push(event),
      }).pipe(Effect.provide(TestLayer)),
    )

    expect(result).toEqual({
      summary: 'Kept the active task context.',
      firstKeptEntryId: 'kept-user',
      tokensBefore: 123456,
    })
    expect(events.map((event) => event)).toMatchObject([
      { type: 'compaction_start', reason: 'manual' },
      { type: 'compaction_end', reason: 'manual', aborted: false },
    ])
    expect(persistSnapshotMock).toHaveBeenCalledWith({
      sessionId: SessionId('session-1'),
      nodes: [],
      activeNodeId: 'compaction-summary',
      piSessionId: 'pi-session-1',
      piSessionFile: '/tmp/pi-session-1.jsonl',
    })
  })

  it('passes the manual compaction cancellation signal to the kernel', async () => {
    const abortController = new AbortController()
    compactMock.mockResolvedValue({
      summary: 'Kept the active task context.',
      firstKeptEntryId: 'kept-user',
      tokensBefore: 123456,
      piSessionId: 'pi-session-1',
      piSessionFile: '/tmp/pi-session-1.jsonl',
      sessionSnapshot: {
        activeNodeId: 'compaction-summary',
        nodes: [],
      },
    })

    await Effect.runPromise(
      compactAgentSession({
        sessionId: SessionId('session-1'),
        model: SupportedModelId('openai/gpt-5.4'),
        signal: abortController.signal,
      }).pipe(Effect.provide(TestLayer)),
    )

    expect(compactMock).toHaveBeenCalledWith(
      expect.objectContaining({ signal: abortController.signal }),
    )
  })

  it('treats stale projected nodes that are missing from the Pi JSONL session as cancelled navigation', async () => {
    navigateTreeMock.mockRejectedValue(new AgentKernelMissingEntryError('stale-node'))

    const result = await Effect.runPromise(
      navigateAgentSessionTree({
        sessionId: SessionId('session-1'),
        model: SupportedModelId('openai/gpt-5.4'),
        targetNodeId: SessionNodeId('stale-node'),
      }).pipe(Effect.provide(TestLayer)),
    )

    expect(result).toEqual({ cancelled: true })
    expect(persistSnapshotMock).not.toHaveBeenCalled()
  })

  it('persists the returned Pi session snapshot after successful navigation', async () => {
    navigateTreeMock.mockResolvedValue({
      piSessionId: 'pi-session-1',
      piSessionFile: '/tmp/pi-session-1.jsonl',
      sessionSnapshot: {
        activeNodeId: 'target-node',
        nodes: [],
      },
      editorText: 'draft',
      cancelled: false,
    })

    const result = await Effect.runPromise(
      navigateAgentSessionTree({
        sessionId: SessionId('session-1'),
        model: SupportedModelId('openai/gpt-5.4'),
        targetNodeId: SessionNodeId('target-node'),
      }).pipe(Effect.provide(TestLayer)),
    )

    expect(result).toEqual({ editorText: 'draft', cancelled: false })
    expect(persistSnapshotMock).toHaveBeenCalledWith({
      sessionId: SessionId('session-1'),
      nodes: [],
      activeNodeId: 'target-node',
      piSessionId: 'pi-session-1',
      piSessionFile: '/tmp/pi-session-1.jsonl',
    })
  })

  it('forks a previous user message into a new projected session and prefills the editor text', async () => {
    forkSessionMock.mockResolvedValue({
      cancelled: false,
      editorText: 'retry this prompt',
      piSessionId: 'pi-session-forked',
      piSessionFile: '/tmp/pi-session-forked.jsonl',
      sessionSnapshot: {
        activeNodeId: 'parent-node',
        nodes: [],
      },
    })

    const result = await Effect.runPromise(
      forkAgentSessionToNewSession({
        sessionId: SessionId('session-1'),
        model: SupportedModelId('openai/gpt-5.4'),
        targetNodeId: SessionNodeId('user-node'),
      }).pipe(Effect.provide(TestLayer)),
    )

    expect(result).toEqual({
      cancelled: false,
      editorText: 'retry this prompt',
      session: forkedSession,
    })
    expect(forkSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        session,
        model: SupportedModelId('openai/gpt-5.4'),
        targetNodeId: 'user-node',
        position: 'before',
      }),
    )
    expect(createProjectionMock).toHaveBeenCalledWith({
      projectPath: '/tmp/project',
      piSessionId: 'pi-session-forked',
      piSessionFile: '/tmp/pi-session-forked.jsonl',
    })
    expect(persistSnapshotMock).toHaveBeenCalledWith({
      sessionId: SessionId('pi-session-forked'),
      nodes: [],
      activeNodeId: 'parent-node',
      piSessionId: 'pi-session-forked',
      piSessionFile: '/tmp/pi-session-forked.jsonl',
    })
    expect(getProjectionMock).toHaveBeenCalledWith(SessionId('pi-session-forked'))
  })

  it('clones the current node into a new projected session without editor prefill', async () => {
    forkSessionMock.mockResolvedValue({
      cancelled: false,
      piSessionId: 'pi-session-forked',
      piSessionFile: '/tmp/pi-session-forked.jsonl',
      sessionSnapshot: {
        activeNodeId: 'current-node',
        nodes: [],
      },
    })

    const result = await Effect.runPromise(
      cloneAgentSessionToNewSession({
        sessionId: SessionId('session-1'),
        model: SupportedModelId('openai/gpt-5.4'),
        targetNodeId: SessionNodeId('current-node'),
      }).pipe(Effect.provide(TestLayer)),
    )

    expect(result).toEqual({
      cancelled: false,
      session: forkedSession,
    })
    expect(forkSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        targetNodeId: 'current-node',
        position: 'at',
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// The composer context meter, end to end through the real turing kernel.
//
// Every link between the IPC call and the number on screen is here: the
// projection lookup, the non-fatal tree read, the mapping to projected nodes,
// and the kernel's own estimate. It is wired to the REAL kernel layer rather
// than a stub because the failure this covers — a meter frozen at zero — lived
// in the wiring, not in the arithmetic.
// ---------------------------------------------------------------------------
describe('getAgentContextUsage', () => {
  const WRAPPED_PROMPT =
    'Use the following Turing Machine runtime context while working on the task.\n\nUSER TASK:\nfix the header'

  function threadSnapshotNode(index: number): SessionNode {
    const snapshot = {
      timestamp: 1_700_000_000_000 + index,
      task: WRAPPED_PROMPT,
      userQuery: `ask number ${String(index)}`,
      route: 'task',
      disposition: 'completed',
      recommendedFollowUpMode: 'structured_continue',
      summary: `finished step ${String(index)} and verified it`,
    }
    return {
      id: SessionNodeId(`node-${String(index)}`),
      sessionId: session.id,
      parentId: null,
      piEntryType: 'custom',
      kind: 'custom',
      timestampMs: snapshot.timestamp,
      createdOrder: index,
      pathDepth: 0,
      contentJson: JSON.stringify({
        customType: 'openwaggle.turing-thread-snapshot',
        data: snapshot,
      }),
      metadataJson: '{}',
    }
  }

  function usageLayerWithTree(tree: Effect.Effect<SessionTree | null, never>) {
    return Layer.mergeAll(
      TestSessionProjectionLayer,
      Layer.succeed(SessionRepository, {
        ...TestSessionRepositoryStub,
        getTree: () => tree,
      }),
      TuringHarnessAgentKernelLive,
      sessionServiceProviderLayer,
      sessionServiceSettingsLayer,
    )
  }

  function treeOf(nodes: readonly SessionNode[]): SessionTree {
    return {
      session: {
        id: session.id,
        title: session.title,
        projectPath: session.projectPath,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      } as SessionTree['session'],
      nodes,
      branches: [],
      branchStates: [],
      uiState: null,
    }
  }

  function readUsage(tree: Effect.Effect<SessionTree | null, never>) {
    return Effect.runPromise(
      getAgentContextUsage({
        sessionId: SessionId('session-1'),
        model: SupportedModelId('openrouter/poolside/laguna-xs-2.1'),
      }).pipe(Effect.provide(usageLayerWithTree(tree))),
    )
  }

  it('reports a real, non-zero reading once the thread has runs', async () => {
    const usage = await readUsage(Effect.succeed(treeOf([threadSnapshotNode(1)])))

    // The bug this replaces: a meter permanently reading 0 tokens.
    expect(usage?.tokens).toBeGreaterThan(0)
    expect(usage?.contextWindow).toBe(262_144)
    expect(usage?.label).toBe('Next request')
    expect(usage?.percent).toBeGreaterThan(0)
  })

  it('grows with the thread, because the continuity block the next run carries grows', async () => {
    const one = await readUsage(Effect.succeed(treeOf([threadSnapshotNode(1)])))
    const three = await readUsage(
      Effect.succeed(treeOf([threadSnapshotNode(1), threadSnapshotNode(2), threadSnapshotNode(3)])),
    )

    expect(three?.tokens).toBeGreaterThan(one?.tokens ?? 0)
  })

  it('reads zero on a fresh session with no persisted runs', async () => {
    const usage = await readUsage(Effect.succeed(null))

    expect(usage?.tokens).toBe(0)
    expect(usage?.contextWindow).toBe(262_144)
  })

  it('degrades to an empty reading rather than failing when the tree read errors', async () => {
    // A meter is not worth failing an IPC call over.
    const usage = await Effect.runPromise(
      getAgentContextUsage({
        sessionId: SessionId('session-1'),
        model: SupportedModelId('openrouter/poolside/laguna-xs-2.1'),
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            TestSessionProjectionLayer,
            Layer.succeed(SessionRepository, {
              ...TestSessionRepositoryStub,
              getTree: () => Effect.fail(new Error('tree read exploded') as never),
            }),
            TuringHarnessAgentKernelLive,
            sessionServiceProviderLayer,
            sessionServiceSettingsLayer,
          ),
        ),
      ),
    )

    expect(usage?.tokens).toBe(0)
  })
})
