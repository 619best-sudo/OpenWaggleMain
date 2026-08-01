/**
 * IPC handler for inline media previews.
 *
 * `tool-media:resolve` reads a media file (image / video / audio / html) inside
 * the active workspace and returns it as a data URL so the renderer can embed
 * it in a tool-result block. The path is constrained to the workspace root
 * (no traversal outside the project) and the file size is capped to avoid
 * pulling huge binaries into the renderer process.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import * as Effect from 'effect/Effect'
import { createLogger } from '../logger'
import { isPathInsideDirectory, validateProjectPath } from './project-path-validation'
import { typedHandle } from './typed-ipc'

const logger = createLogger('tool-media-handler')

/** Reject files larger than 8 MB — previews stay responsive and memory-bounded. */
const MAX_MEDIA_FILE_BYTES = 8 * 1024 * 1024

function isAbsoluteOrRelative(candidate: string): boolean {
  return candidate.length > 0
}

function lowerExtension(filePath: string): string {
  const dot = filePath.lastIndexOf('.')
  return dot < 0 ? '' : filePath.slice(dot).toLowerCase()
}

/** Resolve a media file's MIME from its extension (no content sniffing). */
export function mimeTypeForMediaPath(filePath: string): string {
  const ext = lowerExtension(filePath)
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.avif': 'image/avif',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.ogg': 'video/ogg',
    '.ogv': 'video/ogg',
    '.m4v': 'video/x-m4v',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.oga': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.html': 'text/html',
    '.htm': 'text/html',
  }
  return map[ext] ?? 'application/octet-stream'
}

function isAllowedMediaPath(filePath: string): boolean {
  const ext = lowerExtension(filePath)
  return [
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.bmp',
    '.svg',
    '.avif',
    '.mp4',
    '.webm',
    '.mov',
    '.ogg',
    '.ogv',
    '.m4v',
    '.mp3',
    '.wav',
    '.oga',
    '.m4a',
    '.flac',
    '.aac',
    '.html',
    '.htm',
  ].includes(ext)
}

function ok(dataUrl: string, mimeType: string) {
  return { dataUrl, mimeType }
}
function fail(error: string) {
  return { error }
}

/**
 * Read a media file under `projectPath` and return a base64 data URL. Pure
 * (Effect-returning) core so it is testable without spinning up Electron IPC.
 */
export function resolveMediaFileEffect(
  projectPath: string | null | undefined,
  mediaPath: string,
): Effect.Effect<{ dataUrl: string; mimeType: string }, string> {
  return Effect.gen(function* () {
    const rootEither = yield* Effect.either(validateProjectPath(projectPath))
    const root = rootEither._tag === 'Right' ? rootEither.right : undefined
    if (!root) {
      return yield* Effect.fail('Project path is not open or is invalid.')
    }
    if (!isAbsoluteOrRelative(mediaPath)) {
      return yield* Effect.fail('No media path provided.')
    }
    if (mediaPath.includes('\0')) {
      return yield* Effect.fail('Invalid media path.')
    }
    if (!isAllowedMediaPath(mediaPath)) {
      return yield* Effect.fail('Unsupported media file type.')
    }

    // Resolve the candidate against the workspace root and confirm it stays
    // inside it (reject `..` escapes and absolute paths outside the project).
    const absolute = path.isAbsolute(mediaPath) ? mediaPath : path.resolve(root, mediaPath)
    const realAbsolute = yield* Effect.tryPromise({
      try: async () => await fs.realpath(absolute),
      catch: () => 'NOT_FOUND' as const,
    }).pipe(Effect.mapError(() => 'Media file could not be found.'))
    if (!isPathInsideDirectory(root, realAbsolute)) {
      logger.warn('Rejected media path outside workspace', { mediaPath, root })
      return yield* Effect.fail('Media file is outside the project.')
    }

    const stats = yield* Effect.tryPromise({
      try: async () => await fs.stat(realAbsolute),
      catch: () => 'STAT_FAILED' as const,
    }).pipe(Effect.mapError(() => 'Media file could not be read.'))
    if (!stats.isFile()) {
      return yield* Effect.fail('Media path is not a file.')
    }
    if (stats.size > MAX_MEDIA_FILE_BYTES) {
      return yield* Effect.fail(
        `Media file is too large to preview (limit ${String(MAX_MEDIA_FILE_BYTES / (1024 * 1024))} MB).`,
      )
    }

    const buffer = yield* Effect.tryPromise({
      try: async () => await fs.readFile(realAbsolute),
      catch: (error) => (error instanceof Error ? error.message : 'READ_FAILED'),
    })
    const mimeType = mimeTypeForMediaPath(realAbsolute)
    const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`
    return ok(dataUrl, mimeType)
  })
}

export function registerToolMediaHandlers(): void {
  typedHandle('tool-media:resolve', (_event, projectPath: string, mediaPath: string) =>
    Effect.gen(function* () {
      const result = yield* Effect.either(resolveMediaFileEffect(projectPath, mediaPath))
      if (result._tag === 'Left') {
        return fail(result.left)
      }
      return ok(result.right.dataUrl, result.right.mimeType)
    }),
  )
}
