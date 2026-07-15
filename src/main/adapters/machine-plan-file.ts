/**
 * Pure filesystem helpers for the machine-plan file mirror. No Electron/logger
 * imports so they can be unit-tested against a temp directory. Writes are
 * best-effort: helpers catch their own errors and report success as a boolean so
 * a file problem can never fail a machine run.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SessionId } from '@shared/types/brand'
import type { MachineExecutionState } from '@shared/types/machine'

const JSON_INDENT = 2

export interface MachinePlanFileError {
  readonly message: string
}

/** File name for a session's plan, sanitized to a safe basename. */
export function machinePlanFileName(sessionId: SessionId) {
  const safeId = String(sessionId).replace(/[^a-zA-Z0-9._-]/g, '_')
  return `${safeId}.json`
}

export function machinePlanFilePath(baseDir: string, sessionId: SessionId) {
  return join(baseDir, machinePlanFileName(sessionId))
}

export async function writeMachinePlanFile(
  baseDir: string,
  sessionId: SessionId,
  state: MachineExecutionState,
): Promise<MachinePlanFileError | null> {
  try {
    await mkdir(baseDir, { recursive: true })
    await writeFile(
      machinePlanFilePath(baseDir, sessionId),
      JSON.stringify(state, null, JSON_INDENT),
      'utf8',
    )
    return null
  } catch (error) {
    return { message: error instanceof Error ? error.message : String(error) }
  }
}

export async function removeMachinePlanFile(
  baseDir: string,
  sessionId: SessionId,
): Promise<MachinePlanFileError | null> {
  try {
    await rm(machinePlanFilePath(baseDir, sessionId), { force: true })
    return null
  } catch (error) {
    return { message: error instanceof Error ? error.message : String(error) }
  }
}
