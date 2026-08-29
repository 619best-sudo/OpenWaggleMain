import { decodeUnknownOrThrow } from '@shared/schema'
import type { GitWorktreeFailure, GitWorktreeResult } from '@shared/types/git'
import * as Effect from 'effect/Effect'
import { typedHandle } from '../typed-ipc'
import { isGitRepository, projectPathSchema, runGit } from './shared'
import { invalidateGitStatusCache } from './status-handler'

function worktreeFailure(code: GitWorktreeFailure['code'], message: string): GitWorktreeFailure {
  return { ok: false, code, message }
}

function commandFailure(result: Awaited<ReturnType<typeof runGit>>, fallback: string) {
  const message = `${result.stderr}\n${result.stdout}`.trim()
  return worktreeFailure('command-failed', message || fallback)
}

/**
 * Discards every uncommitted change to tracked files, staged or unstaged —
 * the same "reset all to HEAD" SourceTree puts behind its revert control.
 * Untracked files are deliberately left alone: the diff panel renders
 * `git diff HEAD`, so it never showed them, and deleting what the user could
 * not see would be a surprise, not a revert.
 */
export async function revertAllChanges(projectPath: string): Promise<GitWorktreeResult> {
  if (!(await isGitRepository(projectPath))) {
    return worktreeFailure('not-git-repo', 'Selected folder is not a Git repository.')
  }

  // Without a HEAD there is nothing to reset to; `git reset --hard HEAD`
  // would fail with a raw usage error, so answer with a clear one instead.
  const headCheck = await runGit(projectPath, ['rev-parse', '--verify', 'HEAD'])
  if (headCheck.code !== 0) {
    return worktreeFailure(
      'no-commits',
      'Nothing to revert: this repository has no commits yet.',
    )
  }

  const resetResult = await runGit(projectPath, ['reset', '--hard', 'HEAD'])
  if (resetResult.code !== 0) {
    return commandFailure(resetResult, 'Git revert failed.')
  }

  return { ok: true, summary: 'Reverted all changes' }
}

/**
 * Equivalent of `git add -A` behind SourceTree's "Stage All": every tracked
 * modification plus every non-ignored untracked file moves to the index.
 */
export async function stageAllChanges(projectPath: string): Promise<GitWorktreeResult> {
  if (!(await isGitRepository(projectPath))) {
    return worktreeFailure('not-git-repo', 'Selected folder is not a Git repository.')
  }

  const addResult = await runGit(projectPath, ['add', '--all'])
  if (addResult.code !== 0) {
    return commandFailure(addResult, 'Git staging failed.')
  }

  return { ok: true, summary: 'Staged all changes' }
}

export function registerGitWorktreeHandlers(): void {
  typedHandle('git:revert-all', (_event, rawPath: unknown) =>
    Effect.gen(function* () {
      const projectPath = decodeUnknownOrThrow(projectPathSchema, rawPath)
      const result = yield* Effect.promise(() => revertAllChanges(projectPath))
      if (result.ok) {
        invalidateGitStatusCache(projectPath)
      }
      return result
    }),
  )

  typedHandle('git:stage-all', (_event, rawPath: unknown) =>
    Effect.gen(function* () {
      const projectPath = decodeUnknownOrThrow(projectPathSchema, rawPath)
      const result = yield* Effect.promise(() => stageAllChanges(projectPath))
      if (result.ok) {
        invalidateGitStatusCache(projectPath)
      }
      return result
    }),
  )
}
