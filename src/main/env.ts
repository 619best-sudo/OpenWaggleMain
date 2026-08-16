import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { decodeUnknownOrThrow, Schema, type SchemaType } from '@shared/schema'

const optionalUrlSchema = Schema.optional(
  Schema.String.pipe(
    Schema.filter((value) => {
      try {
        // URL constructor normalizes and validates the shape for us.
        new URL(value)
        return true
      } catch {
        return 'Must be a valid URL.'
      }
    }),
  ),
)

const envSchema = Schema.Struct({
  ELECTRON_RENDERER_URL: optionalUrlSchema,
  OPENWAGGLE_USER_DATA_DIR: Schema.optional(Schema.String),
  OPENWAGGLE_DISABLE_SINGLE_INSTANCE: Schema.optional(Schema.String),
  OPENWAGGLE_LOG_LEVEL: Schema.optional(Schema.Literal('debug', 'info', 'warn', 'error')),
  OPENWAGGLE_APP_AUTH_GOOGLE_DESKTOP_CLIENT_ID: Schema.optional(Schema.String),
  OPENWAGGLE_APP_AUTH_GOOGLE_DESKTOP_CLIENT_SECRET: Schema.optional(Schema.String),
  /**
   * Escape hatch: when truthy ('1' | 'true' | 'yes' | 'on'), ALL model traffic
   * bypasses the turing-machine backend and goes straight to OpenRouter with a
   * user-supplied key — chat completions, the connection probe, image generation
   * and vision analysis alike.
   *
   * Default (unset/falsy) is backend-only: everything is proxied through
   * `/turing-machine/*` so calls are JWT-authenticated, quota-checked and billed
   * centrally, and no OpenRouter key ever leaves the backend. Intended for
   * offline/dev debugging when the backend is not running.
   */
  OPENWAGGLE_DIRECT_OPENROUTER: Schema.optional(Schema.String),
  OPENWAGGLE_OPENROUTER_API_KEY: Schema.optional(Schema.String),
  OPENROUTER_API_KEY: Schema.optional(Schema.String),
  OPENWAGGLE_OPENROUTER_BASE_URL: optionalUrlSchema,
  OPENROUTER_BASE_URL: optionalUrlSchema,
  OPENWAGGLE_TURING_MODE: Schema.optional(
    Schema.Literal('chain', 'prepare', 'plan', 'perform', 'perfect'),
  ),
  /**
   * OpenRouter slug of the STRONGER model turing-harness escalates to when a call
   * is judged too complex for the run's own model: it comprehends files the staged
   * `read` rates hard, and authors the bytes for high-complexity write/edit calls.
   * Unset ⇒ no escalation (single-model behavior).
   */
  OPENWAGGLE_TURING_ESCALATION_MODEL: Schema.optional(Schema.String),
  /**
   * Which provider backs `assets_generator`. Defaults to 'turing' — image
   * generation goes through the backend `/turing-machine/images` proxy (JWT auth
   * + central billing). Set explicitly to 'openrouter' (or enable
   * `OPENWAGGLE_DIRECT_OPENROUTER`) to call OpenRouter directly instead.
   */
  OPENWAGGLE_ASSET_PROVIDER: Schema.optional(Schema.Literal('turing', 'openrouter', 'runware')),
  /** Image-OUTPUT capable model slug used for asset generation. */
  OPENWAGGLE_IMAGE_GEN_MODEL: Schema.optional(Schema.String),
  /**
   * Media-INPUT capable (multimodal) model slug used by the `media_analysis`
   * tool. Distinct from `OPENWAGGLE_IMAGE_GEN_MODEL` (which generates images) and
   * from the run's own model — the default run model is text-only, so vision must
   * be pinned separately or the tool sends images to a model that cannot see them.
   */
  OPENWAGGLE_VISION_MODEL: Schema.optional(Schema.String),
})

export type Env = SchemaType<typeof envSchema>

export const env: Env = decodeUnknownOrThrow(envSchema, loadMainProcessEnv())

export const logLevel = env.OPENWAGGLE_LOG_LEVEL ?? 'info'

const MACOS_NPM_COMPATIBLE_PATH_DIRS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
]
const POSIX_NPM_COMPATIBLE_PATH_DIRS = ['/usr/local/bin', '/usr/bin', '/bin']
const POSIX_USER_TOOL_PATH_SEGMENTS = [
  ['.local', 'bin'],
  ['.volta', 'bin'],
  ['.asdf', 'shims'],
  ['.mise', 'shims'],
  ['.cargo', 'bin'],
  ['.bun', 'bin'],
  ['.deno', 'bin'],
] as const
const MACOS_USER_TOOL_PATH_SEGMENTS = [['Library', 'pnpm']] as const

let temporaryProcessEnvQueue: Promise<void> = Promise.resolve()

function loadMainProcessEnv() {
  const mode = process.env.NODE_ENV ?? 'development'
  const mergedEnv = { ...process.env }

  for (const filePath of getEnvFilePaths(mode)) {
    if (!existsSync(filePath)) {
      continue
    }

    for (const [key, value] of Object.entries(parseEnvFile(readFileSync(filePath, 'utf8')))) {
      if (mergedEnv[key] === undefined) {
        mergedEnv[key] = value
      }
    }
  }

  return mergedEnv
}

