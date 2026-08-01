import { describe, expect, it } from 'vitest'
import type { HarnessAgentState } from 'turing-harness'
import {
  isGracefulPhaseFailure,
  isGracefulVerificationFailure,
  phaseResultToStatus,
  resolveAgentEndReason,
  resolveTerminalError,
} from '../turing-run-classification'

function agentState(
  overrides: Partial<
    Pick<HarnessAgentState, 'lastSteps' | 'lastThreadSnapshot' | 'pendingUserQuestion'>
  > = {},
): Pick<HarnessAgentState, 'lastSteps' | 'lastThreadSnapshot' | 'pendingUserQuestion'> {
  return {
    lastSteps: undefined,
    lastThreadSnapshot: undefined,
    pendingUserQuestion: undefined,
    ...overrides,
  }
}

describe('turing-run-classification', () => {
  it('marks explicit verification failures as failed', () => {
    expect(phaseResultToStatus({ verified: false })).toBe('failed')
  })

  it('maps a pending user question to interrupted', () => {
    expect(
      phaseResultToStatus({ pendingUserQuestion: { phase: 'plan', question: 'which file?' } }),
    ).toBe('interrupted')
  })

  it('recognizes retry-exhausted verification failures as graceful run failures', () => {
    const state = agentState({
      lastThreadSnapshot: {
        timestamp: Date.now(),
        task: 'fix the title',
        route: 'task',
        disposition: 'failed',
        recommendedFollowUpMode: 'structured_continue',
        summary: 'VERDICT: FAIL\nThe title still does not match.',
        verified: false,
      },
    })

    expect(isGracefulVerificationFailure(state)).toBe(true)
    expect(resolveTerminalError({ terminalError: 'VERDICT: FAIL', agentState: state })).toBeUndefined()
    expect(
      resolveAgentEndReason({
        aborted: false,
        stopReason: 'error',
        terminalError: undefined,
        agentState: state,
      }),
    ).toBe('stop')
  })

  it('preserves real terminal errors even when a failed snapshot exists', () => {
    const state = agentState({
      lastThreadSnapshot: {
        timestamp: Date.now(),
        task: 'fix the title',
        route: 'task',
        disposition: 'failed',
        recommendedFollowUpMode: 'structured_continue',
        summary: 'Run failed before completion.',
        verified: false,
        error: 'Model request failed',
      },
    })

    expect(isGracefulVerificationFailure(state)).toBe(false)
    expect(resolveTerminalError({ terminalError: 'Model request failed', agentState: state })).toBe(
      'Model request failed',
    )
    expect(
      resolveAgentEndReason({
        aborted: false,
        stopReason: 'stop',
        terminalError: 'Model request failed',
        agentState: state,
      }),
    ).toBe('error')
  })

  it('suppresses terminal crash state for a failed run that already produced contextual output', () => {
    // Under the flat loop, a mid-run crash that already wrote files + produced a
    // summary is a graceful phase failure: show the partial work, not a crash.
    const state = agentState({
      lastSteps: [
        {
          planId: 'p1',
          taskId: 't1',
          title: 'edit index',
          summary: 'editing the file',
          complexity: 'low',
          isCompleted: true,
          files: ['/tmp/index.html'],
        },
      ],
      lastThreadSnapshot: {
        timestamp: Date.now(),
        task: 'fix the title',
        route: 'task',
        disposition: 'failed',
        recommendedFollowUpMode: 'structured_continue',
        summary:
          'Implementation failed before completion.\nFiles changed before failure: /tmp/index.html\nError: browser screenshot failed',
        error: 'browser screenshot failed',
        writtenPaths: ['/tmp/index.html'],
      },
    })

    expect(isGracefulPhaseFailure(state)).toBe(true)
    expect(resolveTerminalError({ terminalError: 'browser screenshot failed', agentState: state })).toBeUndefined()
    expect(
      resolveAgentEndReason({
        aborted: false,
        stopReason: 'error',
        terminalError: undefined,
        agentState: state,
      }),
    ).toBe('stop')
  })
})
