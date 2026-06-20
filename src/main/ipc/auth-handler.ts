import { readFileSync } from 'node:fs'
import type { OAuthFlowStatus } from '@shared/types/auth'
import { isOAuthProvider } from '@shared/types/auth'
import * as Effect from 'effect/Effect'
import { BrowserWindow } from 'electron'
import {
  cancelOAuth,
  disconnect,
  getAccountInfo,
  startAuthLifecycle,
  startOAuth,
  submitCode,
} from '../auth'
import { ProviderAuthService } from '../ports/provider-auth-service'
import { ProviderOAuthService } from '../ports/provider-oauth-service'
import { typedHandle } from './typed-ipc'

function broadcastOAuthStatus(status: OAuthFlowStatus) {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('auth:oauth-status', status)
  }
}

function validateOAuthProvider(provider: string) {
  return Effect.gen(function* () {
    if (!isOAuthProvider(provider)) {
      return yield* Effect.fail(new Error(`Invalid OAuth provider: ${provider}`))
    }

    const oauthService = yield* ProviderOAuthService
    const providers = yield* oauthService.listProviders()
    if (!providers.includes(provider)) {
      return yield* Effect.fail(new Error(`Provider does not support OAuth: ${provider}`))
    }

    return provider
  })
}

let stopAuthLifecycle: (() => void) | null = null

function reportDebugEvent(input: {
  readonly hypothesisId: string
  readonly location: string
  readonly msg: string
  readonly data: Record<string, unknown>
}) {
  // #region debug-point D:auth-handler-report
  let debugServerUrl = 'http://127.0.0.1:7777/event'
  let sessionId = 'openrouter-key-save'
  try {
    const envContent = readFileSync('.dbg/openrouter-key-save.env', 'utf8')
    debugServerUrl = envContent.match(/DEBUG_SERVER_URL=(.+)/)?.[1]?.trim() ?? debugServerUrl
    sessionId = envContent.match(/DEBUG_SESSION_ID=(.+)/)?.[1]?.trim() ?? sessionId
  } catch {}
  fetch(debugServerUrl, {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      runId: 'pre-fix',
      hypothesisId: input.hypothesisId,
      location: input.location,
      msg: input.msg,
      data: input.data,
      ts: Date.now(),
    }),
  }).catch(() => {})
  // #endregion
}

export function registerAuthHandlers(): void {
  if (stopAuthLifecycle) stopAuthLifecycle()
  stopAuthLifecycle = startAuthLifecycle(broadcastOAuthStatus)

  typedHandle('auth:start-oauth', (_event, provider: string) =>
    Effect.gen(function* () {
      const validated = yield* validateOAuthProvider(provider)
      yield* Effect.promise(() => startOAuth(validated, broadcastOAuthStatus))
    }),
  )

  typedHandle('auth:submit-code', (_event, provider: string, code: string) =>
    Effect.gen(function* () {
      const validated = yield* validateOAuthProvider(provider)
      submitCode(validated, code)
    }),
  )

  typedHandle('auth:cancel-oauth', (_event, provider: string) =>
    Effect.gen(function* () {
      const validated = yield* validateOAuthProvider(provider)
      yield* Effect.promise(() => cancelOAuth(validated, broadcastOAuthStatus))
    }),
  )

  typedHandle('auth:set-api-key', (_event, provider: string, apiKey: string) =>
    Effect.gen(function* () {
      reportDebugEvent({
        hypothesisId: 'D',
        location: 'auth-handler.ts:auth:set-api-key:entry',
        msg: '[DEBUG] Main auth handler received API key save request',
        data: {
          provider,
          apiKeyLength: apiKey.length,
        },
      })
      const providerAuth = yield* ProviderAuthService
      yield* providerAuth.setApiKey(provider, apiKey).pipe(
        Effect.tap(() =>
          Effect.sync(() =>
            reportDebugEvent({
              hypothesisId: 'D',
              location: 'auth-handler.ts:auth:set-api-key:success',
              msg: '[DEBUG] Main auth handler completed API key save request',
              data: { provider },
            }),
          ),
        ),
        Effect.tapError((error) =>
          Effect.sync(() =>
            reportDebugEvent({
              hypothesisId: 'B',
              location: 'auth-handler.ts:auth:set-api-key:error',
              msg: '[DEBUG] Main auth handler failed API key save request',
              data: {
                provider,
                error: error instanceof Error ? error.message : String(error),
              },
            }),
          ),
        ),
      )
    }),
  )

  typedHandle('auth:disconnect', (_event, provider: string) =>
    Effect.gen(function* () {
      const validated = yield* validateOAuthProvider(provider)
      yield* Effect.promise(() => disconnect(validated))
      broadcastOAuthStatus({ type: 'idle' })
    }),
  )

  typedHandle('auth:get-account-info', (_event, provider: string) =>
    Effect.gen(function* () {
      const validated = yield* validateOAuthProvider(provider)
      return yield* Effect.promise(() => getAccountInfo(validated))
    }),
  )
}
