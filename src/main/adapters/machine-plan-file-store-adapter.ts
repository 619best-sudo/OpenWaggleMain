/**
 * Filesystem adapter for {@link MachinePlanFileStore}.
 *
 * Writes/removes a per-session JSON file mirroring the machine plan under
 * `<userData>/machine-plans/`. All file work is delegated to the pure helpers in
 * `machine-plan-file.ts`; this layer only resolves the base directory and logs
 * best-effort failures.
 */
import { join } from 'node:path'
import type { SessionId } from '@shared/types/brand'
import { Effect, Layer } from 'effect'
import { app } from 'electron'
import { createLogger } from '../logger'
import { MachinePlanFileStore } from '../ports/machine-plan-file-store'
import {
  type MachinePlanFileError,
  removeMachinePlanFile,
  writeMachinePlanFile,
} from './machine-plan-file'

const MACHINE_PLANS_DIRECTORY_NAME = 'machine-plans'
const logger = createLogger('machine-plan-file-store')

function resolveBaseDir() {
  return join(app.getPath('userData'), MACHINE_PLANS_DIRECTORY_NAME)
}

function logFailure(action: string, sessionId: SessionId, error: MachinePlanFileError | null) {
  if (error) {
    logger.warn(`Failed to ${action} machine plan file`, {
      sessionId: String(sessionId),
      error: error.message,
    })
  }
}

export const MachinePlanFileStoreLive = Layer.succeed(
  MachinePlanFileStore,
  MachinePlanFileStore.of({
    write: (sessionId, state) =>
      Effect.promise(() => writeMachinePlanFile(resolveBaseDir(), sessionId, state)).pipe(
        Effect.map((error) => logFailure('write', sessionId, error)),
      ),
    remove: (sessionId) =>
      Effect.promise(() => removeMachinePlanFile(resolveBaseDir(), sessionId)).pipe(
        Effect.map((error) => logFailure('remove', sessionId, error)),
      ),
  }),
)
