/**
 * Turing-native provider credential store.
 *
 * Replaces Pi's `AuthStorage` (which persisted to `~/.pi/agent/auth.json`) with an
 * OpenWaggle-owned JSON file under `<userData>/credentials.json`. Both the provider
 * auth service and the turing LLM config resolve provider API keys through this module.
 *
 * The store is intentionally simple: a flat `{ [providerId]: { type: 'api_key', key } }`
 * map written atomically on each change. Reads are best-effort and never throw — a
 * missing/corrupt file is treated as "no credentials configured".
 */
import { mkdir } from 'node:fs/promises'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'

const CREDENTIALS_FILE_NAME = 'credentials.json'

export interface StoredCredential {
  readonly type: 'api_key'
  readonly key: string
}

type CredentialMap = Record<string, StoredCredential>

let cachedPath: string | null = null

/**
 * Resolve the credentials file path. Exposed for tests, which may pass an override.
 * Reads from `app.getPath('userData')` lazily so importing this module never touches
 * the Electron app before it is ready.
 */
export function resolveCredentialsFilePath(
  overrideUserDataPath: string | null = null,
): string {
  if (overrideUserDataPath) {
    return join(overrideUserDataPath, CREDENTIALS_FILE_NAME)
  }
  if (!cachedPath) {
    cachedPath = join(app.getPath('userData'), CREDENTIALS_FILE_NAME)
  }
  return cachedPath
}

function readCredentialMap(filePath: string): CredentialMap {
  try {
    const raw = readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as CredentialMap
    }
  } catch {
    // Missing or corrupt file — treat as empty.
  }
  return {}
}

function writeCredentialMap(filePath: string, map: CredentialMap): void {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(map, null, 2), 'utf8')
}

/**
 * Read a provider's stored API key, if present. Never throws.
 */
export function readStoredApiKey(
  providerId: string,
  overrideUserDataPath: string | null = null,
): string | undefined {
  const map = readCredentialMap(resolveCredentialsFilePath(overrideUserDataPath))
  const credential = map[providerId]
  if (credential?.type === 'api_key' && credential.key.trim().length > 0) {
    return credential.key.trim()
  }
  return undefined
}

/**
 * Whether any credential is stored for the provider (regardless of type validity).
 */
export function hasStoredApiKey(
  providerId: string,
  overrideUserDataPath: string | null = null,
): boolean {
  return readStoredApiKey(providerId, overrideUserDataPath) !== undefined
}

/**
 * Persist (or, when `apiKey` is blank, remove) a provider API key. Never throws on
 * the read path; write failures propagate so callers can surface them.
 */
export async function writeStoredApiKey(
  providerId: string,
  apiKey: string,
  overrideUserDataPath: string | null = null,
): Promise<void> {
  const filePath = resolveCredentialsFilePath(overrideUserDataPath)
  const map = readCredentialMap(filePath)
  const trimmedKey = apiKey.trim()
  if (trimmedKey) {
    map[providerId] = { type: 'api_key', key: trimmedKey }
  } else {
    delete map[providerId]
  }
  // Ensure the directory exists before writing.
  await mkdir(dirname(filePath), { recursive: true })
  writeCredentialMap(filePath, map)
}
