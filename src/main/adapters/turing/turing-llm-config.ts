import { parseModelRef } from '@shared/types/llm'
import { env } from '../../env'
import { resolveTuringMachineBaseUrl } from '../pi/pi-provider-catalog'
import { readStoredApiKey } from './providers/turing-credentials'
import { TURING_MODELS } from './turing-models.config'

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
/**
 * The slug used on the direct-to-OpenRouter path when the caller asked for the
 * `turing-machine` alias (which normally lets the backend choose).
 *
 * Reads the driver from `turing-models.config` rather than repeating it. It was
 * a second hardcoded copy, which is exactly the failure that config file was
 * created to end — its header says every model choice lives there and the other
 * modules read from it, and this one literal had escaped. Changing the driver in
 * the one documented place therefore left this path still on the old model.
 */
const DIRECT_OPENROUTER_FALLBACK_MODEL = TURING_MODELS.driver

/**
 * Sentinel that once handed upstream model choice to the backend.
 *
 * It no longer does: the backend is a transparent passthrough that forwards
 * `model` to OpenRouter verbatim, so this string must be resolved to a real
 * slug HERE — see {@link resolveTuringModelSlug}. Anything that ships the
 * sentinel on the wire reaches OpenRouter as a model that does not exist.
 */
const TURING_MACHINE_SENTINEL_MODEL = 'turing-machine'

/** The app model ref for the product's own "let us pick" entry. */
export const TURING_MACHINE_MODEL_REF = 'turing-machine/turing-machine'

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
  return firstNonEmpty(storedApiKey('turing-machine'), process.env[TURING_MACHINE_TOKEN_ENV]) ?? ''
}

/**
 * The model slug to send to the backend. `turing-machine/*` collapses to the
 * sentinel so the backend chooses; any other ref is already an upstream slug and
 * is forwarded as-is.
 */
/**
 * Concrete OpenRouter slug used when the selected ref is `turing-machine/*`.
 *
 * The backend used to resolve that sentinel itself, from its own env and from a
 * `metadata.modelCandidates` pool. That indirection is gone: the proxy is now a
 * transparent passthrough, so the model has to be a real slug by the time it
 * leaves this process. It also removes a whole class of confusion where the app
 * could not tell which model actually served a request.
 *
 * Must be reasoning-capable AND emit reasoning alongside tool calls, or the UI
 * shows an empty thinking pane with no error — measured: mistral-small returned
 * reasoning on 0 of 122 stream chunks, this one on ~120 of 122.
 */
const TURING_MACHINE_DEFAULT_MODEL = TURING_MODELS.driver

function backendModelSlug(provider: string, modelId: string, modelRef: string): string {
  // `turing-machine/turing-machine` is the "let the product choose" ref; any
  // other `turing-machine/<slug>` names a concrete model and is honoured.
  if (provider === 'turing-machine') {
    return modelId && modelId !== TURING_MACHINE_SENTINEL_MODEL
      ? modelId
      : TURING_MACHINE_DEFAULT_MODEL
  }
  return provider === 'openrouter' ? modelId : modelRef
}

/**
 * The concrete model slug this app model ref resolves to on the route the
 * harness will actually take (backend sentinel → product default; direct
 * turing-machine → the driver default; explicit provider refs pass through).
 *
 * Split out of {@link resolveTuringLlmConfig} because reading the slug must not
 * read the credentials: the composer's context meter calls this on every
 * session change, and a meter poll has no business touching the token store.
 */
export function resolveTuringModelSlug(modelRef: string): string {
  const parsed = parseModelRef(modelRef)
  const provider = parsed?.provider ?? 'openrouter'
  const modelId = parsed?.modelId ?? modelRef

  if (!isDirectOpenRouterEnabled()) return backendModelSlug(provider, modelId, modelRef)
  if (provider === 'turing-machine') return DIRECT_OPENROUTER_FALLBACK_MODEL
  // `openrouter/<slug>` -> `<slug>`; other providers are already OpenRouter slugs.
  return provider === 'openrouter' ? modelId : modelRef
}

export function resolveTuringLlmConfig(modelRef: string): TuringLlmConfig {
  const provider = parseModelRef(modelRef)?.provider ?? 'openrouter'
  const modelSlug = resolveTuringModelSlug(modelRef)

  if (!isDirectOpenRouterEnabled()) {
    return {
      // The harness appends `/chat/completions`, landing on the backend route.
      baseUrl: resolveTuringMachineBaseUrl(),
      apiKey: resolveBackendToken(),
      modelSlug,
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
      modelSlug,
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
    modelSlug,
    escalationModelSlug: firstNonEmpty(env.OPENWAGGLE_TURING_ESCALATION_MODEL),
  }
}
