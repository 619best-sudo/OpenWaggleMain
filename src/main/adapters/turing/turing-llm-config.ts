import { parseModelRef } from '@shared/types/llm'
import { env } from '../../env'
import { resolveTuringMachineBaseUrl } from '../pi/pi-provider-catalog'
import { readStoredApiKey } from './providers/turing-credentials'

/**
 * Resolves the OpenAI-shaped LLM configuration that `turing-harness` needs from
 * the selected OpenWaggle model reference plus the environment.
 *
 * turing-harness talks to any OpenAI/OpenRouter-compatible endpoint through a
 * single `baseUrl` + `apiKey` pair, and appends `/chat/completions` to that base.
 *
 * By default everything routes through the turing-machine backend: `baseUrl` is
 * the backend's `/turing-machine` mount, so the harness lands on
 * `POST /turing-machine/chat/completions`, and the bearer token is the signed-in
 * user's JWT. The backend holds the OpenRouter key, enforces quota and bills the
 * call — no provider key is needed on, or leaves, the desktop app.
 *
 * Model refs (`provider/modelId`) translate as:
 *
 * - `turing-machine/*` → the `turing-machine` sentinel, which tells the backend
 *   to pick the upstream model itself (from `metadata.modelSelection`, which the
 *   harness fills in from run complexity, or its own env default).
 * - `openrouter/<slug>` strips the prefix; everything else (`anthropic/...`,
 *   `openai/...`, `google/...`) is already a valid slug. The backend forwards any
 *   explicit slug upstream verbatim.
 *
 * Setting `OPENWAGGLE_DIRECT_OPENROUTER` restores the legacy direct-to-OpenRouter
 * path with a user-supplied key — see {@link isDirectOpenRouterEnabled}.
 */

const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const DIRECT_OPENROUTER_FALLBACK_MODEL = 'poolside/laguna-xs-2.1'

/** Sentinel that hands upstream model choice to the backend. */
const TURING_MACHINE_SENTINEL_MODEL = 'turing-machine'

/** Env var holding a shared (non-JWT) backend token, for headless/dev use. */
const TURING_MACHINE_TOKEN_ENV = 'OPENWAGGLE_TURING_MACHINE_TOKEN'

/**
 * Whether to bypass the backend and call OpenRouter directly.
 *
 * Off unless explicitly switched on, so the secure, billed path is what you get
 * by simply not configuring anything.
 */
export function isDirectOpenRouterEnabled(): boolean {
  const flag = env.OPENWAGGLE_DIRECT_OPENROUTER?.trim().toLowerCase()
  return flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on'
}

export interface TuringLlmConfig {
  /** Base URL of the OpenAI/OpenRouter-compatible endpoint. */
  readonly baseUrl: string
  /** API key/token for the endpoint (may be empty if the endpoint is open). */
  readonly apiKey: string
  /** Model slug passed to turing-harness (`resolveModel`). */
  readonly modelSlug: string
  /**
   * Stronger model turing-harness escalates to, when configured. Drives two
   * things: the staged `read` hands files it rates too complex to this model for
   * comprehension, and the permission callback pins it as `authorModel` so it
   * authors the bytes for high-complexity write/edit calls. `undefined` ⇒ the run
   * stays single-model and both escalations are inert.
   */
  readonly escalationModelSlug: string | undefined
}

/** The candidate pool turing-harness selects per call, ordered cheap → capable.
 *  A single entry means "no tier to escalate to" and disables escalation. */
export function toolModelCandidatesFor(config: TuringLlmConfig): readonly string[] {
  return config.escalationModelSlug && config.escalationModelSlug !== config.modelSlug
    ? [config.modelSlug, config.escalationModelSlug]
    : [config.modelSlug]
}

function firstNonEmpty(...values: readonly (string | undefined)[]) {
  for (const value of values) {
    if (value && value.trim().length > 0) {
      return value.trim()
    }
  }
  return undefined
}

/** Read a provider's stored API key from the OpenWaggle credential store, if present. */
function storedApiKey(providerId: string) {
  try {
    return readStoredApiKey(providerId)
  } catch {
    // Credential store is best-effort; fall back to environment variables.
  }
  return undefined
}

/**
 * Bearer token for the turing-machine backend: the signed-in user's JWT (pushed
 * into the `turing-machine` credential slot by the renderer auth store), else a
 * shared token from the environment for headless/dev runs.
 */
export function resolveBackendToken(): string {
  return (
    firstNonEmpty(storedApiKey('turing-machine'), process.env[TURING_MACHINE_TOKEN_ENV]) ?? ''
  )
}

/**
 * The model slug to send to the backend. `turing-machine/*` collapses to the
 * sentinel so the backend chooses; any other ref is already an upstream slug and
 * is forwarded as-is.
 */
function backendModelSlug(provider: string, modelId: string, modelRef: string): string {
  if (provider === 'turing-machine') return TURING_MACHINE_SENTINEL_MODEL
  return provider === 'openrouter' ? modelId : modelRef
}

export function resolveTuringLlmConfig(modelRef: string): TuringLlmConfig {
  const parsed = parseModelRef(modelRef)
  const provider = parsed?.provider ?? 'openrouter'
  const modelId = parsed?.modelId ?? modelRef

  if (!isDirectOpenRouterEnabled()) {
    return {
      // The harness appends `/chat/completions`, landing on the backend route.
      baseUrl: resolveTuringMachineBaseUrl(),
      apiKey: resolveBackendToken(),
      modelSlug: backendModelSlug(provider, modelId, modelRef),
      escalationModelSlug: firstNonEmpty(env.OPENWAGGLE_TURING_ESCALATION_MODEL),
    }
  }

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
      escalationModelSlug: firstNonEmpty(env.OPENWAGGLE_TURING_ESCALATION_MODEL),
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
    escalationModelSlug: firstNonEmpty(env.OPENWAGGLE_TURING_ESCALATION_MODEL),
  }
}