/**
 * Env files are searched in this order; the FIRST value found for a key wins
 * (see `loadMainProcessEnv` — it only fills keys that are still undefined), and
 * a real process env var always beats a file.
 *
 * The `process.cwd()` entries only ever resolve during development, where cwd is
 * the repo root. A packaged app's cwd is whatever directory it was launched from
 * — `/` when opened from Finder — and can never point inside `app.asar`. So a
 * packaged build has no access to the repo's `.env.local` no matter what the
 * packaging config includes, which is why bundling it into the asar looked like
 * configuration but did nothing.
 *
 * `app.env` in the app's Resources directory is the packaged equivalent: it sits
 * beside `app.asar` at a real filesystem path, so it is actually readable at
 * runtime. It is a CURATED file — put only the keys the shipped app needs in it
 * (see `build/app.env`), never a copy of `.env.local`.
 *
 * Note this file travels inside the distributed app, so anything in it is
 * recoverable by unzipping the app. Keys that must stay private belong on the
 * backend, not here.
 */
export function getEnvFilePaths(mode: string) {
  const paths = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), `.env.${mode}`),
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), `.env.${mode}.local`),
  ]

  // Undefined outside a packaged Electron app (plain node, tests).
  if (typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0) {
    paths.push(resolve(process.resourcesPath, 'app.env'))
  }

  return paths
}

function parseEnvFile(contents: string) {
  const result: Record<string, string> = {}

  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const equalsIndex = line.indexOf('=')
    if (equalsIndex <= 0) {
      continue
    }

    const key = line.slice(0, equalsIndex).trim()
    if (!key) {
      continue
    }

    const rawValue = line.slice(equalsIndex + 1).trim()
    result[key] = normalizeEnvValue(rawValue)
  }

  return result
}

function normalizeEnvValue(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

/**
 * Safe environment for child processes.
 * Only passes through essential variables — prevents leaking API keys,
 * secrets, or other sensitive values from the parent process.
 */
export function getSafeChildEnv(): Record<string, string | undefined> {
  return {
    PATH: getNpmCompatiblePath(),
    HOME: process.env.HOME,
    SHELL: process.env.SHELL,
    TERM: process.env.TERM,
    LANG: process.env.LANG,
    USER: process.env.USER,
    TMPDIR: process.env.TMPDIR,
  }
}

/**
 * Environment for `gh` CLI calls.
 * Strips GITHUB_TOKEN / GH_TOKEN so `gh` uses its keyring-stored OAuth
 * credentials from `gh auth login` — the standard setup for end users.
 * Inherited env tokens (e.g. from CI or dev tooling) can cause permission
 * mismatches with the target org's token policies.
 */
export function getGhCliEnv(): Record<string, string | undefined> {
  const env = { ...process.env }
  delete env.GITHUB_TOKEN
  delete env.GH_TOKEN
  env.PATH = getNpmCompatiblePath()
  return env
}

export function getNpmCompatiblePath(): string {
  const result: string[] = []
  const seen = new Set<string>()

  function addPath(value: string | undefined) {
    if (!value || seen.has(value)) {
      return
    }
    seen.add(value)
    result.push(value)
  }

  // Preserve user PATH precedence; extra directories are fallbacks for GUI-launched apps.
  for (const value of (process.env.PATH ?? '').split(delimiter)) {
    addPath(value)
  }

  for (const value of getUserToolPathDirs()) {
    addPath(value)
  }

  for (const value of getNpmCompatiblePathDirs()) {
    addPath(value)
  }

  return result.join(delimiter)
}

function getNpmCompatiblePathDirs() {
  if (process.platform === 'darwin') {
    return MACOS_NPM_COMPATIBLE_PATH_DIRS
  }
  if (process.platform === 'win32') {
    return []
  }
  return POSIX_NPM_COMPATIBLE_PATH_DIRS
}

function getUserToolPathDirs() {
  if (process.platform === 'win32') {
    return []
  }

  const homeDir = homedir()
  const pathSegments =
    process.platform === 'darwin'
      ? [...MACOS_USER_TOOL_PATH_SEGMENTS, ...POSIX_USER_TOOL_PATH_SEGMENTS]
      : POSIX_USER_TOOL_PATH_SEGMENTS
  return pathSegments.map((segments) => join(homeDir, ...segments))
}

export async function withNpmCompatibleProcessEnv<T>(operation: () => Promise<T>): Promise<T> {
  return withTemporaryProcessEnv({ PATH: getNpmCompatiblePath() }, operation)
}

export async function withTemporaryProcessEnv<T>(
  overrides: Readonly<Record<string, string>>,
  operation: () => Promise<T>,
): Promise<T> {
  const release = await acquireTemporaryProcessEnvLock()
  const previousValues = new Map<string, string | undefined>()

  for (const [key, value] of Object.entries(overrides)) {
    previousValues.set(key, process.env[key])
    process.env[key] = value
  }

  try {
    return await operation()
  } finally {
    for (const [key, previousValue] of previousValues) {
      if (previousValue === undefined) {
        delete process.env[key]
        continue
      }
      process.env[key] = previousValue
    }
    release()
  }
}

async function acquireTemporaryProcessEnvLock() {
  const previous = temporaryProcessEnvQueue
  let releaseCurrent: (() => void) | undefined
  temporaryProcessEnvQueue = new Promise<void>((resolve) => {
    releaseCurrent = resolve
  })
  await previous
  return () => releaseCurrent?.()
}
