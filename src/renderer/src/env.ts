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
const appAuthBaseUrl = configuredAuthBaseUrl ?? (isDevelopment ? 'http://localhost:3000' : null)

export const env = {
  appAuthBaseUrl,
  isDevelopment,
  isElectron,
  logLevel,
} as const
