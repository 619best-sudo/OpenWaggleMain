/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_AUTH_BASE_URL?: string
  readonly VITE_ACCOUNT_WEBSITE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
