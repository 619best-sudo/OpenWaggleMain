/**
 * Turing-backed {@link ProviderOAuthService}.
 *
 * M1 interim stub. The turing-harness runtime authenticates exclusively via the
 * OpenRouter bearer key (see `turing-llm-config.ts`); it has no OAuth/PKCE support.
 * Until a real OAuth flow is built (M3), this layer reports no OAuth providers and
 * no connected accounts, keeping the renderer's auth UI consistent: providers are
 * API-key/configured only.
 */

import { Layer } from 'effect'
import * as Effect from 'effect/Effect'
import { ProviderOAuthService } from '../../../ports/provider-oauth-service'

export const TuringProviderOAuthLive = Layer.succeed(
  ProviderOAuthService,
  ProviderOAuthService.of({
    listProviders: () => Effect.succeed([]),

    login: () =>
      Effect.fail(new Error('OAuth login is not supported by the turing-harness runtime yet.')),

    logout: () => Effect.void,

    isConnected: () => Effect.succeed(false),

    getAccountInfo: (provider) =>
      Effect.succeed({ provider, connected: false, label: 'Not connected' }),
  }),
)
