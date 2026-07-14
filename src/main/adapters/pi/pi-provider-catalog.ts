import {
  type AgentSessionServices,
  type AuthCredential,
  AuthStorage,
  createAgentSessionServices,
  type ExtensionFactory,
  getAgentDir,
  ModelRegistry,
} from '@mariozechner/pi-coding-agent'
import { MCP_ADAPTER_PACKAGE_SOURCES } from '@shared/constants/mcp'
import { createModelRef } from '@shared/types/llm'
import * as Effect from 'effect/Effect'
import { withNpmCompatibleProcessEnv } from '../../env'
import { runAppEffect } from '../../runtime'
import { SettingsService } from '../../services/settings-service'
import {
  createOpenWaggleGlobalPiSettingsManager,
  createOpenWagglePiSettingsManager,
} from './openwaggle-pi-settings-storage'
import {
  prepareOpenWaggleMcpRuntimeContext,
  rememberOpenWaggleMcpRuntimeContext,
  withOpenWaggleMcpAdapterProcessContext,
} from './pi-mcp-config-service'
import {
  createOpenWagglePiResourceLoaderOptions,
  type PiRuntimeServicesOptions,
} from './pi-provider-resources'
import { getPiModelAvailableThinkingLevels } from './pi-provider-thinking'
import { createToolPermissionRequestExtension } from './tool-permission-request-extension'
import { createTuringMachineToolSelectionExtension } from './turing-machine-tool-selection-extension'

export { getPiModelAvailableThinkingLevels } from './pi-provider-thinking'

import type {
  PiModel,
  PiProjectModelRuntime,
  ProviderCatalogSnapshot,
  ProviderModelRecord,
} from './pi-provider-catalog-types'

export type {
  PiModel,
  PiProjectModelRuntime,
  ProviderCatalogRecord,
  ProviderCatalogSnapshot,
  ProviderModelRecord,
} from './pi-provider-catalog-types'

let builtInModelProviders: ReadonlySet<string> | null = null
const TURING_MACHINE_PROVIDER_ID = 'turing-machine'
const TURING_MACHINE_MODEL_ID = 'turing-machine'
const TURING_MACHINE_MODEL_NAME = 'Turing Machine'
const DEFAULT_TURING_MACHINE_BASE_URL = 'http://127.0.0.1:3001/turing-machine'
const TURING_MACHINE_PROVIDER_API_KEY_ENV = 'OPENWAGGLE_TURING_MACHINE_TOKEN'
const TURING_MACHINE_BASE_URL_ENV_KEYS = [
  'OPENWAGGLE_TURING_MACHINE_BASE_URL',
  'TURING_MACHINE_BASE_URL',
] as const

function normalizeBaseUrl(value: string | null | undefined) {
  const normalized = value?.trim()
  if (!normalized) {
    return null
  }
  return normalized.replace(/\/+$/, '')
}

export function resolveTuringMachineBaseUrl(env: NodeJS.ProcessEnv = process.env) {
  for (const key of TURING_MACHINE_BASE_URL_ENV_KEYS) {
    const configuredValue = normalizeBaseUrl(env[key])
    if (configuredValue) {
      return configuredValue
    }
  }
  return DEFAULT_TURING_MACHINE_BASE_URL
}

function registerTuringMachineProvider(modelRegistry: ModelRegistry) {
  modelRegistry.registerProvider(TURING_MACHINE_PROVIDER_ID, {
    // Expose a single backend-backed option. The backend decides which upstream model to use.
    baseUrl: resolveTuringMachineBaseUrl(),
    apiKey: TURING_MACHINE_PROVIDER_API_KEY_ENV,
    api: 'openai-completions',
    models: [
      {
        id: TURING_MACHINE_MODEL_ID,
        name: TURING_MACHINE_MODEL_NAME,
        api: 'openai-completions',
        reasoning: true,
        input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 256_000,
        maxTokens: 16_384,
      },
    ],
  })
}

async function loadTuringMachineMcpServerNames(configPath: string | null | undefined) {
  if (!configPath) {
    return [] as string[]
  }

  try {
    const { readFile } = await import('node:fs/promises')
    const rawConfig = await readFile(configPath, 'utf8')
    const parsed = JSON.parse(rawConfig) as { mcpServers?: Record<string, unknown> }
    return Object.keys(parsed.mcpServers ?? {})
  } catch {
    return [] as string[]
  }
}

export function getPiAgentDir(): string {
  return getAgentDir()
}

