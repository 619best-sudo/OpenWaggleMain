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
    Pick<HarnessAgentState, 'lastPhaseResults' | 'lastThreadSnapshot' | 'pendingUserQuestion'>
  > = {},
): Pick<HarnessAgentState, 'lastPhaseResults' | 'lastThreadSnapshot' | 'pendingUserQuestion'> {
  return {
    lastPhaseResults: undefined,
    lastThreadSnapshot: undefined,
    pendingUserQuestion: undefined,
    ...overrides,
  }
}

describe('turing-run-classification', () => {
  it('marks explicit verification failures as failed phases', () => {
    expect(
      phaseResultToStatus({
        pendingUserQuestion: undefined,
        error: undefined,
        verified: false,
      } as never),
    ).toBe('failed')
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

  it('preserves real terminal errors even when the perfect phase exists', () => {
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

  it('suppresses terminal crash state for failed phases that already have contextual output', () => {
    const state = agentState({
      lastPhaseResults: {
        perform: {
          phase: 'perform',
          summary:
            'Implementation failed before completion.\nFiles changed before failure: /tmp/index.html\nError: browser screenshot failed',
          display: {
            summary:
              'Implementation failed before completion.\nFiles changed before failure: /tmp/index.html\nError: browser screenshot failed',
            toolCallIds: ['tool-1'],
          },
          error: 'browser screenshot failed',
          writtenPaths: ['/tmp/index.html'],
          complexity: 0,
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          messages: [],
        } as never,
      } as never,
      lastThreadSnapshot: {
        timestamp: Date.now(),
        task: 'fix the title',
        route: 'task',
        disposition: 'failed',
        recommendedFollowUpMode: 'structured_continue',
        summary:
          'Implementation failed before completion.\nFiles changed before failure: /tmp/index.html\nError: browser screenshot failed',
        error: 'browser screenshot failed',
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
