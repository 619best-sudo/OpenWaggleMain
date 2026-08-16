import { describe, expect, it, vi } from 'vitest'
import type { ProjectedSessionNodeInput } from '../../../ports/session-repository'
import {
  buildThreadSnapshotNode,
  createThreadSnapshotAgentHost,
  extractPersistedThreadSnapshot,
} from '../turing-thread-snapshot'

const persistedSnapshot = {
  timestamp: 1720000000000,
  task: 'Implement login retry',
  route: 'task' as const,
  disposition: 'completed' as const,
  recommendedFollowUpMode: 'structured_continue' as const,
  summary: 'Implemented retry handling and verified login flow.',
}

const abortedSnapshot = {
  ...persistedSnapshot,
  disposition: 'aborted' as const,
  summary: 'Run stopped before completion.\nLatest progress (Perform): Updated the retry handler.',
}

function makeFakeSession() {
  return {
    threadSnapshot: undefined,
    orchestrator: { setModel: vi.fn() },
    subscribe: vi.fn(() => () => undefined),
    clearThreadSnapshot: vi.fn(),
    run: vi.fn(async (_task: string, opts?: Record<string, unknown>) => ({
      task: _task,
      route: 'task',
      success: true,
      steps: [],
      refs: [],
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      ...(opts?.followUpContext ? { forwardedFollowUpContext: opts.followUpContext } : {}),
    })),
  } as {
    threadSnapshot:
      | {
          timestamp: number
          task: string
          route: 'task'
          disposition: 'completed'
          recommendedFollowUpMode: 'structured_continue'
          summary: string
        }
      | undefined
    orchestrator: { setModel: ReturnType<typeof vi.fn> }
    subscribe: ReturnType<typeof vi.fn>
    clearThreadSnapshot: ReturnType<typeof vi.fn>
    run: ReturnType<typeof vi.fn>
  }
}

describe('turing-thread-snapshot', () => {
  it('extracts the latest persisted thread snapshot from custom nodes', () => {
    const olderNode = buildThreadSnapshotNode(
      { ...persistedSnapshot, timestamp: 1, summary: 'older summary' },
      1,
    )
    const latestNode = buildThreadSnapshotNode(persistedSnapshot, persistedSnapshot.timestamp)
    const unrelatedNode: ProjectedSessionNodeInput = {
      id: 'custom-other',
      parentId: null,
      piEntryType: 'custom',
      kind: 'custom',
      role: null,
      timestampMs: 3,
      contentJson: JSON.stringify({ customType: 'other', data: { ok: true } }),
      metadataJson: '{}',
      pathDepth: 0,
      createdOrder: 99,
    }

    const extracted = extractPersistedThreadSnapshot([
      { ...olderNode, createdOrder: 1 },
      unrelatedNode,
      { ...latestNode, createdOrder: 2 },
    ])

    expect(extracted).toEqual(persistedSnapshot)
  })

  it('injects persisted follow-up context only when the live session has no snapshot', async () => {
    const session = makeFakeSession()
    const host = createThreadSnapshotAgentHost(session as never, persistedSnapshot)

    await host.run('Refine the implementation')

    expect(session.run).toHaveBeenCalledWith(
      'Refine the implementation',
      expect.objectContaining({
        followUpContext: {
          mode: 'structured_continue',
          previousRun: persistedSnapshot,
        },
      }),
    )
  })

  it('does not override a live session snapshot with persisted follow-up context', async () => {
    const session = makeFakeSession()
    session.threadSnapshot = {
      ...persistedSnapshot,
      task: 'Live session task',
    }
    const host = createThreadSnapshotAgentHost(session as never, persistedSnapshot)

    await host.run('Refine the implementation')

    expect(session.run).toHaveBeenCalledWith(
      'Refine the implementation',
      expect.not.objectContaining({
        followUpContext: expect.anything(),
      }),
    )
  })

  it('injects an aborted persisted snapshot when it recommends structured continuation', async () => {
    const session = makeFakeSession()
    const host = createThreadSnapshotAgentHost(session as never, abortedSnapshot)

    await host.run('Continue after the stop')

    expect(session.run).toHaveBeenCalledWith(
      'Continue after the stop',
      expect.objectContaining({
        followUpContext: {
          mode: 'structured_continue',
          previousRun: abortedSnapshot,
        },
      }),
    )
  })
})