export function getBuiltInPiModelProviderIds(): ReadonlySet<string> {
  if (builtInModelProviders) {
    return builtInModelProviders
  }

  const authStorage = AuthStorage.inMemory()
  const modelRegistry = ModelRegistry.inMemory(authStorage)
  builtInModelProviders = new Set(modelRegistry.getAll().map((model) => model.provider))
  return builtInModelProviders
}

function listPiProviderModelsFromRegistry(modelRegistry: ModelRegistry) {
  const availableRefs = new Set(
    modelRegistry.getAvailable().map((model) => createModelRef(model.provider, model.id)),
  )

  return modelRegistry.getAll().map((model) => ({
    ref: createModelRef(model.provider, model.id),
    provider: model.provider,
    id: model.id,
    name: model.name,
    available: availableRefs.has(createModelRef(model.provider, model.id)),
    reasoning: model.reasoning,
    availableThinkingLevels: getPiModelAvailableThinkingLevels(model),
    input: [...model.input],
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    api: model.api,
  }))
}

function listPiProvidersFromModels(models: readonly ProviderModelRecord[]) {
  const modelsByProvider = new Map<string, ProviderModelRecord[]>()

  for (const model of models) {
    const models = modelsByProvider.get(model.provider)
    if (models) {
      models.push(model)
      continue
    }
    modelsByProvider.set(model.provider, [model])
  }

  return [...modelsByProvider.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([provider, models]) => ({
      provider,
      models: [...models].sort((left, right) => left.name.localeCompare(right.name)),
    }))
}

function buildAuthCredentialMap(authStorage: AuthStorage) {
  const credentials = new Map<string, AuthCredential>()
  for (const provider of authStorage.list()) {
    const credential = authStorage.get(provider)
    if (credential) {
      credentials.set(provider, credential)
    }
  }
  return credentials
}

function buildConfiguredAuthProviderSet(modelRegistry: ModelRegistry) {
  return new Set(modelRegistry.getAvailable().map((model) => model.provider))
}

function buildOAuthProviderSet(authStorage: AuthStorage) {
  return new Set(authStorage.getOAuthProviders().map((provider) => provider.id))
}

function buildOAuthProviderNameMap(authStorage: AuthStorage) {
  return new Map(authStorage.getOAuthProviders().map((provider) => [provider.id, provider.name]))
}

function createPiProviderCatalogSnapshotFromRuntime(
  modelRegistry: ModelRegistry,
  authStorage: AuthStorage,
) {
  return {
    providers: listPiProvidersFromModels(listPiProviderModelsFromRegistry(modelRegistry)),
    oauthProviders: buildOAuthProviderSet(authStorage),
    oauthProviderNames: buildOAuthProviderNameMap(authStorage),
    credentials: buildAuthCredentialMap(authStorage),
    configuredAuthProviders: buildConfiguredAuthProviderSet(modelRegistry),
    builtInModelProviders: getBuiltInPiModelProviderIds(),
  }
}

export async function createPiRuntimeServices(
  projectPath: string,
  options: PiRuntimeServicesOptions = {},
): Promise<AgentSessionServices> {
  const authStorage = createPiRuntimeAuthStorage()
  const loadMcpAdapter = options.loadMcpAdapter ?? true
  const settingsManager = createOpenWagglePiSettingsManager(
    projectPath,
    loadMcpAdapter
      ? {}
      : {
          excludedGlobalPackageSources: MCP_ADAPTER_PACKAGE_SOURCES,
          excludedProjectPackageSources: MCP_ADAPTER_PACKAGE_SOURCES,
        },
  )
  const mcpRuntimeContext = loadMcpAdapter
    ? options.mcpRuntimeContext === undefined
      ? await prepareOpenWaggleMcpRuntimeContext(projectPath)
      : options.mcpRuntimeContext
    : null
  if (mcpRuntimeContext) {
    await settingsManager.reload()
  }
  const turingMachineExtensionFactory = createTuringMachineToolSelectionExtension({
    authStorage,
    baseUrl: resolveTuringMachineBaseUrl(),
    mcpServerNames: await loadTuringMachineMcpServerNames(mcpRuntimeContext?.configPath),
  })
  const toolPermissionRequestExtensionFactory = createToolPermissionRequestExtension({
    toolNames: ['bash', 'read', 'write', 'edit', 'multiedit', 'grep', 'find', 'ls'],
    getPermissionMode: async () => {
      const settings = await runAppEffect(Effect.gen(function* () {
        const service = yield* SettingsService
        return yield* service.get()
      }))
      return settings.toolPermissionMode
    },
  })
  const services = await withNpmCompatibleProcessEnv(() =>
    withOpenWaggleMcpAdapterProcessContext(mcpRuntimeContext, () =>
      createAgentSessionServices({
        cwd: projectPath,
        agentDir: getPiAgentDir(),
        authStorage,
        settingsManager,
        ...(mcpRuntimeContext
          ? {
              extensionFlagValues: new Map<string, boolean | string>([
                ['mcp-config', mcpRuntimeContext.configPath],
              ]),
            }
          : {}),
        resourceLoaderOptions: createOpenWagglePiResourceLoaderOptions(
          projectPath,
          {
            ...options,
            extensionFactories: [
              ...(options.extensionFactories ?? []),
              toolPermissionRequestExtensionFactory,
              turingMachineExtensionFactory,
            ],
          },
          settingsManager,
        ),
      }),
    ),
  )
  registerTuringMachineProvider(services.modelRegistry)
  rememberOpenWaggleMcpRuntimeContext(services, mcpRuntimeContext)
  return services
}

