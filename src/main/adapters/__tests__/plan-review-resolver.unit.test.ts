import type { SessionId } from '@shared/types/brand'
import type { PendingPlanReviewRequest } from '@shared/types/plan-review'
import { describe, expect, it } from 'vitest'
import {
  beginPlanReviewRequest,
  getPendingPlanReview,
  resolvePendingPlanReview,
} from '../../ipc/active-agent-runs'

const SESSION = 'session-plan-1' as SessionId

function request(over: Partial<PendingPlanReviewRequest> = {}): PendingPlanReviewRequest {
  return {
    planReviewId: 'review-1',
    revision: 1,
    task: 'add a header',
    revisionsRemaining: 3,
    planSet: {
      plans: [
        {
          id: 'plan-1',
          title: 'Ship it',
          summary: '',
          tasks: [
            {
              id: 't1',
              order: 1,
              title: 'Add the header',
              summary: '',
              files: ['src/Header.tsx'],
              fileMutations: { 'src/Header.tsx': 'write' },
              complexity: 'medium',
            },
          ],
        },
      ],
      executionOrder: ['plan-1'],
    },
    ...over,
  }
}

describe('plan review resolver', () => {
  it('parks the draft and resolves it with the user verdict', async () => {
    const pending = beginPlanReviewRequest(SESSION, request())
    expect(getPendingPlanReview(SESSION)?.planReviewId).toBe('review-1')

    const applied = resolvePendingPlanReview(SESSION, {
      planReviewId: 'review-1',
      decision: 'approved',
      stepEdits: [{ taskId: 't1', notes: 'use brand blue' }],
    })

    expect(applied).toBe(true)
    const resolution = await pending
    expect(resolution.decision).toBe('approved')
    expect(resolution.stepEdits?.[0]?.notes).toBe('use brand blue')
    // Resolving clears it, so a later verdict can't double-resolve.
    expect(getPendingPlanReview(SESSION)).toBeNull()
  })

  it('ignores a verdict whose id does not match the draft on screen', async () => {
    const pending = beginPlanReviewRequest(SESSION, request())

    // A stale verdict from a superseded draft must not approve the current one.
    expect(
      resolvePendingPlanReview(SESSION, { planReviewId: 'review-OLD', decision: 'approved' }),
    ).toBe(false)
    expect(getPendingPlanReview(SESSION)?.planReviewId).toBe('review-1')

    resolvePendingPlanReview(SESSION, { planReviewId: 'review-1', decision: 'cancelled' })
    expect((await pending).decision).toBe('cancelled')
  })

  it('rejects the prior draft when a newer one replaces it', async () => {
    const first = beginPlanReviewRequest(SESSION, request())
    const firstSettled = expect(first).rejects.toThrow(/replaced by a newer draft/)

    const second = beginPlanReviewRequest(
      SESSION,
      request({ planReviewId: 'review-2', revision: 2 }),
    )
    await firstSettled

    expect(getPendingPlanReview(SESSION)?.planReviewId).toBe('review-2')
    resolvePendingPlanReview(SESSION, { planReviewId: 'review-2', decision: 'approved' })
    expect((await second).decision).toBe('approved')
  })

  it('rejects on abort rather than resolving as approved', async () => {
    // A cancelled run must never look like an approval — that would start
    // executing a plan the user never accepted.
    const controller = new AbortController()
    const pending = beginPlanReviewRequest(SESSION, request(), controller.signal)
    const settled = expect(pending).rejects.toThrow(/aborted/)
    controller.abort()
    await settled
    expect(getPendingPlanReview(SESSION)).toBeNull()
  })

  it('reports false when nothing is pending', () => {
    expect(resolvePendingPlanReview(SESSION, { planReviewId: 'x', decision: 'approved' })).toBe(
      false,
    )
  })
})
