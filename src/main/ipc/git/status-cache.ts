import type { GitStatusSummary } from '@shared/types/git'

/** `result: null` means "checked recently, and the folder is not a Git repository". */
const statusCache = new Map<string, { result: GitStatusSummary | null; timestamp: number }>()

export function getCachedGitStatus(projectPath: string, ttlMs: number) {
  const cached = statusCache.get(projectPath)
  if (!cached || Date.now() - cached.timestamp >= ttlMs) return undefined
  return cached.result
}

export function setCachedGitStatus(projectPath: string, result: GitStatusSummary | null) {
  statusCache.set(projectPath, { result, timestamp: Date.now() })
}

export function invalidateGitStatusCache(projectPath?: string) {
  if (projectPath) {
    statusCache.delete(projectPath)
    return
  }
  statusCache.clear()
}