async function createPiGlobalProviderCatalogServices() {
  const agentDir = getPiAgentDir()
  const authStorage = createPiRuntimeAuthStorage()
  const settingsManager = createOpenWaggleGlobalPiSettingsManager({
    excludedGlobalPackageSources: MCP_ADAPTER_PACKAGE_SOURCES,
  })
  const services = await withNpmCompatibleProcessEnv(() =>
    createAgentSessionServices({
      cwd: agentDir,
      agentDir,
      authStorage,
      settingsManager,
    }),
  )
  registerTuringMachineProvider(services.modelRegistry)
  rememberOpenWaggleMcpRuntimeContext(services, null)
  return services
}

export async function createPiProviderCatalogSnapshot(
  projectPath?: string | null,
): Promise<ProviderCatalogSnapshot> {
  const normalizedProjectPath = projectPath?.trim()
  if (!normalizedProjectPath) {
    const services = await createPiGlobalProviderCatalogServices()
    return createPiProviderCatalogSnapshotFromRuntime(services.modelRegistry, services.authStorage)
  }

  const services = await createPiRuntimeServices(normalizedProjectPath, { loadMcpAdapter: false })
  return createPiProviderCatalogSnapshotFromRuntime(services.modelRegistry, services.authStorage)
}

export function setPiProviderApiKey(providerId: string, apiKey: string): void {
  const provider = providerId.trim()
  if (!provider) {
    throw new Error('Provider is required')
  }

  const authStorage = AuthStorage.create()
  const trimmedKey = apiKey.trim()
  if (trimmedKey) {
    authStorage.set(provider, { type: 'api_key', key: trimmedKey })
  } else {
    authStorage.remove(provider)
  }
}

export function createPiRuntimeAuthStorage(): AuthStorage {
  return AuthStorage.create()
}

function findExplicitProviderModelReference(modelRegistry: ModelRegistry, modelReference: string) {
  const separatorIndex = modelReference.indexOf('/')
  if (separatorIndex <= 0 || separatorIndex === modelReference.length - 1) {
    return null
  }

  const provider = modelReference.slice(0, separatorIndex)
  const modelId = modelReference.slice(separatorIndex + 1)
  return modelRegistry.find(provider, modelId) ?? null
}

export function findPiModel(modelRegistry: ModelRegistry, modelReference: string): PiModel | null {
  const trimmedReference = modelReference.trim()
  if (!trimmedReference) {
    return null
  }

  return findExplicitProviderModelReference(modelRegistry, trimmedReference)
}

export async function createPiProjectModelRuntime(input: {
  readonly projectPath: string
  readonly modelReference: string
  readonly skillToggles?: Readonly<Record<string, boolean>>
  readonly extensionFactories?: readonly ExtensionFactory[]
}): Promise<PiProjectModelRuntime> {
  const services = await createPiRuntimeServices(input.projectPath, {
    ...(input.skillToggles ? { skillToggles: input.skillToggles } : {}),
    ...(input.extensionFactories ? { extensionFactories: input.extensionFactories } : {}),
  })
  const model = findPiModel(services.modelRegistry, input.modelReference)
  if (!model) {
    throw new Error(`Pi model registry could not resolve model ${input.modelReference}`)
  }

  return {
    model,
    authStorage: services.authStorage,
    modelRegistry: services.modelRegistry,
    services,
  }
}
