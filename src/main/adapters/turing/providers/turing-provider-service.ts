/**
 * Turing-backed {@link ProviderService}.
 *
 * Replaces the Pi `ModelRegistry`/`AuthStorage`-derived catalog with a static,
 * OpenWaggle-owned provider/model table. The turing-harness runtime talks to any
 * OpenAI/OpenRouter-compatible endpoint through a single baseUrl + apiKey pair
 * (see `turing-llm-config.ts`), so "multi-provider" here means a curated list of
 * OpenRouter-routable model slugs plus the `turing-machine` harness entry — not a
 * live per-endpoint registry.
 *
 * Provider availability is derived from the turing credential store
 * (`turing-credentials.ts`) and the OpenRouter env key, mirroring how the renderer's
 * model picker gates `available`.
 */

import type {
  ProviderApiKeyAuthSource,
  ProviderAuthInfo,
  ProviderAuthSource,
} from '@shared/types/llm'
import type { Provider, ThinkingLevel } from '@shared/types/settings'
import { Layer } from 'effect'
import * as Effect from 'effect/Effect'
import { env } from '../../../env'
import { ProviderLookupError } from '../../../errors'
import { ProviderService } from '../../../ports/provider-service'
import {
  isDirectOpenRouterEnabled,
  resolveBackendToken,
  TURING_MACHINE_MODEL_REF,
} from '../turing-llm-config'
import { hasStoredApiKey, readStoredApiKey } from './turing-credentials'

const ALL_THINKING_LEVELS: readonly ThinkingLevel[] = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
]

const TURING_MACHINE_PROVIDER_ID = 'turing-machine'

/**
 * Whether the catalogued (model-serving) providers are usable, which is a
 * question about whichever credential the current routing mode actually uses —
 * see `turing-llm-config.ts`.
 *
 * On the default backend path that is the signed-in user's token: no OpenRouter
 * key is required, and gating on one would report every provider as
 * unconfigured for a perfectly working signed-in user. On the direct path it is
 * the OpenRouter key, as before.
 */
function openRouterKeyConfigured(): boolean {
  if (!isDirectOpenRouterEnabled()) {
    return Boolean(resolveBackendToken())
  }
  return Boolean(
    readStoredApiKey('openrouter') || env.OPENWAGGLE_OPENROUTER_API_KEY || env.OPENROUTER_API_KEY,
  )
}

function authSourceForOpenRouterBacked(configured: boolean): {
  source: ProviderAuthSource
  apiKeySource: ProviderApiKeyAuthSource
} {
  // Credentials live in the OpenWaggle store or env, not a Pi-managed keychain.
  if (configured) {
    return { source: 'environment-or-custom', apiKeySource: 'environment-or-custom' }
  }
  return { source: 'none', apiKeySource: 'none' }
}

function authInfoForOpenRouterBacked(configured: boolean): ProviderAuthInfo {
  const { source, apiKeySource } = authSourceForOpenRouterBacked(configured)
  const key =
    readStoredApiKey('openrouter') ?? env.OPENWAGGLE_OPENROUTER_API_KEY ?? env.OPENROUTER_API_KEY
  return {
    configured,
    source,
    apiKeyConfigured: configured,
    apiKeySource,
    oauthConnected: false,
    supportsApiKey: true,
    supportsOAuth: false,
    apiKeyPreview: key ? `${key.slice(0, 4)}…${key.slice(-4)}` : undefined,
  }
}

interface CatalogModel {
  readonly id: string
  readonly modelId: string
  readonly name: string
  readonly reasoning: boolean
  readonly input: readonly ('text' | 'image')[]
  readonly contextWindow: number
  readonly maxTokens: number
}

interface CatalogProvider {
  readonly id: Provider
  readonly displayName: string
  readonly apiKeyManagementUrl?: string
  readonly testModelId: string
  readonly models: readonly CatalogModel[]
}

/**
 * The curated provider/model table. OpenRouter-direct providers carry OpenRouter
 * slugs as `modelId` (the harness sends these to the OpenRouter endpoint unchanged).
 * `turing-machine` is the harness entry that collapses to a direct OpenRouter model
 * via `resolveTuringLlmConfig`.
 *
 * Keep this list small and high-signal; the model picker renders every entry.
 */
