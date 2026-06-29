import type { Session, WebPreferences } from 'electron'

const SECURITY_PREFERENCE_EXPECTATIONS = [
  { key: 'nodeIntegration', expected: false },
  { key: 'contextIsolation', expected: true },
  { key: 'sandbox', expected: true },
  { key: 'webSecurity', expected: true },
  { key: 'allowRunningInsecureContent', expected: false },
] as const

const DIRECTIVE_SEPARATOR = '; '
const VALUE_SEPARATOR = ' '
// Vite React injects a deterministic inline preamble script in dev.
// Allow only that exact script hash so dev boot works without enabling broad unsafe-inline.
const VITE_REACT_PREAMBLE_HASH = "'sha256-Z2/iFzh9VMlVkEOar1f/oSHWwQk3ve1qk/C2WdsC4Xk='" as const
const SCRIPT_SRC_VALUES = ["'self'", VITE_REACT_PREAMBLE_HASH] as const
const STYLE_SRC_VALUES = ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'] as const
const FONT_SRC_VALUES = ["'self'", 'https://fonts.gstatic.com'] as const
const IMG_SRC_VALUES = ["'self'", 'data:'] as const
const CONNECT_SRC_VALUES = [
  "'self'",
  'ws://localhost:*',
  'http://localhost:*',
  'https://localhost:*',
  'wss://localhost:*',
] as const

const CSP_DIRECTIVES = [
  ['default-src', ["'self'"]],
  ['script-src', SCRIPT_SRC_VALUES],
  ['style-src', STYLE_SRC_VALUES],
  ['font-src', FONT_SRC_VALUES],
  ['img-src', IMG_SRC_VALUES],
  ['connect-src', CONNECT_SRC_VALUES],
] as const

type CspResponseHeaders = Record<string, string[] | string>
type HeadersMatcher = (url: string) => boolean
const CROSS_ORIGIN_OPENER_POLICY = 'same-origin-allow-popups' as const
const REFERRER_POLICY = 'no-referrer-when-downgrade' as const

export const SECURE_WEB_PREFERENCES: Readonly<
  Pick<
    WebPreferences,
    | 'nodeIntegration'
    | 'contextIsolation'
    | 'sandbox'
    | 'webSecurity'
    | 'allowRunningInsecureContent'
  >
> = {
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
}

type SessionWithHeadersHandler = {
  webRequest: Pick<Session['webRequest'], 'onHeadersReceived'>
}

const sessionCspInstallState = new WeakSet<SessionWithHeadersHandler>()

export function buildContentSecurityPolicy(): string {
  return CSP_DIRECTIVES.map(([name, values]) => `${name} ${values.join(VALUE_SEPARATOR)}`).join(
    DIRECTIVE_SEPARATOR,
  )
}

export const CONTENT_SECURITY_POLICY = buildContentSecurityPolicy()

export function applySecurityHeaders(
  responseHeaders: CspResponseHeaders | undefined,
): CspResponseHeaders {
  return {
    ...(responseHeaders ?? {}),
    'Content-Security-Policy': [CONTENT_SECURITY_POLICY],
    'Cross-Origin-Opener-Policy': [CROSS_ORIGIN_OPENER_POLICY],
    'Referrer-Policy': [REFERRER_POLICY],
  }
}

export function assertSecureWebPreferences(preferences: WebPreferences): void {
  for (const expectation of SECURITY_PREFERENCE_EXPECTATIONS) {
    const actualValue = preferences[expectation.key]
    if (actualValue !== expectation.expected) {
      throw new Error(
        `Insecure BrowserWindow webPreferences: "${expectation.key}" must be ${String(expectation.expected)}, received ${String(actualValue)}.`,
      )
    }
  }
}

export function installCspHeaders(
  session: SessionWithHeadersHandler,
  shouldApplyHeaders: HeadersMatcher = () => true,
): void {
  if (sessionCspInstallState.has(session)) {
    return
  }

  session.webRequest.onHeadersReceived((details, callback) => {
    if (!shouldApplyHeaders(details.url)) {
      callback({
        responseHeaders: details.responseHeaders,
      })
      return
    }

    callback({
      responseHeaders: applySecurityHeaders(details.responseHeaders),
    })
  })
  sessionCspInstallState.add(session)
}
