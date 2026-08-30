import { describe, expect, it, vi } from 'vitest'
import type { ProjectedSessionNodeInput } from '../../../ports/session-repository'
import {
  buildThreadSnapshotNode,
  createThreadSnapshotAgentHost,
  extractPersistedThreadSnapshot,
  extractPersistedThreadSnapshots,
  LEDGER_MAX_STEPS,
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

function snapshotNodes(
  entries: { timestamp: number; summary: string; userQuery?: string }[],
): ProjectedSessionNodeInput[] {
  return entries.map((entry, index) => ({
    ...buildThreadSnapshotNode(
      {
        ...persistedSnapshot,
        timestamp: entry.timestamp,
        summary: entry.summary,
        ...(entry.userQuery ? { userQuery: entry.userQuery } : {}),
      },
      entry.timestamp,
    ),
    createdOrder: index + 1,
  }))
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

  it('round-trips the host-stamped userQuery through the persisted node', () => {
    const nodes = snapshotNodes([{ timestamp: 5, summary: 's', userQuery: 'add rate limiting' }])

    const extracted = extractPersistedThreadSnapshot(nodes)

    expect(extracted?.userQuery).toBe('add rate limiting')
  })

  it('extracts the last N snapshots chronologically, dropping the oldest', () => {
    const nodes = snapshotNodes(
      Array.from({ length: LEDGER_MAX_STEPS + 3 }, (_, i) => ({
        timestamp: i + 1,
        summary: `step ${i + 1}`,
      })),
    )

    const steps = extractPersistedThreadSnapshots(nodes)

    expect(steps).toHaveLength(LEDGER_MAX_STEPS)
    // Oldest first; the three oldest of the eleven were dropped.
    expect(steps[0]?.summary).toBe('step 4')
    expect(steps[steps.length - 1]?.summary).toBe(`step ${LEDGER_MAX_STEPS + 3}`)
  })

  it('returns no context on a first run (no persisted steps, no live slot)', async () => {
    const session = makeFakeSession()
    const host = createThreadSnapshotAgentHost(session as never, [])

    await host.run('First message')

    expect(session.run).toHaveBeenCalledWith(
      'First message',
      expect.not.objectContaining({ followUpContext: expect.anything() }),
    )
  })

  it('injects the step ledger as the follow-up context', async () => {
    const session = makeFakeSession()
    const steps = [
      { ...persistedSnapshot, timestamp: 1, summary: 'older step' },
      { ...persistedSnapshot, timestamp: 2, summary: 'newer step' },
    ]
    const host = createThreadSnapshotAgentHost(session as never, steps)

    await host.run('Refine the implementation')

    expect(session.run).toHaveBeenCalledWith(
      'Refine the implementation',
      expect.objectContaining({
        followUpContext: {
          mode: 'structured_continue',
          previousRun: steps[1],
          recentRuns: steps,
        },
      }),
    )
  })

  it('merges the live session slot into the ledger and dedupes on identity', async () => {
    const session = makeFakeSession()
    // The live slot is the SAME run as the newest persisted node (the warm-path
    // case) plus a live-only run the nodes cannot know about yet (the
    // auth-recovery continuation mid-run).
    const persisted = [
      { ...persistedSnapshot, timestamp: 1, summary: 'older step' },
      { ...persistedSnapshot, timestamp: 2, summary: 'live == persisted' },
    ]
    session.threadSnapshot = { ...persisted[1], summary: 'harness copy (no userQuery)' }
    const host = createThreadSnapshotAgentHost(session as never, persisted)

    await host.run('Continue')

    // Deduped: the persisted copy survived, the live twin did not duplicate it.
    expect(session.run).toHaveBeenCalledWith(
      'Continue',
      expect.objectContaining({
        followUpContext: expect.objectContaining({
          recentRuns: [
            expect.objectContaining({ summary: 'older step' }),
            expect.objectContaining({ summary: 'live == persisted' }),
          ],
        }),
      }),
    )
  })

  it('appends a live-only slot the persisted nodes do not have', async () => {
    const session = makeFakeSession()
    const persisted = [{ ...persistedSnapshot, timestamp: 1, summary: 'older step' }]
    session.threadSnapshot = {
      ...persistedSnapshot,
      timestamp: 2,
      task: 'live task',
      summary: 'the just-failed turn',
    }
    const host = createThreadSnapshotAgentHost(session as never, persisted)

    await host.run('Continue after auth recovery')

    expect(session.run).toHaveBeenCalledWith(
      'Continue after auth recovery',
      expect.objectContaining({
        followUpContext: expect.objectContaining({
          previousRun: expect.objectContaining({ summary: 'the just-failed turn' }),
          recentRuns: [
            expect.objectContaining({ summary: 'older step' }),
            expect.objectContaining({ summary: 'the just-failed turn' }),
          ],
        }),
      }),
    )
  })

  it('does not inject continuity when the newest step recommends fresh', async () => {
    const session = makeFakeSession()
    const steps = [
      { ...persistedSnapshot, timestamp: 1, summary: 'older step' },
      {
        ...persistedSnapshot,
        timestamp: 2,
        summary: 'paused on a question',
        recommendedFollowUpMode: 'fresh' as const,
        disposition: 'pending_user_question' as const,
      },
    ]
    const host = createThreadSnapshotAgentHost(session as never, steps)

    await host.run('yes, option two')

    expect(session.run).toHaveBeenCalledWith(
      'yes, option two',
      expect.not.objectContaining({ followUpContext: expect.anything() }),
    )
  })

  it('injects an aborted persisted snapshot when it recommends structured continuation', async () => {
    const session = makeFakeSession()
    const host = createThreadSnapshotAgentHost(session as never, [abortedSnapshot])

    await host.run('Continue after the stop')

    expect(session.run).toHaveBeenCalledWith(
      'Continue after the stop',
      expect.objectContaining({
        followUpContext: expect.objectContaining({
          mode: 'structured_continue',
          previousRun: abortedSnapshot,
        }),
      }),
    )
  })
})
