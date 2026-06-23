import { Schema, safeDecodeUnknown } from '@shared/schema'
import * as Effect from 'effect/Effect'
import { McpConfigService } from '../ports/mcp-config-service'
import { SettingsService } from '../services/settings-service'
import {
  getWaggleAppInstallStatus,
  installWaggleAppDependencies,
} from '../waggle/waggle-app-dependency-installer'
import { validateProjectPath } from './project-path-validation'
import { typedHandle } from './typed-ipc'

const waggleAppManifestSchema = Schema.Struct({
  requiredMcps: Schema.Array(Schema.String),
  requiredSkills: Schema.Array(Schema.String),
  optionalMcps: Schema.optional(Schema.Array(Schema.String)),
  optionalSkills: Schema.optional(Schema.Array(Schema.String)),
})

const wagglePresetInstallSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  app: waggleAppManifestSchema,
})

export function registerWaggleAppsHandlers(): void {
  typedHandle(
    'waggle-apps:get-install-status',
    (_event, rawPreset: unknown, rawProjectPath?: string | null) =>
      Effect.gen(function* () {
        const decodedPreset = safeDecodeUnknown(wagglePresetInstallSchema, rawPreset)
        if (!decodedPreset.success) {
          return yield* Effect.fail(new Error(decodedPreset.issues.join('; ')))
        }

        const projectPath = yield* validateProjectPath(rawProjectPath)
        if (!projectPath) {
          return yield* Effect.fail(
            new Error('Project path is required to inspect Waggle app dependencies.'),
          )
        }

        const settingsService = yield* SettingsService
        const mcpConfigService = yield* McpConfigService
        return yield* Effect.promise(() =>
          getWaggleAppInstallStatus({
            projectPath,
            presetId: decodedPreset.data.id,
            app: decodedPreset.data.app,
            settingsService,
            mcpConfigService,
          }),
        )
      }),
  )

  typedHandle(
    'waggle-apps:install-dependencies',
    (_event, rawPreset: unknown, rawProjectPath?: string | null) =>
      Effect.gen(function* () {
        const decodedPreset = safeDecodeUnknown(wagglePresetInstallSchema, rawPreset)
        if (!decodedPreset.success) {
          return yield* Effect.fail(new Error(decodedPreset.issues.join('; ')))
        }

        const projectPath = yield* validateProjectPath(rawProjectPath)
        if (!projectPath) {
          return yield* Effect.fail(
            new Error('Project path is required to install Waggle app dependencies.'),
          )
        }

        const settingsService = yield* SettingsService
        const mcpConfigService = yield* McpConfigService
        return yield* Effect.promise(() =>
          installWaggleAppDependencies({
            projectPath,
            presetId: decodedPreset.data.id,
            app: decodedPreset.data.app,
            settingsService,
            mcpConfigService,
          }),
        )
      }),
  )
}
