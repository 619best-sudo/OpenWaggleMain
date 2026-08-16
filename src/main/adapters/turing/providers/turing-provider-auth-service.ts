/**
 * Turing-backed {@link ProviderAuthService}.
 *
 * Replaces Pi's `AuthStorage`-backed `setPiProviderApiKey`. Persists provider API
 * keys to the OpenWaggle credential store (`turing-credentials.ts`), which the
 * turing LLM config and provider catalog read to resolve keys.
 */

import { Layer } from 'effect'
import * as Effect from 'effect/Effect'
import { ProviderAuthService } from '../../../ports/provider-auth-service'
import { writeStoredApiKey } from './turing-credentials'

export const TuringProviderAuthLive = Layer.succeed(
  ProviderAuthService,
  ProviderAuthService.of({
    setApiKey: (providerId, apiKey) =>
      Effect.tryPromise({
        try: () => {
          const provider = providerId.trim()
          if (!provider) {
            throw new Error('Provider is required')
          }
          return writeStoredApiKey(provider, apiKey)
        },
        catch: (error) => (error instanceof Error ? error : new Error(String(error))),
      }),
  }),
)
