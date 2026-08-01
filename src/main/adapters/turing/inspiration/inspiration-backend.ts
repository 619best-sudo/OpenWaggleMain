/**
 * Harness backend for the `inspiration_generator` tool.
 *
 * Adapts {@link fetchInspirationByKeywords} to the harness's
 * {@link InspirationBackend} interface — the part the harness owns is "look up
 * a blueprint by keywords, or null"; the part OpenWaggle owns is "how to get a
 * token and where the backend lives".
 *
 * Token resolution uses `readStoredApiKey('turing-machine')`, the credential
 * slot the renderer populates after login/refresh (see
 * `app-auth-store.syncAppSessionProviderToken` → IPC `auth:set-api-key` →
 * `turing-credentials.ts`). The main process cannot refresh a JWT, so the key
 * is read per-call to pick up the renderer's periodic refresh. No token ⇒ the
 * backend returns `null` (the tool then reports "no match" and continues).
 */
import type {
  InspirationBackend,
  InspirationBackendInput,
  InspirationBackendResult,
} from 'turing-harness'
import { readStoredApiKey } from '../providers/turing-credentials'
import { createLogger } from '../../../logger'
import { fetchInspirationByKeywords } from './inspiration-client'

const logger = createLogger('inspiration-backend')

/** The credential slot holding the user JWT (see module doc). */
const TURING_MACHINE_CREDENTIAL_KEY = 'turing-machine'

export interface CreateInspirationBackendOptions {
  /** Override base URL (default: resolveTuringMachineBaseUrl()). */
  readonly baseUrl?: string
  /** Override the credential slot read for the JWT. */
  readonly credentialKey?: string
  readonly timeoutMs?: number
}

function resolveToken(credentialKey: string): string | undefined {
  // readStoredApiKey never throws; returns undefined when absent/invalid.
  return readStoredApiKey(credentialKey)
}

/**
 * Build the harness-facing backend. Returns `null` when there is no token or no
 * match, so the tool silently skips inspiration and the run continues.
 */
export function createInspirationBackend(
  options: CreateInspirationBackendOptions = {},
): InspirationBackend {
  const baseUrl = options.baseUrl
  const credentialKey = options.credentialKey ?? TURING_MACHINE_CREDENTIAL_KEY
  const timeoutMs = options.timeoutMs

  return async (input: InspirationBackendInput): Promise<InspirationBackendResult | null> => {
    const token = resolveToken(credentialKey)
    if (!token) {
      logger.debug('No stored turing-machine token; skipping inspiration lookup')
      return null
    }

    // The client returns { sections: [...] } or null; that maps 1:1 to the
    // harness's InspirationBackendResult (the blueprint type is shared via the
    // harness package, so no nominal mismatch).
    return fetchInspirationByKeywords({
      keywords: input.keywords,
      kind: input.kind,
      sections: input.sections,
      baseUrl,
      token,
      timeoutMs,
      signal: input.ctx?.signal,
    })
  }
}
