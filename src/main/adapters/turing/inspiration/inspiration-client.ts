/**
 * Backend client for the `inspiration_generator` tool.
 *
 * Sends the keywords describing what we are building to the
 * `turing-machine/inspiration/search` endpoint and returns the first matching
 * blueprint (or `null`). Mirrors `fetchToolSelection` in
 * `turing-machine-tool-selection-extension.ts`: global `fetch`, an
 * AbortController with a hard timeout, a Bearer token, and defensive decoding.
 *
 * CRITICAL contract: on ANY failure — network error, non-2xx, empty body,
 * malformed JSON, or no token — this returns `null`. "If nothing is returned,
 * simply ignore it" is the requirement, so this function never throws.
 */
import type {
  InspirationAnimation,
  InspirationAnimationLayer,
  InspirationJson,
  InspirationKeyframe,
} from 'turing-harness'
import { resolveTuringMachineBaseUrl } from '../../pi/pi-provider-catalog'

// Re-export so callers can import the blueprint + animation types from one
// place. The harness's `InspirationJson` is the contract's single source of
// truth, and its typed `animation` (layers, keyframes) is what OpenWaggleMain's
// agent reads to reproduce scroll/parallax motion.
export type {
  InspirationAnimation,
  InspirationAnimationLayer,
  InspirationJson,
  InspirationKeyframe,
}

/** The backend returns an array of section matches (one per requested section). */
const DEFAULT_TIMEOUT_MS = 8000

export interface FetchInspirationInput {
  readonly keywords: string[]
  readonly kind?: 'web-ui' | 'mobile-ui' | 'poster'
  /** Requested section kinds; one blueprint is returned per requested section. */
  readonly sections?: string[]
  /** Full base incl. `/turing-machine` (default: resolveTuringMachineBaseUrl()). */
  readonly baseUrl?: string
  /** Bearer access token (user JWT). No token ⇒ null without a request. */
  readonly token?: string
  readonly timeoutMs?: number
  /** Optional external signal (the harness caller abort); chained into fetch. */
  readonly signal?: AbortSignal
}

/** What a successful lookup returns: zero or more section blueprints. */
export interface FetchInspirationResult {
  readonly sections: InspirationJson[]
}

function normalizeKeywords(value: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of value) {
    const k = String(raw ?? '')
      .trim()
      .toLowerCase()
    if (k && !seen.has(k)) {
      seen.add(k)
      out.push(k)
    }
  }
  return out
}

const INSPIRATION_KINDS = new Set(['web-ui', 'mobile-ui', 'poster'])
const INSPIRATION_CATEGORIES = new Set([
  'navigation',
  'hero',
  'section',
  'footer',
  'background',
])

/**
 * Minimal runtime check for the blueprint's required fields. The backend owns
 * the schema; this only guards against a truncated/empty response so a bad
 * payload is treated as "no match" rather than fed to the tool.
 */
function looksLikeInspiration(value: unknown): value is InspirationJson {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.kind === 'string' &&
    INSPIRATION_KINDS.has(v.kind) &&
    typeof v.category === 'string' &&
    INSPIRATION_CATEGORIES.has(v.category) &&
    typeof v.name === 'string' &&
    v.name.trim().length > 0
  )
}

/** A backend row is the stored entity: it carries its blueprint under `json`. */
function looksLikeInspirationRow(value: unknown): value is { json?: unknown } {
  return typeof value === 'object' && value !== null
}

/**
 * Look up stored section blueprints by keyword overlap. Never throws — returns
 * `null` for any no-match / failure case so the tool can treat "nothing found"
 * and "backend unavailable" identically (proceed without a reference).
 */
export async function fetchInspirationByKeywords(
  input: FetchInspirationInput,
): Promise<FetchInspirationResult | null> {
  const keywords = normalizeKeywords(input.keywords)
  if (keywords.length === 0) return null

  const token = input.token?.trim()
  if (!token) return null

  const baseUrl = input.baseUrl?.trim() || resolveTuringMachineBaseUrl()
  const url = `${baseUrl}/inspiration/search`

  const controller = new AbortController()
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  if (input.signal?.aborted) {
    controller.abort()
  } else {
    input.signal?.addEventListener('abort', () => controller.abort(), { once: true })
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ keywords, kind: input.kind, sections: input.sections }),
      signal: controller.signal,
    })
  } catch {
    // Network error / abort / backend down — treat as "nothing found".
    clearTimeout(timeoutId)
    return null
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) return null

  const payload = (await response.json().catch(() => null)) as unknown
  if (!Array.isArray(payload)) return null
  // The backend returns one row per requested section (possibly from different
  // designs). Each row is the stored entity: { id, keywords, category, json, ... }.
  // We surface the `json` blueprint for each valid row.
  const sections: InspirationJson[] = []
  for (const row of payload) {
    if (!looksLikeInspirationRow(row)) continue
    const blueprint = (row as { json?: unknown }).json
    if (looksLikeInspiration(blueprint)) sections.push(blueprint)
  }
  if (sections.length === 0) return null
  return { sections }
}
