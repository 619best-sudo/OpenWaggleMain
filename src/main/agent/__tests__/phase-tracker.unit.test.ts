import { describe, expect, it } from 'vitest'
import { SessionId } from '@shared/types/brand'
import { getCurrentAgentPhase } from '@shared/types/phase'
import { getAgentPhaseTitle } from '@shared/types/phase-titles'
import {
  getPhaseForSession,
  resetPhaseForSession,
  updatePhaseFromTransportEvent,
} from '../phase-tracker'

describe('phase-tracker', () => {
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
    if (!phaseState) {
      throw new Error('Expected phase state to exist')
    }

    const performPhases = phaseState.phases.filter((phase) => phase.id === 'perform')
    expect(performPhases).toHaveLength(2)
    expect(performPhases[0]?.summary).toBe('Initial implementation pass completed.')
    expect(performPhases[1]?.summary).toBe(
      'Retry implementation addressed the failed verification feedback.',
    )
    expect(performPhases[1]?.label).toBe(
      getAgentPhaseTitle('perform', 1, { retryReason: 'failed_verification' }),
    )
    expect(getCurrentAgentPhase(phaseState)).toBeNull()
  })
})
