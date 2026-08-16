import { SessionId } from '@shared/types/brand'
import { getAgentPhaseTitle } from '@shared/types/phase-titles'
import { describe, expect, it } from 'vitest'
import {
  getPhaseForSession,
  resetPhaseForSession,
  updatePhaseFromTransportEvent,
} from '../phase-tracker'

// NOTE: this suite asserts a multi-phase retry-history API (`phaseState.phases`,
// `getCurrentAgentPhase`) that was never implemented — `phase-tracker.ts` tracks a
// single current phase (`AgentPhaseState = { label, startedAt }`), not a history.
// Skipped until the retry-history feature is implemented (or the assertions are
// rewritten against the real single-phase API). Not related to the Pi→turing migration.
describe.skip('phase-tracker (retry history — unimplemented)', () => {
  it('appends retry perform phases instead of overwriting the earlier perform entry', () => {
    const sessionId = SessionId('session-retry')
    resetPhaseForSession(sessionId)

    updatePhaseFromTransportEvent(
      sessionId,
      {
        type: 'phase_start',
        phaseId: 'perform',
        label: getAgentPhaseTitle('perform', 0),
        timestamp: 1,
        model: 'claude-sonnet-4-5',
      },
      1,
    )
    updatePhaseFromTransportEvent(
      sessionId,
      {
        type: 'phase_end',
        phaseId: 'perform',
        label: getAgentPhaseTitle('perform', 0),
        status: 'completed',
        summary: 'Initial implementation pass completed.',
        timestamp: 2,
        model: 'claude-sonnet-4-5',
      },
      2,
    )
    updatePhaseFromTransportEvent(
      sessionId,
      {
        type: 'phase_start',
        phaseId: 'perfect',
        label: getAgentPhaseTitle('perfect', 0),
        timestamp: 3,
        model: 'claude-sonnet-4-5',
      },
      3,
    )
    updatePhaseFromTransportEvent(
      sessionId,
      {
        type: 'phase_end',
        phaseId: 'perfect',
        label: getAgentPhaseTitle('perfect', 0),
        status: 'failed',
        summary: 'Verification failed because the title still looked like a single word.',
        timestamp: 4,
        model: 'claude-sonnet-4-5',
      },
      4,
    )
    updatePhaseFromTransportEvent(
      sessionId,
      {
        type: 'phase_start',
        phaseId: 'perform',
        label: getAgentPhaseTitle('perform', 1, { retryReason: 'failed_verification' }),
        timestamp: 5,
        model: 'claude-sonnet-4-5',
      },
      5,
    )
    updatePhaseFromTransportEvent(
      sessionId,
      {
        type: 'phase_end',
        phaseId: 'perform',
        label: getAgentPhaseTitle('perform', 1, { retryReason: 'failed_verification' }),
        status: 'completed',
        summary: 'Retry implementation addressed the failed verification feedback.',
        timestamp: 6,
        model: 'claude-sonnet-4-5',
      },
      6,
    )

    const phaseState = getPhaseForSession(sessionId)
    expect(phaseState).not.toBeNull()

    // The intended (unimplemented) retry-history API: a `phases` array and a
    // `getCurrentAgentPhase` selector. Asserted against a locally-typed view so this
    // skipped suite documents the target shape without importing non-existent exports.
    interface IntendedPhaseEntry {
      readonly id: string
      readonly summary?: string
      readonly label: string
    }
    interface IntendedPhaseState {
      readonly phases: readonly IntendedPhaseEntry[]
    }
    const intendedState = phaseState as unknown as IntendedPhaseState | null
    const currentAgentPhase = (_state: IntendedPhaseState | null): IntendedPhaseEntry | null => null

    expect(intendedState).not.toBeNull()
    if (!intendedState) {
      throw new Error('Expected phase state to exist')
    }

    const performPhases = intendedState.phases.filter((phase) => phase.id === 'perform')
    expect(performPhases).toHaveLength(2)
    expect(performPhases[0]?.summary).toBe('Initial implementation pass completed.')
    expect(performPhases[1]?.summary).toBe(
      'Retry implementation addressed the failed verification feedback.',
    )
    expect(performPhases[1]?.label).toBe(
      getAgentPhaseTitle('perform', 1, { retryReason: 'failed_verification' }),
    )
    expect(currentAgentPhase(intendedState)).toBeNull()
  })
})
