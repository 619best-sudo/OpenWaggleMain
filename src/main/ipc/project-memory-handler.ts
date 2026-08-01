/**
 * IPC handlers for project memory status, manual refresh, and turing-harness
 * prewarm.
 *
 * - `project-memory:get-status` / `project-memory:refresh` back the renderer's
 *   memory-status UI (the store at `features/memory/state/project-memory-store.ts`
 *   already calls these; before this handler existed those calls hit a missing
 *   channel and the UI was silently broken).
 * - `project-memory:prewarm` is the eager trigger that builds a warm turing
 *   harness session in the background (MCP clients + skill providers + file
 *   memory index), so the first message send in a project does not block on a
 *   full build. Fired from the renderer on project open and model change.
 */
import { decodeUnknownOrThrow, Schema } from '@shared/schema'
import * as Effect from 'effect/Effect'
import {
  getProjectMemoryStatus,
  prewarmProjectMemory,
  refreshProjectMemory,
} from '../adapters/turing/turing-memory-prewarm'
import { buildTuringStandardsContext } from '../agent/standards-context-projection'
import { createLogger } from '../logger'
import { McpConfigService } from '../ports/mcp-config-service'
import { SettingsService } from '../services/settings-service'
import { typedHandle } from './typed-ipc'

const logger = createLogger('project-memory-handler')

const projectPathSchema = Schema.String.pipe(Schema.minLength(1))

function normalizeOptional(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function registerProjectMemoryHandlers(): void {
  typedHandle('project-memory:get-status', (_event, rawProjectPath: string, rawModelRef?: string) =>
    Effect.gen(function* () {
      const projectPath = decodeUnknownOrThrow(projectPathSchema, rawProjectPath)
      const modelRef = normalizeOptional(rawModelRef)
      return yield* Effect.promise(() => getProjectMemoryStatus(projectPath, modelRef))
    }),
  )

  typedHandle(
    'project-memory:refresh',
    (_event, rawProjectPath: string, rawModelRef?: string, rawPiSessionId?: string) =>
      Effect.gen(function* () {
        const projectPath = decodeUnknownOrThrow(projectPathSchema, rawProjectPath)
        const modelRef = normalizeOptional(rawModelRef)
        const piSessionId = normalizeOptional(rawPiSessionId)
        return yield* Effect.promise(() => refreshProjectMemory(projectPath, modelRef, piSessionId))
      }),
  )

  typedHandle('project-memory:prewarm', (_event, rawProjectPath: string, rawModelRef?: string) =>
    Effect.gen(function* () {
      const projectPath = decodeUnknownOrThrow(projectPathSchema, rawProjectPath)
      const modelRef = normalizeOptional(rawModelRef)

      // Resolve the runtime inputs (MCP view + all-enabled-skills standards
      // context) so the prewarmed spare attaches MCP clients + registers skill
      // providers ahead of time. Both are best-effort: a resolution failure
      // downgrades to a prewarm with no extensions attached (the run path will
      // retry the attach), never a thrown error to the caller.
      const settingsService = yield* SettingsService
      const settings = yield* settingsService.get()
      const mcpConfig = yield* McpConfigService

      const [mcpResult, standardsResult] = yield* Effect.all(
        [
          Effect.either(mcpConfig.getView(projectPath)),
          Effect.either(Effect.promise(() => buildTuringStandardsContext(projectPath, settings))),
        ],
        { concurrency: 'unbounded' },
      )

      const mcpSettings = mcpResult._tag === 'Right' ? mcpResult.right : undefined
      const standardsContext = standardsResult._tag === 'Right' ? standardsResult.right : undefined

      if (mcpResult._tag === 'Left') {
        logger.warn('Prewarm: MCP view resolution failed; prewarming without MCP', {
          projectPath,
          error: String(mcpResult.left),
        })
      }
      if (standardsResult._tag === 'Left') {
        logger.warn('Prewarm: standards context resolution failed; prewarming without skills', {
          projectPath,
          error: String(standardsResult.left),
        })
      }

      // Fire-and-forget: the IPC returns immediately and the build runs in the
      // background. `prewarmProjectMemory` de-dupes concurrent builds and
      // returns the cached spare when one exists, so repeated calls are cheap.
      void prewarmProjectMemory(projectPath, {
        ...(modelRef ? { modelRef } : {}),
        ...(mcpSettings ? { mcpSettings } : {}),
        ...(standardsContext ? { standardsContext } : {}),
      }).catch((error) => {
        logger.warn('Prewarm failed', {
          projectPath,
          error: error instanceof Error ? error.message : String(error),
        })
      })
    }),
  )
}
