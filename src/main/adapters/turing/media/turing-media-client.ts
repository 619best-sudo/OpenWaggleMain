/**
 * Backend-routed media clients for the harness.
 *
 * Routes image generation and media/vision analysis through the backend's
 * `turing-machine` module (`POST /turing-machine/images` and
 * `POST /turing-machine/media/analysis`) instead of calling OpenRouter directly
 * from the main process. The backend authenticates the call with the user's JWT
 * and bills centrally — so the app no longer needs to hold an OpenRouter key or
 * know the provider wire format.
 *
 * Mirrors `fetchToolSelection` / the inspiration client: global `fetch`, an
 * AbortController with a hard timeout, a Bearer token read per call from the
 * `turing-machine` credential slot (the user JWT the renderer pushes after
 * login), and `resolveTuringMachineBaseUrl()` for the host.
 */
import type { BackendImageData, BackendImageRequest, ToolContext } from 'turing-harness'
import { readStoredApiKey } from '../providers/turing-credentials'
import { createLogger } from '../../../logger'
import { resolveTuringMachineBaseUrl } from '../../pi/pi-provider-catalog'

const logger = createLogger('turing-media-client')

/** The credential slot holding the user JWT (populated by the renderer after login). */
const TURING_MACHINE_CREDENTIAL_KEY = 'turing-machine'
const DEFAULT_TIMEOUT_MS = 180_000 // image gen can be slow

export interface TuringMediaClientOptions {
  readonly baseUrl?: string
  readonly credentialKey?: string
  readonly timeoutMs?: number
}

function resolveToken(credentialKey: string): string | undefined {
  return readStoredApiKey(credentialKey) // never throws
}

function buildController(timeoutMs: number, external?: AbortSignal) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  if (external?.aborted) {
    controller.abort()
  } else {
    external?.addEventListener('abort', () => controller.abort(), { once: true })
  }
  return { controller, timer }
}

async function postJson<T>(
  path: string,
  body: Record<string, unknown>,
  opts: TuringMediaClientOptions,
  signal?: AbortSignal,
): Promise<T> {
  const token = resolveToken(opts.credentialKey ?? TURING_MACHINE_CREDENTIAL_KEY)
  if (!token) {
    throw new Error(
      'turing-media: no stored turing-machine token — sign in to route image/vision through the backend.',
    )
  }
  const baseUrl = opts.baseUrl?.trim() || resolveTuringMachineBaseUrl()
  const { controller, timer } = buildController(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, signal)
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`turing-media ${path} failed (${res.status}): ${text.slice(0, 200)}`)
    }
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Generate an image via the backend `/images` proxy. Returns the OpenRouter
 * image response shape (`{ b64_json, media_type }`) so the harness
 * `createBackendImageBackend` can decode it identically to the direct path.
 */
export async function generateImageViaTuring(
  request: BackendImageRequest,
  ctx: ToolContext,
  opts: TuringMediaClientOptions = {},
): Promise<BackendImageData> {
  logger.debug('Generating image via turing-machine backend', { model: request.model })
  const response = await postJson<{ data?: BackendImageData[] }>(
    '/images',
    { model: request.model, prompt: request.prompt, options: request.options },
    opts,
    ctx.signal,
  )
  const first = response.data?.[0]
  if (!first) {
    throw new Error('turing-media /images returned no image data')
  }
  return first
}

/** One image to analyze, in the shape the backend DTO expects. */
export interface AnalysisImage {
  readonly mimeType: string
  /** Raw base64 (no data: prefix) OR a path/URL via `uri`. */
  readonly data?: string
  readonly uri?: string
}

/**
 * Analyze media (vision) via the backend `/media/analysis` proxy. Returns the
 * upstream chat-completions response; callers read `choices[0].message.content`
 * for the analysis text and `usage` for token accounting.
 */
export async function analyzeMediaViaTuring(
  input: {
    prompt: string
    systemPrompt?: string
    images: AnalysisImage[]
    model?: string
  },
  signal: AbortSignal | undefined,
  opts: TuringMediaClientOptions = {},
): Promise<{ text: string }> {
  const response = await postJson<{
    choices?: Array<{ message?: { content?: string | null } }>
  }>(
    '/media/analysis',
    {
      prompt: input.prompt,
      systemPrompt: input.systemPrompt,
      images: input.images,
      model: input.model,
    },
    opts,
    signal,
  )
  const text = response.choices?.[0]?.message?.content ?? ''
  // Billing happens server-side (recordTextConsumption), so we don't need to
  // surface token usage back to the tool here.
  return { text }
}
