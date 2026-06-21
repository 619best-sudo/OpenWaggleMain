import { decodeUnknownOrThrow, Schema } from '@shared/schema'
import type {
  GitCommitFailure,
  GitCommitPayload,
  GitCommitResult,
  GitPushFailure,
} from '@shared/types/git'
import * as Effect from 'effect/Effect'
import { typedHandle } from '../typed-ipc'
import { isGitRepository, projectPathSchema, runGit } from './shared'
import { invalidateGitStatusCache } from './status-handler'

function commitFailure(code: GitCommitFailure['code'], message: string): GitCommitFailure {
  return { ok: false, code, message }
}

function mapCommitFailure(stderr: string): GitCommitFailure {
  const message = stderr.trim()
  const lower = message.toLowerCase()

  if (lower.includes('not a git repository')) {
    return commitFailure('not-git-repo', 'Selected folder is not a Git repository.')
  }
  if (
    lower.includes('nothing to commit') ||
    lower.includes('no changes added to commit') ||
    lower.includes('nothing added to commit')
  ) {
    return commitFailure('nothing-to-commit', 'No changes available to commit.')
  }
  if (lower.includes('merge_head exists') || lower.includes('you have not concluded your merge')) {
    return commitFailure('merge-in-progress', 'Resolve the merge in progress before committing.')
  }

  return commitFailure('unknown', message || 'Git commit failed.')
}

function pushFailure(code: GitPushFailure['code'], message: string): GitPushFailure {
  return { code, message }
}

function mapPushFailure(stderr: string): GitPushFailure {
  const message = stderr.trim()
  const lower = message.toLowerCase()

  if (lower.includes('not a git repository')) {
    return pushFailure('not-git-repo', 'Selected folder is not a Git repository.')
  }
  if (
    lower.includes('has no upstream branch') ||
    lower.includes('no upstream configured for branch') ||
    lower.includes('set the remote as upstream')
  ) {
    return pushFailure(
      'no-upstream',
      'This branch has no upstream remote. Set an upstream branch before pushing.',
    )
  }
  if (
    lower.includes('authentication failed') ||
    lower.includes('could not read username') ||
    lower.includes('permission denied') ||
    lower.includes('repository not found')
  ) {
    return pushFailure(
      'remote-auth',
      'Authentication with the remote failed. Check your Git credentials and try again.',
    )
  }
  if (
    lower.includes('[rejected]') ||
    lower.includes('non-fast-forward') ||
    lower.includes('fetch first') ||
    lower.includes('failed to push some refs') ||
    lower.includes('remote contains work that you do not have locally')
  ) {
    return pushFailure(
      'push-rejected',
      'Push was rejected by the remote. Pull or sync the branch, then try again.',
    )
  }

  return pushFailure('unknown', message || 'Git push failed.')
}

async function commitGit(projectPath: string, payload: GitCommitPayload): Promise<GitCommitResult> {
  const message = payload.message.trim()
  const preflightFailure = await validateCommitPreflight(projectPath, message)
  if (preflightFailure) return preflightFailure

  // Stage only the files explicitly selected by the user.
  const stageFailure = await stageCommitPaths(projectPath, payload.paths)
  if (stageFailure) return stageFailure

  const commitArgs = ['commit', '-m', message]
  if (payload.amend) {
    commitArgs.push('--amend')
  }
  if (payload.paths.length > 0) {
    commitArgs.push('--', ...payload.paths)
  }

  const commitResult = await runGit(projectPath, commitArgs)
  if (commitResult.code !== 0) {
    return mapCommitFailure(`${commitResult.stderr}\n${commitResult.stdout}`)
  }

  const hashResult = await runGit(projectPath, ['rev-parse', 'HEAD'])
  const commitHash = hashResult.code === 0 ? hashResult.stdout.trim() : ''
  const summary = commitResult.stdout.trim().split('\n')[0] ?? 'Commit created.'

  return {
    ok: true,
    commitHash,
    summary,
    pushed: false,
    pushError: null,
  }
}

async function pushCommit(projectPath: string, result: GitCommitResult): Promise<GitCommitResult> {
  if (!result.ok) {
    return result
  }

  const pushResult = await runGit(projectPath, ['push'])
  if (pushResult.code === 0) {
    return {
      ...result,
      pushed: true,
      pushError: null,
    }
  }

  return {
    ...result,
    pushed: false,
    pushError: mapPushFailure(`${pushResult.stderr}\n${pushResult.stdout}`),
  }
}

async function validateCommitPreflight(projectPath: string, message: string) {
  if (!message) {
    return commitFailure('empty-message', 'Commit message is required.')
  }
  if (!(await isGitRepository(projectPath))) {
    return commitFailure('not-git-repo', 'Selected folder is not a Git repository.')
  }

  const mergeCheck = await runGit(projectPath, ['rev-parse', '-q', '--verify', 'MERGE_HEAD'])
  return mergeCheck.code === 0
    ? commitFailure('merge-in-progress', 'Resolve the merge in progress before committing.')
    : null
}

async function stageCommitPaths(projectPath: string, paths: readonly string[]) {
  if (paths.length === 0) return null

  const addResult = await runGit(projectPath, ['add', '--', ...paths])
  return addResult.code === 0 ? null : mapCommitFailure(addResult.stderr)
}

const commitPayloadSchema = Schema.Struct({
  message: Schema.String,
  amend: Schema.Boolean,
  paths: Schema.Array(Schema.String),
  push: Schema.Boolean,
})

export function registerGitCommitHandlers(): void {
  typedHandle('git:commit', (_event, rawPath: unknown, rawPayload: unknown) =>
    Effect.gen(function* () {
      const projectPath = decodeUnknownOrThrow(projectPathSchema, rawPath)
      const payload = decodeUnknownOrThrow(commitPayloadSchema, rawPayload)
      const result = yield* Effect.promise(async () => {
        const commitResult = await commitGit(projectPath, payload)
        return payload.push ? pushCommit(projectPath, commitResult) : commitResult
      })
      if (result.ok) {
        invalidateGitStatusCache(projectPath)
      }
      return result
    }),
  )
}
