import type { RunStop } from 'turing-harness'
import { describe, expect, it } from 'vitest'
import type { ProjectedSessionNodeInput } from '../../../ports/session-repository'
import {
  buildResumeClearedNode,
  buildResumeRecord,
  buildResumeTokenNode,
  extractPersistedResumeRecord,
  isResumeToken,
} from '../turing-resume-token'

function token(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    task: 'Add a Clear all action',
    cwd: '/tmp/app',
    stoppedBecause: 'aborted',
    stoppedAt: 1_720_000_000_000,
    plan: [
      { category: 'write_edit', task: 'make the change' },
      { category: 'activity_inspect', task: 'verify it' },
    ],
    nextIndex: 1,
    hops: [],
    writtenPaths: ['/tmp/app/a.dart'],
    clarifyAsked: false,
    ...overrides,
  }
}

const abortedStop: RunStop = {
  kind: 'aborted',
  reason: 'the run was stopped during "activity_inspect" (step 2 of 2)',
  resumable: true,
  token: token() as never,
}

function asNodes(nodes: readonly ProjectedSessionNodeInput[]) {
  return nodes
}

describe('buildResumeRecord', () => {
  it('carries the harness reason verbatim — it is what the user is shown', () => {
    const record = buildResumeRecord(abortedStop)
    expect(record?.state.reason).toBe(abortedStop.reason)
    expect(record?.state.kind).toBe('aborted')
    expect(record?.state.remainingSteps).toBe(1)
    expect(record?.state.needsAnswer).toBe(false)
  })

  it('produces nothing for a completed run — presence IS the signal', () => {
    expect(
      buildResumeRecord({ kind: 'completed', reason: 'the plan ran to its end', resumable: false }),
    ).toBeUndefined()
  })

  it('produces nothing when the harness says a stop is not resumable', () => {
    expect(
      buildResumeRecord({ kind: 'no-plan', reason: 'nothing to run', resumable: false }),
    ).toBeUndefined()
  })

  it('flags a question stop as needing an answer, and carries the question', () => {
    const record = buildResumeRecord({
      kind: 'question',
      reason: 'waiting on the user',
      resumable: true,
      token: token({
        nextIndex: 0,
        plan: [],
        pendingUserQuestion: {
          question: "It currently reads 'Delete account?'. What should it say?",
        },
      }) as never,
    })
    expect(record?.state.needsAnswer).toBe(true)
    expect(record?.state.question).toMatch(/What should it say\?/)
    expect(record?.state.remainingSteps).toBe(0)
  })
})

describe('extractPersistedResumeRecord', () => {
  it('reads back the newest token', () => {
    const record = buildResumeRecord(abortedStop)!
    const nodes = asNodes([buildResumeTokenNode(record, 1_000)])
    const found = extractPersistedResumeRecord(nodes)
    expect(found?.state.kind).toBe('aborted')
    expect(isResumeToken(found?.token)).toBe(true)
  })

  it('a NEWER tombstone settles an older token', () => {
    // The case this exists for: a run stopped, was continued, and finished. The
    // old token is still in the tree — offering it would re-run a finished plan.
    const record = buildResumeRecord(abortedStop)!
    const nodes = asNodes([buildResumeTokenNode(record, 1_000), buildResumeClearedNode(2_000)])
    expect(extractPersistedResumeRecord(nodes)).toBeUndefined()
  })

  it('a token NEWER than a tombstone is offered — the run stopped again', () => {
    const record = buildResumeRecord(abortedStop)!
    const nodes = asNodes([buildResumeClearedNode(1_000), buildResumeTokenNode(record, 2_000)])
    expect(extractPersistedResumeRecord(nodes)?.state.kind).toBe('aborted')
  })

  it('ignores unrelated nodes and survives unparseable content', () => {
    const record = buildResumeRecord(abortedStop)!
    const junk: ProjectedSessionNodeInput = {
      ...buildResumeTokenNode(record, 500),
      contentJson: '{not json',
    }
    expect(extractPersistedResumeRecord([junk])).toBeUndefined()
    expect(extractPersistedResumeRecord([])).toBeUndefined()
    expect(extractPersistedResumeRecord(undefined)).toBeUndefined()
  })
})

describe('isResumeToken', () => {
  it('rejects a corrupt blob rather than passing it to the harness as a token', () => {
    expect(isResumeToken(token())).toBe(true)
    expect(isResumeToken({ task: 'x' })).toBe(false)
    expect(isResumeToken(null)).toBe(false)
    expect(isResumeToken('{}')).toBe(false)
  })
})
