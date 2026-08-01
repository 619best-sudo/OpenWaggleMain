import * as NodeContext from '@effect/platform-node/NodeContext'
import type { Effect as EffectType } from 'effect/Effect'
import * as Effect from 'effect/Effect'
import type { Exit as ExitType } from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import { MachinePlanFileStoreLive } from './adapters/machine-plan-file-store-adapter'
import { FilesystemStandardsLive } from './adapters/standards-adapter'
import { TuringHarnessAgentKernelLive } from './adapters/turing/turing-agent-kernel-adapter'
import { TuringSessionTreePreferencesLive } from './adapters/turing/turing-session-tree-preferences-service'
import { TuringMcpConfigServiceLive } from './adapters/turing/mcp/turing-mcp-config-service'
import { TuringProviderAuthLive } from './adapters/turing/providers/turing-provider-auth-service'
import { TuringProviderOAuthLive } from './adapters/turing/providers/turing-provider-oauth-service'
import { TuringProviderProbeLive } from './adapters/turing/providers/turing-provider-probe-service'
import { TuringProviderServiceLive } from './adapters/turing/providers/turing-provider-service'
import { SettingsWagglePresetsRepositoryLive } from './adapters/settings-waggle-presets-repository'
import { SqliteSessionProjectionRepositoryLive } from './adapters/sqlite-session-projection-repository'
import { SqliteSessionRepositoryLive } from './adapters/sqlite-session-repository'
import { AppDatabaseLive } from './services/database-service'
import { AppLogger } from './services/logger-service'
import { SettingsService } from './services/settings-service'
import { setStoreEffectRunner } from './store/store-runtime'

const AppLayer = Layer.mergeAll(
  NodeContext.layer,
  AppLogger.Live,
  AppDatabaseLive,
  SettingsService.Live,
  SqliteSessionProjectionRepositoryLive,
  SqliteSessionRepositoryLive,
  FilesystemStandardsLive,
  TuringHarnessAgentKernelLive,
  TuringMcpConfigServiceLive,
  TuringProviderAuthLive,
  TuringProviderProbeLive,
  TuringProviderOAuthLive,
  TuringProviderServiceLive,
  TuringSessionTreePreferencesLive,
  SettingsWagglePresetsRepositoryLive,
  MachinePlanFileStoreLive,
)

function makeAppRuntime() {
  return ManagedRuntime.make(AppLayer)
}

let currentRuntime = makeAppRuntime()

installStoreEffectRunner()

export type AppServices =
  typeof AppLayer extends Layer.Layer<infer R, infer _E, infer _RIn> ? R : never
export type AppRuntimeError =
  typeof AppLayer extends Layer.Layer<infer _R, infer E, infer _RIn> ? E : never

function getAppRuntime() {
  return currentRuntime
}

function installStoreEffectRunner() {
  setStoreEffectRunner((effect) => getAppRuntime().runPromise(effect))
}

export async function initializeAppRuntime(): Promise<void> {
  await getAppRuntime().runPromise(Effect.void)
}

export async function disposeAppRuntime(): Promise<void> {
  await getAppRuntime().dispose()
}

export async function resetAppRuntimeForTests(): Promise<void> {
  await disposeAppRuntime()
  currentRuntime = makeAppRuntime()
  installStoreEffectRunner()
}

export function runAppEffect<A, E>(effect: EffectType<A, E, AppServices>): Promise<A> {
  return getAppRuntime().runPromise(effect)
}

export function runAppEffectExit<A, E>(
  effect: EffectType<A, E, AppServices>,
): Promise<ExitType<A, E | AppRuntimeError>> {
  return getAppRuntime().runPromiseExit(effect)
}
