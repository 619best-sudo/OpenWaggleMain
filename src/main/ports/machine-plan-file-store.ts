/**
 * MachinePlanFileStore port — persists a machine-mode plan (with per-task
 * `isCompleted` flags) to an on-disk JSON file that mirrors the live execution
 * state. The file is updated as tasks complete and removed once the whole run
 * finishes (or the plan is discarded).
 *
 * The card/timeline still reads the in-app branch state — this file is a
 * projection, not a second source of truth. Writes are best-effort: a file error
 * must never fail a machine run, so the effects do not surface errors.
 */
import type { SessionId } from '@shared/types/brand'
import type { MachineExecutionState } from '@shared/types/machine'
import { Context, type Effect } from 'effect'

export interface MachinePlanFileStoreShape {
  readonly write: (sessionId: SessionId, state: MachineExecutionState) => Effect.Effect<void>
  readonly remove: (sessionId: SessionId) => Effect.Effect<void>
}

export class MachinePlanFileStore extends Context.Tag('@openwaggle/MachinePlanFileStore')<
  MachinePlanFileStore,
  MachinePlanFileStoreShape
>() {}
