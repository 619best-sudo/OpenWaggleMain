/**
 * Turing-backed {@link ProviderProbeService}.
 *
 * Replaces Pi's in-memory session probe. Probing is a single chat-completions
 * call, sent to whichever endpoint an actual run would use — so a passing test
 * genuinely means runs will work.
 *
 * By default that endpoint is the turing-machine backend, authenticated with the
 * user's JWT, which means testing a connection no longer transmits a provider key
 * to openrouter.ai. Under `OPENWAGGLE_DIRECT_OPENROUTER` it probes OpenRouter
 * directly with the stored provider key, matching the direct run path.
 */

import { Layer } from 'effect'
import * as Effect from 'effect/Effect'
import { env } from '../../../env'
import { ProviderProbeService } from '../../../ports/provider-probe-service'
import { resolveTuringMachineBaseUrl } from '../../pi/pi-provider-catalog'
import { isDirectOpenRouterEnabled, resolveBackendToken } from '../turing-llm-config'
import { readStoredApiKey } from './turing-credentials'

const PROVIDER_PROBE_PROMPT = 'Reply with exactly OK and nothing else.'
const PROVIDER_PROBE_TIMEOUT_MS = 15_000
const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

/**
 * Resolve the endpoint + bearer token for a probe, mirroring
 * `resolveTuringLlmConfig` so the probe exercises the real run path.
 *
 * In backend mode an explicit `apiKeyOverride` (the key the user just typed into
 * the Connections screen) is deliberately ignored: the backend authenticates the
 * *user*, not a provider key, so there is nothing for that value to validate.
 */
function resolveProbeCredentials(providerId: string, apiKeyOverride?: string) {
  if (!isDirectOpenRouterEnabled()) {
    return { apiKey: resolveBackendToken(), baseUrl: resolveTuringMachineBaseUrl(), backend: true }
  }
  const stored =
    providerId === 'turing-machine'
      ? readStoredApiKey('openrouter')
      : (readStoredApiKey(providerId) ?? readStoredApiKey('openrouter'))
  const apiKey =
    apiKeyOverride?.trim() ||
    stored ||
    env.OPENWAGGLE_OPENROUTER_API_KEY ||
    env.OPENROUTER_API_KEY ||
    ''
  const baseUrl =
    env.OPENWAGGLE_OPENROUTER_BASE_URL || env.OPENROUTER_BASE_URL || DEFAULT_OPENROUTER_BASE_URL
  return { apiKey, baseUrl, backend: false }
}

/** Message for a missing credential, named for whichever path is in play. */
function missingCredentialError(backend: boolean): Error {
  return new Error(
    backend
      ? 'Not signed in — sign in to use the Turing Machine backend, or set OPENWAGGLE_TURING_MACHINE_TOKEN.'
      : 'No API key configured for this provider',
  )
}

async function callOpenRouterChat(input: {
  baseUrl: string
  apiKey: string
  model: string
  prompt: string
  timeoutMs: number
}): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), input.timeoutMs)
  try {
    const response = await fetch(`${input.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        messages: [{ role: 'user', content: input.prompt }],
        max_tokens: 16,
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Provider responded ${response.status}: ${body.slice(0, 200)}`)
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    return payload.choices?.[0]?.message?.content?.trim() ?? ''
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Map a `(providerId, modelId)` probe request to the slug to send. Catalogued
 * providers store the full upstream slug in `modelId` already. `turing-machine`
 * becomes the backend sentinel (backend picks the model), or — on the direct
 * path, where no such sentinel exists — the same fallback the harness uses.
 */
function resolveModelSlug(providerId: string, modelId: string): string {
  if (providerId === 'turing-machine') {
    return isDirectOpenRouterEnabled() ? 'xiaomi/mimo-v2.5' : 'turing-machine'
  }
  return modelId
}

export const TuringProviderProbeLive = Layer.succeed(
  ProviderProbeService,
  ProviderProbeService.of({
    probeCredentials: (input) =>
      Effect.tryPromise({
        try: async () => {
          const { apiKey, baseUrl, backend } = resolveProbeCredentials(
            input.providerId,
            input.apiKey,
          )
          if (!apiKey) {
            throw missingCredentialError(backend)
          }
          await callOpenRouterChat({
            baseUrl,
            apiKey,
            model: resolveModelSlug(input.providerId, input.modelId),
            prompt: PROVIDER_PROBE_PROMPT,
            timeoutMs: PROVIDER_PROBE_TIMEOUT_MS,
          })
        },
        catch: (error) => {
          if (error instanceof Error && error.name === 'AbortError') {
            return new Error('Provider test timed out')
          }
          return error instanceof Error ? error : new Error(String(error))
        },
      }),

    generateText: (input) =>
      Effect.tryPromise({
        try: async () => {
          const { apiKey, baseUrl, backend } = resolveProbeCredentials(input.providerId)
          if (!apiKey) {
            throw missingCredentialError(backend)
          }
          const text = await callOpenRouterChat({
            baseUrl,
            apiKey,
            model: resolveModelSlug(input.providerId, input.modelId),
            prompt: input.prompt,
            timeoutMs: PROVIDER_PROBE_TIMEOUT_MS,
          })
          return text
        },
        catch: (error) => {
          if (error instanceof Error && error.name === 'AbortError') {
            return new Error('Provider generation timed out')
          }
          return error instanceof Error ? error : new Error(String(error))
        },
      }),
  }),
)
