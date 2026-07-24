import type { AgentPhaseStatus } from '@shared/types/phase'
import type { AgentTransportAgentEndEvent } from '@shared/types/stream'
import type { HarnessAgentState, PhaseResult } from 'turing-harness'

type TerminalPhaseStatus = Exclude<AgentPhaseStatus, 'running'>
type AgentEndReason = AgentTransportAgentEndEvent['reason']
type PhaseResultStatusInput = Pick<PhaseResult, 'pendingUserQuestion' | 'error' | 'verified'>
type GracefulVerificationFailureState = Pick<
  HarnessAgentState,
  'lastPhaseResults' | 'lastThreadSnapshot' | 'pendingUserQuestion'
>

export function phaseResultToStatus(result: PhaseResultStatusInput): TerminalPhaseStatus {
  if (result.pendingUserQuestion) {
    return 'interrupted'
  }
  if (result.error || result.verified === false) {
    return 'failed'
  }
  return 'completed'
}

export function isGracefulVerificationFailure(
  state: GracefulVerificationFailureState,
): boolean {
  if (state.pendingUserQuestion) {
    return false
  }

  const snapshot = state.lastThreadSnapshot
  if (
    snapshot?.disposition === 'failed' &&
    snapshot.verified === false &&
    !snapshot.error
  ) {
    return true
  }

  const perfect = state.lastPhaseResults?.perfect
  return perfect?.verified === false && !perfect.error
}

function latestFailedPhaseResult(
  state: GracefulVerificationFailureState,
): PhaseResult | undefined {
  const order = [
    state.lastPhaseResults?.perfect,
    state.lastPhaseResults?.perform,
    state.lastPhaseResults?.plan,
    state.lastPhaseResults?.prepare,
  ]
  return order.find((result) => result?.error && result.error !== 'aborted')
}

export function isGracefulPhaseFailure(
  state: GracefulVerificationFailureState,
): boolean {
  if (isGracefulVerificationFailure(state) || state.pendingUserQuestion) {
    return false
  }

  const failed = latestFailedPhaseResult(state)
  if (!failed) {
    return false
  }

  return Boolean(
    failed.display?.summary?.trim() ||
      failed.summary?.trim() ||
      failed.display?.toolCallIds?.length ||
      failed.writtenPaths?.length ||
      failed.readPaths?.length ||
      failed.discoveredPaths?.length,
  )
}

export function resolveTerminalError(input: {
  readonly terminalError?: string
  readonly agentState: GracefulVerificationFailureState
}): string | undefined {
  return isGracefulVerificationFailure(input.agentState) ||
    isGracefulPhaseFailure(input.agentState)
    ? undefined
    : input.terminalError
}

export function resolveAgentEndReason(input: {
  readonly aborted: boolean
  readonly stopReason: AgentEndReason
  readonly terminalError?: string
  readonly agentState: GracefulVerificationFailureState
}): AgentEndReason {
  if (input.aborted) {
    return 'aborted'
  }
  if (input.terminalError) {
    return 'error'
  }
  if (
    isGracefulVerificationFailure(input.agentState) ||
    isGracefulPhaseFailure(input.agentState)
  ) {
    return input.stopReason && input.stopReason !== 'error' ? input.stopReason : 'stop'
  }
  return input.stopReason ?? 'stop'
}
