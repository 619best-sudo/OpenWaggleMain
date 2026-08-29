/**
 * The app-side view of a stopped run.
 *
 * The harness reports how every run STOPPED (`RunLoopResult.stop`) and, when it
 * stopped short of its plan, hands back a token that carries it forward. This
 * module is the boundary: the token itself is opaque to the app — it is passed
 * back to the harness verbatim and never inspected — while the KIND and the
 * REASON are shown to the user, so they are typed here.
 */

/** Mirrors the harness's `RunStopKind`. */
export type RunStopKind = 'completed' | 'question' | 'aborted' | 'hop-budget' | 'failed' | 'no-plan'

/**
 * What the renderer needs to offer "continue": whether there is anything to
 * continue, and a sentence saying why the run stopped. Deliberately does NOT
 * carry the token — the renderer never needs it, and shipping a whole run's
 * hop history across the IPC boundary on every session switch would be waste.
 */
export interface SessionResumeState {
  readonly kind: RunStopKind
  /** The harness's own sentence, written to be shown to the user as-is. */
  readonly reason: string
  /** How many plan steps never ran. */
  readonly remainingSteps: number
  /** True when the run stopped waiting on an answer, so continuing needs one. */
  readonly needsAnswer: boolean
  /** The question it stopped on, when it stopped on one. */
  readonly question?: string
  /** When it stopped (ms since epoch). */
  readonly stoppedAt: number
}

/** The persisted node's payload: the user-facing state plus the opaque token. */
export interface PersistedResumeRecord {
  readonly state: SessionResumeState
  /** The harness's `RunStop.token`, stored verbatim. Never inspected here. */
  readonly token: unknown
}
