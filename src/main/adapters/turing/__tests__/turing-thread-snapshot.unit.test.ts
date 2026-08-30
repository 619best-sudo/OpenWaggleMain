import { describe, expect, it, vi } from 'vitest'
import type { ProjectedSessionNodeInput } from '../../../ports/session-repository'
import {
  buildThreadSnapshotNode,
  buildTuringContextUsageSnapshot,
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
  entries: { timestamp: number; summary: string; userQuery?: string; task?: string }[],
): ProjectedSessionNodeInput[] {
  return entries.map((entry, index) => ({
    ...buildThreadSnapshotNode(
      {
        ...persistedSnapshot,
        timestamp: entry.timestamp,
        summary: entry.summary,
        ...(entry.task ? { task: entry.task } : {}),
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

describe('buildTuringContextUsageSnapshot (composer meter)', () => {
  const WINDOW = 262_144

  /** A wrapped runtime prompt of a known size, as a run would have recorded it. */
  function envelope(chars: number) {
    return 'E'.repeat(chars)
  }

  it('reads zero on a thread with no completed runs — nothing is carried yet', () => {
    expect(
      buildTuringContextUsageSnapshot({
        persistedTranscriptNodes: undefined,
        contextWindow: WINDOW,
      }),
    ).toEqual({ tokens: 0, contextWindow: WINDOW, percent: 0, label: 'Next request' })
  })

  it("counts the newest run's wrapped envelope", () => {
    const snapshot = buildTuringContextUsageSnapshot({
      persistedTranscriptNodes: snapshotNodes([
        { timestamp: 1, summary: 'first', userQuery: 'one', task: envelope(400) },
        { timestamp: 2, summary: 'second', userQuery: 'two', task: envelope(4_000) },
      ]),
      contextWindow: WINDOW,
    })
    // Only the NEWEST envelope rides the next request; the older one is gone.
    // The ledger's two rendered steps ride along with it, so the estimate sits
    // above the 1k tokens the envelope alone accounts for.
    expect(snapshot.tokens).toBeGreaterThan(4_000 / 4)
    expect(snapshot.tokens).toBeLessThan(4_400 / 4)
  })

  it('grows as the step ledger fills, because the continuity block grows', () => {
    const steps = (count: number) =>
      snapshotNodes(
        Array.from({ length: count }, (_, i) => ({
          timestamp: i + 1,
          summary: `did step ${String(i)}`,
          userQuery: `asked step ${String(i)}`,
          task: envelope(400),
        })),
      )

    const one = buildTuringContextUsageSnapshot({
      persistedTranscriptNodes: steps(1),
      contextWindow: WINDOW,
    })
    const four = buildTuringContextUsageSnapshot({
      persistedTranscriptNodes: steps(4),
      contextWindow: WINDOW,
    })
    expect(four.tokens).toBeGreaterThan(one.tokens)
    expect(four.percent).toBeGreaterThan(one.percent ?? 0)
  })

  it('plateaus at the ledger cap — a longer thread does not keep growing', () => {
    const steps = (count: number) =>
      snapshotNodes(
        Array.from({ length: count }, (_, i) => ({
          timestamp: i + 1,
          summary: `did step ${String(i)}`,
          userQuery: `asked step ${String(i)}`,
          task: envelope(400),
        })),
      )

    const atCap = buildTuringContextUsageSnapshot({
      persistedTranscriptNodes: steps(LEDGER_MAX_STEPS),
      contextWindow: WINDOW,
    })
    const wellPast = buildTuringContextUsageSnapshot({
      persistedTranscriptNodes: steps(LEDGER_MAX_STEPS + 6),
      contextWindow: WINDOW,
    })
    // This is the whole point of the harness: context is bounded, so the meter
    // must stop climbing rather than imply an ever-fuller window. Not byte-
    // identical — the ledger renders step ORDINALS, so 9..14 costs a few more
    // characters than 1..8 — but flat to within a rounding error, against the
    // ~75% a 14-step thread would have added if the ledger were unbounded.
    expect(wellPast.tokens).toBeGreaterThanOrEqual(atCap.tokens)
    expect(wellPast.tokens).toBeLessThan(atCap.tokens * 1.02)
  })

  it('carries no continuity when the newest run paused on a question', () => {
    const nodes = snapshotNodes([
      { timestamp: 1, summary: 'first', userQuery: 'one', task: envelope(400) },
      { timestamp: 2, summary: 'second', userQuery: 'two', task: envelope(400) },
    ])
    const pausedNodes = snapshotNodes([
      { timestamp: 1, summary: 'first', userQuery: 'one', task: envelope(400) },
    ]).concat({
      ...buildThreadSnapshotNode(
        {
          ...persistedSnapshot,
          timestamp: 2,
          task: envelope(400),
          summary: 'asked the user something',
          disposition: 'pending_user_question',
          recommendedFollowUpMode: 'fresh',
        },
        2,
      ),
      createdOrder: 2,
    })

    const paused = buildTuringContextUsageSnapshot({
      persistedTranscriptNodes: pausedNodes,
      contextWindow: WINDOW,
    })
    const continuing = buildTuringContextUsageSnapshot({
      persistedTranscriptNodes: nodes,
      contextWindow: WINDOW,
    })
    // Same envelope on both; the paused thread injects no ledger, so it must
    // read strictly smaller — the gate in `buildLedgerFollowUpContext`.
    expect(paused.tokens).toBeLessThan(continuing.tokens)
    expect(paused.tokens).toBe(Math.round(400 / 4))
  })

  it('caps the percent at 100 and never reports a negative window', () => {
    const huge = buildTuringContextUsageSnapshot({
      persistedTranscriptNodes: snapshotNodes([
        { timestamp: 1, summary: 'big', userQuery: 'big', task: envelope(WINDOW * 8) },
      ]),
      contextWindow: WINDOW,
    })
    expect(huge.percent).toBe(100)

    const noWindow = buildTuringContextUsageSnapshot({
      persistedTranscriptNodes: undefined,
      contextWindow: 0,
    })
    expect(noWindow.percent).toBeNull()
  })
})