const CATALOG: readonly CatalogProvider[] = [
  {
    id: 'turing-machine',
    displayName: 'Turing Machine',
    testModelId: 'turing-machine',
    models: [
      {
        id: TURING_MACHINE_MODEL_REF,
        modelId: 'turing-machine',
        name: 'Turing Machine',
        reasoning: true,
        input: ['text'],
        contextWindow: 256_000,
        maxTokens: 16_384,
      },
    ],
  },
  {
    id: 'anthropic',
    displayName: 'Anthropic',
    apiKeyManagementUrl: 'https://console.anthropic.com/account/keys',
    testModelId: 'anthropic/claude-sonnet-4',
    models: [
      {
        id: 'anthropic/claude-sonnet-4',
        modelId: 'anthropic/claude-sonnet-4',
        name: 'Claude Sonnet 4',
        reasoning: true,
        input: ['text', 'image'],
        contextWindow: 200_000,
        maxTokens: 16_384,
      },
    ],
  },
  {
    id: 'openai',
    displayName: 'OpenAI',
    apiKeyManagementUrl: 'https://platform.openai.com/api-keys',
    testModelId: 'openai/gpt-4o',
    models: [
      {
        id: 'openai/gpt-4o',
        modelId: 'openai/gpt-4o',
        name: 'GPT-4o',
        reasoning: false,
        input: ['text', 'image'],
        contextWindow: 128_000,
        maxTokens: 16_384,
      },
    ],
  },
  {
    id: 'google',
    displayName: 'Google',
    apiKeyManagementUrl: 'https://aistudio.google.com/apikey',
    testModelId: 'google/gemini-2.5-pro',
    models: [
      {
        id: 'google/gemini-2.5-pro',
        modelId: 'google/gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        reasoning: true,
        input: ['text', 'image'],
        contextWindow: 1_000_000,
        maxTokens: 16_384,
      },
    ],
  },
  {
    id: 'openrouter',
    displayName: 'OpenRouter',
    apiKeyManagementUrl: 'https://openrouter.ai/keys',
    testModelId: 'openai/gpt-4o',
    models: [
      {
        id: 'openrouter/auto',
        modelId: 'auto',
        name: 'OpenRouter Auto',
        reasoning: false,
        input: ['text', 'image'],
        contextWindow: 200_000,
        maxTokens: 16_384,
      },
    ],
  },
]

function providerConfigured(providerId: Provider, openRouterAvailable: boolean): boolean {
  if (providerId === TURING_MACHINE_PROVIDER_ID) {
    // The harness authenticates via the OpenRouter key; a dedicated turing-machine
    // token (env OPENWAGGLE_TURING_MACHINE_TOKEN) is an optional override.
    return Boolean(
      openRouterAvailable ||
        process.env.OPENWAGGLE_TURING_MACHINE_TOKEN ||
        hasStoredApiKey(providerId),
    )
  }
  // All other catalogued providers route through OpenRouter.
  return openRouterAvailable
}

function buildCatalog() {
  const openRouterAvailable = openRouterKeyConfigured()
  return CATALOG.map((provider) => {
    const configured = providerConfigured(provider.id, openRouterAvailable)
    return {
      id: provider.id,
      displayName: provider.displayName,
      apiKeyManagementUrl: provider.apiKeyManagementUrl,
      auth: authInfoForOpenRouterBacked(configured),
      testModel: provider.testModelId,
      models: provider.models.map((model) => ({
        id: model.id,
        modelId: model.modelId,
        name: model.name,
        available: configured,
        reasoning: model.reasoning,
        availableThinkingLevels: ALL_THINKING_LEVELS,
        input: [...model.input],
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
      })),
    }
  })
}

export const TuringProviderServiceLive = Layer.succeed(
  ProviderService,
  ProviderService.of({
    getAll: () => Effect.sync(() => buildCatalog()),

    get: (providerId: string) =>
      Effect.sync(() => buildCatalog().find((provider) => provider.id === providerId)),

    getProviderForModel: (modelId: string) =>
      Effect.sync(() => buildCatalog()).pipe(
        Effect.flatMap((catalog) => {
          const provider = catalog.find((entry) =>
            entry.models.some((model) => model.id === modelId),
          )
          return provider
            ? Effect.succeed(provider)
            : Effect.fail(new ProviderLookupError({ modelId }))
        }),
      ),

    isKnownModel: (modelId: string) =>
      Effect.sync(() =>
        buildCatalog().some((entry) => entry.models.some((model) => model.id === modelId)),
      ),
  }),
)
