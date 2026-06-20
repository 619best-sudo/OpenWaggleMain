import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createWaggleTurnRollbackTracker } from '../waggle-turn-rollback'

describe('createWaggleTurnRollbackTracker', () => {
  let tempRoot = ''

  afterEach(async () => {
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true })
      tempRoot = ''
    }
  })

  it('restores a modified file back to its pre-edit contents', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ow-waggle-rollback-'))
    const filePath = path.join(tempRoot, 'src', 'feature.ts')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, 'before fix\n', 'utf8')

    const tracker = createWaggleTurnRollbackTracker(tempRoot)
    tracker.resetCurrentTurn()
    tracker.capturePreEditSnapshot('src/feature.ts')
    await fs.writeFile(filePath, 'failed fix\n', 'utf8')
    tracker.recordSuccessfulEdit('src/feature.ts')
    tracker.promoteCurrentTurnEdits()

    const restoredPaths = await tracker.rollbackPendingFix()

    await expect(fs.readFile(filePath, 'utf8')).resolves.toBe('before fix\n')
    expect(restoredPaths).toEqual(['src/feature.ts'])
  })

  it('removes a newly created file when rollback is required', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ow-waggle-rollback-'))
    const filePath = path.join(tempRoot, 'src', 'new-file.ts')

    const tracker = createWaggleTurnRollbackTracker(tempRoot)
    tracker.resetCurrentTurn()
    tracker.capturePreEditSnapshot('src/new-file.ts')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, 'temporary file\n', 'utf8')
    tracker.recordSuccessfulEdit('src/new-file.ts')
    tracker.promoteCurrentTurnEdits()

    await tracker.rollbackPendingFix()

    await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
