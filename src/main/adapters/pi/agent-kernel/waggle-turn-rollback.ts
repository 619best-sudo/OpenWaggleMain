import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

interface FileSnapshot {
  readonly absolutePath: string
  readonly relativePath: string
  readonly existed: boolean
  readonly content: string
}

function normalizeProjectFilePath(projectPath: string, rawPath: string) {
  if (!rawPath.trim()) {
    return null
  }

  const absolutePath = path.isAbsolute(rawPath) ? path.normalize(rawPath) : path.resolve(projectPath, rawPath)
  const relativePath = path.relative(projectPath, absolutePath)
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null
  }

  return {
    absolutePath,
    relativePath: relativePath.length > 0 ? relativePath : path.basename(absolutePath),
  }
}

function readSnapshotSync(absolutePath: string): { readonly existed: boolean; readonly content: string } {
  try {
    return {
      existed: true,
      content: fsSync.readFileSync(absolutePath, 'utf8'),
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { existed: false, content: '' }
    }
    throw error
  }
}

export function createWaggleTurnRollbackTracker(projectPath: string) {
  let currentTurnSnapshots = new Map<string, FileSnapshot>()
  let currentTurnEditedPaths = new Set<string>()
  let pendingRollbackSnapshots = new Map<string, FileSnapshot>()

  return {
    resetCurrentTurn() {
      currentTurnSnapshots = new Map()
      currentTurnEditedPaths = new Set()
    },

    capturePreEditSnapshot(rawPath: string) {
      const resolved = normalizeProjectFilePath(projectPath, rawPath)
      if (!resolved || currentTurnSnapshots.has(resolved.absolutePath)) {
        return
      }

      const snapshot = readSnapshotSync(resolved.absolutePath)
      currentTurnSnapshots.set(resolved.absolutePath, {
        absolutePath: resolved.absolutePath,
        relativePath: resolved.relativePath,
        existed: snapshot.existed,
        content: snapshot.content,
      })
    },

    recordSuccessfulEdit(rawPath: string) {
      const resolved = normalizeProjectFilePath(projectPath, rawPath)
      if (!resolved) {
        return
      }
      currentTurnEditedPaths.add(resolved.absolutePath)
    },

    promoteCurrentTurnEdits() {
      if (currentTurnEditedPaths.size === 0) {
        return
      }

      pendingRollbackSnapshots = new Map(
        [...currentTurnEditedPaths]
          .map((absolutePath) => currentTurnSnapshots.get(absolutePath))
          .filter((snapshot): snapshot is FileSnapshot => snapshot !== undefined)
          .map((snapshot) => [snapshot.absolutePath, snapshot] as const),
      )
    },

    clearPendingRollback() {
      pendingRollbackSnapshots = new Map()
    },

    hasPendingRollback() {
      return pendingRollbackSnapshots.size > 0
    },

    async rollbackPendingFix() {
      const restoredPaths: string[] = []

      for (const snapshot of pendingRollbackSnapshots.values()) {
        if (snapshot.existed) {
          await fs.mkdir(path.dirname(snapshot.absolutePath), { recursive: true })
          await fs.writeFile(snapshot.absolutePath, snapshot.content, 'utf8')
        } else {
          await fs.rm(snapshot.absolutePath, { force: true })
        }
        restoredPaths.push(snapshot.relativePath)
      }

      pendingRollbackSnapshots = new Map()
      return restoredPaths
    },
  }
}
