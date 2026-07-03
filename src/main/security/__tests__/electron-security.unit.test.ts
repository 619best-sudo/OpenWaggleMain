import { describe, expect, it, vi } from 'vitest'
import {
  applySecurityHeaders,
  assertSecureWebPreferences,
  buildContentSecurityPolicy,
  CONTENT_SECURITY_POLICY,
  installCspHeaders,
  SECURE_WEB_PREFERENCES,
} from '../electron-security'

function createSecurePreferences() {
  return {
    ...SECURE_WEB_PREFERENCES,
  }
}

describe('assertSecureWebPreferences', () => {
  it('accepts secure preferences', () => {
    expect(() => assertSecureWebPreferences(createSecurePreferences())).not.toThrow()
  })

  it('throws when a required preference is insecure', () => {
    const cases = [
      {
        preference: 'nodeIntegration',
        expected: false,
        actual: true,
      },
      {
        preference: 'contextIsolation',
        expected: true,
        actual: false,
      },
      {
        preference: 'sandbox',
        expected: true,
        actual: false,
      },
      {
        preference: 'webSecurity',
        expected: true,
        actual: false,
      },
      {
        preference: 'allowRunningInsecureContent',
        expected: false,
        actual: true,
      },
    ] as const

    for (const testCase of cases) {
      const insecurePreferences = {
        ...createSecurePreferences(),
        [testCase.preference]: testCase.actual,
      }

      expect(() => assertSecureWebPreferences(insecurePreferences)).toThrow(
        `Insecure BrowserWindow webPreferences: "${testCase.preference}" must be ${String(testCase.expected)}, received ${String(testCase.actual)}.`,
      )
    }
  })
})

describe('buildContentSecurityPolicy', () => {
  it('returns the expected directives', () => {
    expect(buildContentSecurityPolicy()).toBe(CONTENT_SECURITY_POLICY)
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'self'")
    expect(CONTENT_SECURITY_POLICY).toContain(
      "script-src 'self' 'sha256-Z2/iFzh9VMlVkEOar1f/oSHWwQk3ve1qk/C2WdsC4Xk='",
    )
    expect(CONTENT_SECURITY_POLICY).toContain(
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    )
    expect(CONTENT_SECURITY_POLICY).toContain("font-src 'self' https://fonts.gstatic.com")
    expect(CONTENT_SECURITY_POLICY).toContain("img-src 'self' data:")
    expect(CONTENT_SECURITY_POLICY).toContain(
      "connect-src 'self' ws://localhost:* http://localhost:* https://localhost:* wss://localhost:* ws://127.0.0.1:* http://127.0.0.1:* https://127.0.0.1:* wss://127.0.0.1:*",
    )
  })
})

describe('applySecurityHeaders', () => {
  it('adds the security headers while preserving existing response headers', () => {
    const updatedHeaders = applySecurityHeaders({ 'X-Test': ['ok'] })

    expect(updatedHeaders).toMatchObject({
      'X-Test': ['ok'],
      'Content-Security-Policy': [CONTENT_SECURITY_POLICY],
      'Cross-Origin-Opener-Policy': ['same-origin-allow-popups'],
      'Referrer-Policy': ['no-referrer-when-downgrade'],
    })
  })
})

describe('installCspHeaders', () => {
  it('registers a single headers handler per session', () => {
    const onHeadersReceived = vi.fn()

    const session = {
      webRequest: {
        onHeadersReceived,
      },
    }

    installCspHeaders(session)
    installCspHeaders(session)

    expect(onHeadersReceived).toHaveBeenCalledOnce()
  })

  it('returns original headers for URLs outside the trusted matcher', () => {
    const onHeadersReceived = vi.fn()
    const session = {
      webRequest: {
        onHeadersReceived,
      },
    }

    installCspHeaders(session, (url) => url.startsWith('http://localhost:5173'))

    const callback = vi.fn()
    const handler = onHeadersReceived.mock.calls[0]?.[0]

    expect(handler).toBeTypeOf('function')

    handler?.({ url: 'https://example.com/login' }, callback)

    expect(callback).toHaveBeenCalledWith({
      responseHeaders: undefined,
    })
  })
})
