import type { OpenWaggleApi } from '@shared/types/ipc'

declare global {
  interface Window {
    api: OpenWaggleApi
  }
}

type RendererImportMeta = ImportMeta & {
  readonly env?: {
    readonly DEV?: boolean
    readonly VITE_APP_AUTH_BASE_URL?: string
    readonly VITE_ACCOUNT_WEBSITE_URL?: string
  }
}

const viteEnv = (import.meta as RendererImportMeta).env
const isElectron = typeof window !== 'undefined' && window.api !== undefined
const isDevelopment =
  viteEnv?.DEV === true ||
  (typeof window !== 'undefined' &&
    window.location.protocol !== 'file:' &&
    window.location.protocol !== 'openwaggle:')
const logLevel = 'info'
const configuredAuthBaseUrl = viteEnv?.VITE_APP_AUTH_BASE_URL?.trim() || null
const appAuthBaseUrl =
  configuredAuthBaseUrl ?? (isDevelopment || isElectron ? 'http://127.0.0.1:3001' : null)
const DEFAULT_ACCOUNT_WEBSITE_URL = 'https://account.turing.app'

function normalizeConfiguredUrl(value: string | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) return null

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

const accountWebsiteUrl =
  normalizeConfiguredUrl(viteEnv?.VITE_ACCOUNT_WEBSITE_URL) ?? DEFAULT_ACCOUNT_WEBSITE_URL

export const env = {
  appAuthBaseUrl,
  accountWebsiteUrl,
  isDevelopment,
  isElectron,
  logLevel,
} as const
