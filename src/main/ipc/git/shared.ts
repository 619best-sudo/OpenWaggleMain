import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { DOUBLE_FACTOR } from '@shared/constants/math'
import { BYTES_PER_KIBIBYTE } from '@shared/constants/resource-limits'
import { GIT_CACHE } from '@shared/constants/time'
import { Schema, safeDecodeUnknown } from '@shared/schema'
import { jsonObjectSchema } from '@shared/schemas/validation'

const MODULE_VALUE_5 = 5

export const execFileAsync = promisify(execFile)
export const DEFAULT_GIT_MAX_BUFFER = MODULE_VALUE_5 * BYTES_PER_KIBIBYTE * BYTES_PER_KIBIBYTE

export interface GitExecResult {
  readonly stdout: string
  readonly stderr: string
  readonly code: number
}

export interface RunGitOptions {
  readonly maxBuffer?: number
}

function normalizeGitSuccess(output: string | { stdout?: string; stderr?: string }): GitExecResult {
  if (typeof output === 'string') {
    return { stdout: output, stderr: '', code: 0 }
  }
  return {
    stdout: output.stdout ?? '',
    stderr: output.stderr ?? '',
    code: 0,
  }
}

function normalizeGitError(error: unknown): GitExecResult {
  const result = safeDecodeUnknown(jsonObjectSchema, error)
  if (!result.success) {
    return {
      stdout: '',
      stderr: error instanceof Error ? error.message : 'Git command failed',
      code: 1,
    }
  }

  const value = result.data
  const fallbackMessage = typeof value.message === 'string' ? value.message : 'Git command failed'
  return {
    stdout: typeof value.stdout === 'string' ? value.stdout : '',
    stderr: typeof value.stderr === 'string' ? value.stderr : fallbackMessage,
    code: typeof value.code === 'number' ? value.code : 1,
  }
}

export async function runGit(
  projectPath: string,
  args: string[],
  options: RunGitOptions = {},
): Promise<GitExecResult> {
  const maxBuffer = options.maxBuffer ?? DEFAULT_GIT_MAX_BUFFER
  try {
    const output = await execFileAsync('git', args, {
      cwd: projectPath,
      maxBuffer,
    })
    return normalizeGitSuccess(output)
  } catch (error) {
    return normalizeGitError(error)
  }
}

/**
 * `rev-parse --is-inside-work-tree` spawns a process on every call, and the
 * renderer re-checks git state on window focus, route changes and every
 * terminal transport event. Cache the answer per path — a folder does not flip
 * between "repo" and "not a repo" often, and a stale answer self-heals within
 * the TTL.
 */
const repositoryCheckCache = new Map<string, { isRepository: boolean; timestamp: number }>()

export function invalidateGitRepositoryCache(projectPath?: string) {
  if (projectPath) {
    repositoryCheckCache.delete(projectPath)
    return
  }
  repositoryCheckCache.clear()
}

export async function isGitRepository(projectPath: string): Promise<boolean> {
  const cached = repositoryCheckCache.get(projectPath)
  if (cached && Date.now() - cached.timestamp < GIT_CACHE.REPOSITORY_CHECK_TTL_MS) {
    return cached.isRepository
  }

  const result = await runGit(projectPath, ['rev-parse', '--is-inside-work-tree'])
  const isRepository = result.code === 0 && result.stdout.trim() === 'true'
  repositoryCheckCache.set(projectPath, { isRepository, timestamp: Date.now() })
  return isRepository
}

export function stripSurroundingQuotes(value: string): string {
  if (value.length >= DOUBLE_FACTOR && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replaceAll('\\"', '"')
  }
  return value
}

export const projectPathSchema = Schema.String.pipe(
  Schema.minLength(1),
  Schema.filter((projectPath) => path.isAbsolute(projectPath) || 'Project path must be absolute'),
)
