import { createHash, randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { shell } from 'electron'
import { env } from '../env'

const DEFAULT_APP_AUTH_GOOGLE_DESKTOP_CLIENT_ID =
  '917391589321-1cp1n1cffc3ld78voqsbs960c7qjn5pe.apps.googleusercontent.com'
const GOOGLE_AUTHORIZATION_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_AUTH_TIMEOUT_MS = 2 * 60_000
const LOOPBACK_HOST = '127.0.0.1'
const CALLBACK_PATH = '/oauth2callback'

interface LoopbackAuthResult {
  readonly code: string
}

interface LoopbackServer {
  readonly redirectUri: string
  readonly waitForCallback: Promise<LoopbackAuthResult>
  close: () => Promise<void>
}

interface GoogleTokenResponse {
  readonly id_token?: string
  readonly error?: string
  readonly error_description?: string
}

function getGoogleDesktopClientId() {
  return env.OPENWAGGLE_APP_AUTH_GOOGLE_DESKTOP_CLIENT_ID?.trim() || DEFAULT_APP_AUTH_GOOGLE_DESKTOP_CLIENT_ID
}

function getGoogleDesktopClientSecret() {
  return env.OPENWAGGLE_APP_AUTH_GOOGLE_DESKTOP_CLIENT_SECRET?.trim() || null
}

function createRandomBase64Url(size = 32) {
  return randomBytes(size).toString('base64url')
}

function createCodeChallenge(codeVerifier: string) {
  return createHash('sha256').update(codeVerifier).digest('base64url')
}

function decodeJwtPayload(token: string) {
  const [, payload] = token.split('.')
  if (!payload) {
    throw new Error('Google sign-in returned an invalid ID token payload.')
  }

  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>
}

function assertGoogleNonce(idToken: string, expectedNonce: string) {
  const payload = decodeJwtPayload(idToken)
  if (payload.nonce !== expectedNonce) {
    throw new Error('Google sign-in nonce verification failed.')
  }
}

function writeHtmlResponse(
  response: ServerResponse<IncomingMessage>,
  statusCode: number,
  title: string,
  message: string,
) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #050608; color: #fff; }
      main { width: min(28rem, calc(100vw - 2rem)); padding: 1.5rem; border-radius: 1.25rem; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); }
      h1 { margin: 0 0 0.75rem; font-size: 1.125rem; }
      p { margin: 0; color: rgba(255,255,255,0.72); line-height: 1.5; }
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>${message}</p>
    </main>
  </body>
</html>`)
}

async function createLoopbackServer(expectedState: string): Promise<LoopbackServer> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const server = createServer()
  let resolveCallback!: (result: LoopbackAuthResult) => void
  let rejectCallback!: (error: Error) => void

  const waitForCallback = new Promise<LoopbackAuthResult>((resolve, reject) => {
    resolveCallback = resolve
    rejectCallback = reject
  })

  server.on('request', (request, response) => {
    const redirectUri = getRedirectUri(server)
    const requestUrl = new URL(request.url ?? CALLBACK_PATH, redirectUri)
    if (requestUrl.pathname !== CALLBACK_PATH) {
      writeHtmlResponse(response, 404, 'Not Found', 'This callback route is reserved for Google sign-in.')
      return
    }

    const error = requestUrl.searchParams.get('error')
    if (error) {
      writeHtmlResponse(response, 400, 'Google Sign-In Failed', 'Google returned an error. You can close this window.')
      rejectCallback(new Error(`Google sign-in failed: ${error}`))
      return
    }

    const code = requestUrl.searchParams.get('code')
    const state = requestUrl.searchParams.get('state')
    if (!code || !state) {
      writeHtmlResponse(
        response,
        400,
        'Google Sign-In Failed',
        'Google did not return the required authorization data. You can close this window.',
      )
      rejectCallback(new Error('Google sign-in did not return the required authorization data.'))
      return
    }

    if (state !== expectedState) {
      writeHtmlResponse(
        response,
        400,
        'Google Sign-In Failed',
        'The returned sign-in state did not match the request. You can close this window.',
      )
      rejectCallback(new Error('Google sign-in state verification failed.'))
      return
    }

    writeHtmlResponse(
      response,
      200,
      'Google Sign-In Complete',
      'You can close this window and return to OpenWaggle.',
    )
    resolveCallback({ code })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, LOOPBACK_HOST, () => resolve())
  }).catch((error) => {
    throw error instanceof Error ? error : new Error(String(error))
  })

  timeoutId = setTimeout(() => {
    rejectCallback(new Error('Google sign-in timed out before completing in the browser.'))
  }, GOOGLE_AUTH_TIMEOUT_MS)

  return {
    redirectUri: getRedirectUri(server),
    waitForCallback,
    close: () =>
      new Promise<void>((resolve) => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        server.close(() => resolve())
      }),
  }
}

function getRedirectUri(server: ReturnType<typeof createServer>) {
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Google sign-in callback server failed to bind to a loopback port.')
  }

  const { port } = address as AddressInfo
  return `http://${LOOPBACK_HOST}:${port}${CALLBACK_PATH}`
}

async function exchangeCodeForIdToken(input: {
  readonly clientId: string
  readonly clientSecret: string | null
  readonly code: string
  readonly codeVerifier: string
  readonly redirectUri: string
}) {
  const body = new URLSearchParams({
    client_id: input.clientId,
    code: input.code,
    code_verifier: input.codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: input.redirectUri,
  })
  if (input.clientSecret) {
    body.set('client_secret', input.clientSecret)
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  }).catch(() => {
    throw new Error('Unable to reach Google while completing sign-in.')
  })

  const payload = (await response.json().catch(() => null)) as GoogleTokenResponse | null
  if (!response.ok) {
    const errorMessage = payload?.error_description ?? payload?.error ?? 'Google token exchange failed.'
    throw new Error(errorMessage)
  }

  const idToken = payload?.id_token
  if (!idToken) {
    throw new Error('Google sign-in did not return an ID token.')
  }

  return idToken
}

function buildAuthorizationUrl(input: {
  readonly clientId: string
  readonly redirectUri: string
  readonly state: string
  readonly nonce: string
  readonly codeChallenge: string
}) {
  return `${GOOGLE_AUTHORIZATION_URL}?${new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: input.state,
    nonce: input.nonce,
    code_challenge: input.codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'select_account',
  }).toString()}`
}

export async function startGoogleDesktopAuth() {
  const clientId = getGoogleDesktopClientId()
  const clientSecret = getGoogleDesktopClientSecret()
  const state = createRandomBase64Url()
  const nonce = createRandomBase64Url()
  const codeVerifier = createRandomBase64Url(48)
  const codeChallenge = createCodeChallenge(codeVerifier)

  const loopbackServer = await createLoopbackServer(state)
  try {
    const authorizationUrl = buildAuthorizationUrl({
      clientId,
      redirectUri: loopbackServer.redirectUri,
      state,
      nonce,
      codeChallenge,
    })

    await shell.openExternal(authorizationUrl)
    const callback = await loopbackServer.waitForCallback

    const idToken = await exchangeCodeForIdToken({
      clientId,
      clientSecret,
      code: callback.code,
      codeVerifier,
      redirectUri: loopbackServer.redirectUri,
    })
    assertGoogleNonce(idToken, nonce)
    return idToken
  } finally {
    await loopbackServer.close()
  }
}
