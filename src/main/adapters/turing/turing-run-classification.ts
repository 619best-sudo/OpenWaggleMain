import type { AgentPhaseStatus } from '@shared/types/phase'
import type { AgentTransportAgentEndEvent } from '@shared/types/stream'
import type { HarnessAgentState, RunStep } from 'turing-harness'

type TerminalPhaseStatus = Exclude<AgentPhaseStatus, 'running'>
type AgentEndReason = AgentTransportAgentEndEvent['reason']

/**
 * State the flat-loop failure classifiers need. The 4P `lastPhaseResults` walk is
 * gone — the flat loop driver leaves it undefined. Classification now keys on the
 * run's {@link HarnessAgentState.lastThreadSnapshot} (disposition/verified/error,
 * still populated by `run()`), {@link HarnessAgentState.lastSteps} (per-step
 * errors), and {@link HarnessAgentState.pendingUserQuestion}.
 */
type FlatRunClassificationState = Pick<
  HarnessAgentState,
  'lastSteps' | 'lastThreadSnapshot' | 'pendingUserQuestion'
>

/**
 * Map a flat run's terminal disposition to a phase-card status. Used by the
 * event mapper (for the synthetic 'working' phase) and the persisted transcript
 * node builder.
 */
export function runDispositionToStatus(input: {
  pendingUserQuestion?: unknown
  error?: string
  disposition?: string
  success?: boolean
}): TerminalPhaseStatus {
  if (input.pendingUserQuestion) {
    return 'interrupted'
  }
  if (input.error) {
    return 'failed'
  }
  // A failed disposition with no hard error is a graceful failure (e.g. an
  // unverified run); still render as failed so the card reflects the outcome.
  if (input.disposition === 'failed' || input.success === false) {
    return 'failed'
  }
  return 'completed'
}

/**
 * Back-compat alias. The 4P version took a `PhaseResult`-shaped input; callers
 * that previously passed `{ pendingUserQuestion, error, verified }` now pass a
 * flat-run disposition shape. Kept under the old name so the event mapper and
 * transcript builder import sites stay stable.
 */
export function phaseResultToStatus(input: {
  pendingUserQuestion?: unknown
  error?: string
  verified?: boolean
  disposition?: string
  success?: boolean
}): TerminalPhaseStatus {
  if (input.pendingUserQuestion) {
    return 'interrupted'
  }
  if (input.error) {
    return 'failed'
  }
  if (input.verified === false) {
    return 'failed'
  }
  if (input.disposition === 'failed' || input.success === false) {
    return 'failed'
  }
  return 'completed'
}

/**
 * A "graceful verification failure": the run ended without a hard error but the
 * work did not verify (e.g. the model reported it could not complete the task).
 * Surfaced as a normal stop rather than a crash so the user sees the model's own
 * summary instead of an error toast.
 */
export function isGracefulVerificationFailure(state: FlatRunClassificationState): boolean {
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
  // A failed step without a hard run error is also a graceful per-step failure.
  const failedStep = state.lastSteps?.find((step) => step.error)
  if (failedStep && !snapshot?.error) {
    return true
  }
  return false
}

/**
 * A "graceful phase failure": the run hit a hard error mid-work but had already
 * produced concrete contextual output (files written, files read, completed
 * steps). Treat it as a soft stop so the partial work + the model's explanation
 * are shown, rather than masking them behind a crash toast.
 *
 * A bare error with no work output (e.g. an immediate model-request failure) is
 * NOT graceful — it's a real crash the user should see as an error.
 */
export function isGracefulPhaseFailure(state: FlatRunClassificationState): boolean {
  if (isGracefulVerificationFailure(state) || state.pendingUserQuestion) {
    return false
  }

  const snapshot = state.lastThreadSnapshot
  if (!snapshot) {
    return false
  }
  // Requires a hard error (a non-error failed disposition is a graceful verify
  // failure, handled above). No error + no failure ⇒ success ⇒ not this path.
  if (!snapshot.error) {
    return false
  }

  // Concrete work artifacts — NOT a bare summary string, since even an
  // immediate crash produces a generic "Run failed before completion" summary.
  const hasWorkOutput = Boolean(
    snapshot.writtenPaths?.length ||
      snapshot.readPaths?.length ||
      snapshot.discoveredPaths?.length ||
      state.lastSteps?.some((step) => step.isCompleted),
  )
  return hasWorkOutput
}

export function resolveTerminalError(input: {
  readonly terminalError?: string
  readonly agentState: FlatRunClassificationState
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
  readonly agentState: FlatRunClassificationState
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

/** Exported for tests that build step state directly. */
export type { RunStep }
