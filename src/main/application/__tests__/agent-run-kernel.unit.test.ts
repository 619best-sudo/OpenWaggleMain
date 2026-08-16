import { SupportedModelId } from '@shared/types/brand'
import type { SessionDetail, SessionNode, SessionTree } from '@shared/types/session'
import { Layer } from 'effect'
import * as Effect from 'effect/Effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type AgentKernelRunInput, AgentKernelService } from '../../ports/agent-kernel-service'
import { SessionRepository } from '../../ports/session-repository'
import { SessionProjectionRepositoryError } from '../../errors'
import { runAgentKernel } from '../agent-run/kernel'
import type { AgentRunInput } from '../agent-run/types'
import { buildThreadSnapshotNode } from '../../adapters/turing/turing-thread-snapshot'

const sessionId = 'sess-kernel-test' as never
const model = SupportedModelId('openai/gpt-5.4')

const session: SessionDetail = {
  id: sessionId,
  piSessionId: 'pi-1',
  piSessionFile: null,
  projectPath: '/tmp/project',
  title: 'Thread continuity test',
  archived: false,
  createdAt: 1,
  updatedAt: 2,
  lastActiveNodeId: null,
  lastActiveBranchId: 'branch-1' as never,
} as unknown as SessionDetail

const baseInput: AgentRunInput = {
  sessionId,
  runId: 'run-1',
  payload: { text: 'Refine the work', thinkingLevel: 'medium', attachments: [] },
  model,
  signal: new AbortController().signal,
  onEvent: () => undefined,
}

const preflight = {
  session,
  toolPermissionMode: 'default' as never,
}

const runMock = vi.fn()
let tree: SessionTree | null = null

/** Plain repo object so the failing-repo variant can override a single method. */
function repoObject(overrides: Partial<Record<string, (...args: never[]) => unknown>> = {}) {
  return {
    list: () => Effect.succeed([]),
    listArchivedBranches: () => Effect.succeed([]),
    getTree: () => Effect.sync(() => tree),
    getWorkspace: () => Effect.succeed(null),
    persistSnapshot: () => Effect.void,
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
    ...overrides,
  }
}

const TestSessionLayer = Layer.succeed(SessionRepository, repoObject())

const TestAgentKernelLayer = Layer.succeed(AgentKernelService, {
  createSession: () => Effect.fail(new Error('unused')),
  run: (input: AgentKernelRunInput) =>
    Effect.promise(async () => {
      runMock(input)
      return {
        newMessages: [],
        piSessionId: 'pi-1',
        sessionSnapshot: { activeNodeId: null, nodes: [] },
      }
    }),
  getContextUsage: () => Effect.fail(new Error('unused')),
  compact: () => Effect.fail(new Error('unused')),
  navigateTree: () => Effect.fail(new Error('unused')),
  forkSession: () => Effect.fail(new Error('unused')),
  getSessionSnapshot: () => Effect.fail(new Error('unused')),
})

const TestLayer = Layer.mergeAll(TestSessionLayer, TestAgentKernelLayer)

/** A SessionNode carrying a persisted thread snapshot, as the repo stores it. */
function snapshotNode(contentJson: string, createdOrder: number): SessionNode {
  return {
    id: `snap-${createdOrder}` as never,
    sessionId,
    parentId: null,
    piEntryType: 'custom',
    kind: 'custom',
    timestampMs: createdOrder,
    createdOrder,
    pathDepth: 0,
    contentJson,
    metadataJson: '{}',
  } as unknown as SessionNode
}

describe('runAgentKernel — thread continuity read-path', () => {
  beforeEach(() => {
    runMock.mockReset()
    tree = null
  })

  it('forwards persisted transcript nodes (incl. the prior snapshot) to the kernel', async () => {
    // The exact shape buildThreadSnapshotNode produces — the prior run's handoff.
    const snapshot = {
      timestamp: 1720000000000,
      task: 'Implement login retry',
      route: 'task' as const,
      disposition: 'completed' as const,
      recommendedFollowUpMode: 'structured_continue' as const,
      summary: 'Implemented retry handling and verified login flow.',
      writtenPaths: ['/tmp/project/login.ts'],
    }
    const node = buildThreadSnapshotNode(snapshot, snapshot.timestamp)
    tree = {
      session: { id: sessionId } as never,
      nodes: [snapshotNode(node.contentJson, 1)],
      branches: [],
      branchStates: [],
      uiState: null,
    }

    await Effect.runPromise(
      runAgentKernel(baseInput, baseInput.payload as never, preflight).pipe(Effect.provide(TestLayer)),
    )

    expect(runMock).toHaveBeenCalledOnce()
    const forwarded = runMock.mock.calls[0]?.[0] as AgentKernelRunInput
    expect(forwarded.persistedTranscriptNodes).toBeDefined()
    expect(forwarded.persistedTranscriptNodes?.length).toBe(1)
    // The node round-trips with its snapshot payload intact.
    expect(forwarded.persistedTranscriptNodes?.[0]?.contentJson).toBe(node.contentJson)
    expect(forwarded.persistedTranscriptNodes?.[0]?.kind).toBe('custom')
  })

  it('omits persistedTranscriptNodes when the repo has no nodes (first prompt ever)', async () => {
    tree = { session: { id: sessionId } as never, nodes: [], branches: [], branchStates: [], uiState: null }

    await Effect.runPromise(
      runAgentKernel(baseInput, baseInput.payload as never, preflight).pipe(Effect.provide(TestLayer)),
    )

    const forwarded = runMock.mock.calls[0]?.[0] as AgentKernelRunInput
    // No nodes → no continuity handoff, never `undefined`-as-empty confusion.
    expect(forwarded.persistedTranscriptNodes).toBeUndefined()
  })

  it('proceeds without continuity when the repo read fails (non-fatal)', async () => {
    // A repository whose getTree fails must not abort the run.
    const FailingSessionLayer = Layer.succeed(
      SessionRepository,
      repoObject({
        getTree: () =>
          Effect.fail(new SessionProjectionRepositoryError({ operation: 'getTree', cause: 'repo unavailable' })),
      }),
    )
    const failingLayer = Layer.mergeAll(FailingSessionLayer, TestAgentKernelLayer)

    await Effect.runPromise(
      runAgentKernel(baseInput, baseInput.payload as never, preflight).pipe(Effect.provide(failingLayer)),
    )

    // The run still happened; it just carries no prior context.
    expect(runMock).toHaveBeenCalledOnce()
    const forwarded = runMock.mock.calls[0]?.[0] as AgentKernelRunInput
    expect(forwarded.persistedTranscriptNodes).toBeUndefined()
  })
})
