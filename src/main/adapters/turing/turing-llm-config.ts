import { parseModelRef } from '@shared/types/llm'
import { env } from '../../env'
import { createPiRuntimeAuthStorage } from '../pi/pi-provider-catalog'

/**
 * Resolves the OpenRouter-shaped LLM configuration that `turing-harness` needs
 * from the selected OpenWaggle model reference plus the environment.
 *
 * turing-harness talks to any OpenAI/OpenRouter-compatible endpoint through a
 * single `baseUrl` + `apiKey` pair. OpenWaggle model refs are `provider/modelId`
 * strings, so we translate them here:
 *
 * - `turing-machine/*` is currently normalized to a direct OpenRouter model so
 *   turing-harness bypasses the local turing-machine wrapper.
 * - `openrouter/<slug>` strips the provider prefix and hits OpenRouter directly.
 * - everything else (`anthropic/...`, `openai/...`, `google/...`) is already a
 *   valid OpenRouter slug and is passed through unchanged.
 *
 * The bearer token/API key is sourced from the shared pi AuthStorage when
 * possible, falling back to environment variables.
 */

const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const DIRECT_OPENROUTER_FALLBACK_MODEL = 'poolside/laguna-xs-2.1'

export interface TuringLlmConfig {
  /** Base URL of the OpenAI/OpenRouter-compatible endpoint. */
  readonly baseUrl: string
  /** API key/token for the endpoint (may be empty if the endpoint is open). */
  readonly apiKey: string
  /** Model slug passed to turing-harness (`resolveModel`). */
  readonly modelSlug: string
}

function firstNonEmpty(...values: readonly (string | undefined)[]) {
  for (const value of values) {
    if (value && value.trim().length > 0) {
      return value.trim()
    }
  }
  return undefined
}

/** Read a provider's stored API key from the shared pi AuthStorage, if present. */
function storedApiKey(providerId: string) {
  try {
    const credential = createPiRuntimeAuthStorage().get(providerId)
    if (credential?.type === 'api_key' && credential.key.trim().length > 0) {
      return credential.key.trim()
    }
  } catch {
    // AuthStorage is best-effort; fall back to environment variables.
  }
  return undefined
}

export function resolveTuringLlmConfig(modelRef: string): TuringLlmConfig {
  const parsed = parseModelRef(modelRef)
  const provider = parsed?.provider ?? 'openrouter'
  const modelId = parsed?.modelId ?? modelRef

  if (provider === 'turing-machine') {
    return {
      baseUrl:
        firstNonEmpty(env.OPENWAGGLE_OPENROUTER_BASE_URL, env.OPENROUTER_BASE_URL) ??
        DEFAULT_OPENROUTER_BASE_URL,
      apiKey:
        firstNonEmpty(
          storedApiKey('openrouter'),
          env.OPENWAGGLE_OPENROUTER_API_KEY,
          env.OPENROUTER_API_KEY,
        ) ?? '',
      modelSlug: DIRECT_OPENROUTER_FALLBACK_MODEL,
    }
  }

  return {
    baseUrl:
      firstNonEmpty(env.OPENWAGGLE_OPENROUTER_BASE_URL, env.OPENROUTER_BASE_URL) ??
      DEFAULT_OPENROUTER_BASE_URL,
    apiKey:
      firstNonEmpty(
        storedApiKey(provider),
        env.OPENWAGGLE_OPENROUTER_API_KEY,
        env.OPENROUTER_API_KEY,
      ) ?? '',
    // `openrouter/<slug>` -> `<slug>`; other providers are already OpenRouter slugs.
    modelSlug: provider === 'openrouter' ? modelId : modelRef,
  }
}
