import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionId, SupportedModelId } from '@shared/types/brand'
import type { MachineExecutionState } from '@shared/types/machine'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  machinePlanFileName,
  machinePlanFilePath,
  removeMachinePlanFile,
  writeMachinePlanFile,
} from '../machine-plan-file'

const SESSION = SessionId('019f66ef-2eda-7290-99f5-f772488d816c')

function planState(overrides: Partial<MachineExecutionState> = {}): MachineExecutionState {
  return {
    goal: 'Build the page',
    phase: 'running',
    tasks: [
      { id: 't1', title: 'First', prompt: 'do first', status: 'completed', isCompleted: true },
      { id: 't2', title: 'Second', prompt: 'do second', status: 'running', isCompleted: false },
    ],
    model: SupportedModelId('openai/gpt-5.5'),
    thinkingLevel: 'medium',
    generatedAt: 1,
    ...overrides,
  }
}

describe('machine-plan-file helpers', () => {
  let baseDir: string

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'machine-plan-'))
  })

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true })
  })

  it('sanitizes the session id into a safe file name', () => {
    expect(machinePlanFileName(SessionId('a/b\\c:d'))).toBe('a_b_c_d.json')
  })

  it('writes the plan JSON (creating the directory) and reads back the tasks', async () => {
    const nested = join(baseDir, 'machine-plans')
    const error = await writeMachinePlanFile(nested, SESSION, planState())
    expect(error).toBeNull()

    const raw = await readFile(machinePlanFilePath(nested, SESSION), 'utf8')
    const parsed = JSON.parse(raw)
    expect(parsed.goal).toBe('Build the page')
    expect(parsed.tasks.map((task: { isCompleted: boolean }) => task.isCompleted)).toEqual([
      true,
      false,
    ])
  })

  it('removes the plan file and treats a missing file as success', async () => {
    await writeMachinePlanFile(baseDir, SESSION, planState())
    expect(await removeMachinePlanFile(baseDir, SESSION)).toBeNull()
    await expect(stat(machinePlanFilePath(baseDir, SESSION))).rejects.toThrow()

    // Removing again (already gone) still succeeds.
    expect(await removeMachinePlanFile(baseDir, SESSION)).toBeNull()
  })
})
