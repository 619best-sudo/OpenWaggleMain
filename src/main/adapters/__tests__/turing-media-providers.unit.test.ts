import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mutable so tests can vary the asset provider and the direct-OpenRouter hatch.
const mockEnv: Record<string, string | undefined> = {
  OPENWAGGLE_ASSET_PROVIDER: undefined,
  OPENWAGGLE_IMAGE_GEN_MODEL: undefined,
  OPENWAGGLE_DIRECT_OPENROUTER: undefined,
}

vi.mock('../../env', () => ({
  get env() {
    return mockEnv
  },
  // The logger reads `logLevel` from this module at import time, so a mock that
  // omits it breaks any code path that logs.
  logLevel: 'info',
}))

import type { ToolContext } from 'turing-harness'
import type { TuringLlmConfig } from '../turing/turing-llm-config'
import {
  assetBackends,
  createOpenRouterImageBackend,
  resolveAssetProvider,
} from '../turing/turing-media-providers'

const CONFIG: TuringLlmConfig = {
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: 'test-key',
  modelSlug: 'qwen/qwen3-coder',
  escalationModelSlug: undefined,
}

// 1x1 PNG.
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

// `cwd` and `log` are the only required ToolContext fields, so this is a real
// context rather than a cast-away stand-in.
function ctx(): ToolContext {
  return { cwd: '/tmp', log: () => {} }
}

/** One captured outbound request, read without type assertions. */
interface CapturedRequest {
  readonly url: string
  readonly authorization: string | null
  readonly body: Record<string, unknown>
}

function parseBody(body: unknown): Record<string, unknown> {
  if (typeof body !== 'string') return {}
  const parsed: unknown = JSON.parse(body)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
  return { ...parsed }
}

/**
 * Stub `fetch`, recording each call. The tests read this recording rather than
 * `vi.fn().mock.calls`, which needs a cast to be useful — and casts are banned
 * in this repo.
 */
function stubFetch(
  payload: unknown,
  options: { readonly ok?: boolean; readonly status?: number; readonly text?: string } = {},
): readonly CapturedRequest[] {
  const calls: CapturedRequest[] = []
  vi.stubGlobal('fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      authorization: new Headers(init?.headers).get('authorization'),
      body: parseBody(init?.body),
    })
    return {
      ok: options.ok ?? true,
      status: options.status ?? 200,
      json: async () => payload,
      text: async () => options.text ?? '',
    }
  })
  return calls
}

describe('resolveAssetProvider', () => {
  beforeEach(() => {
    mockEnv.OPENWAGGLE_ASSET_PROVIDER = undefined
    mockEnv.OPENWAGGLE_DIRECT_OPENROUTER = undefined
  })

  // Image generation must follow the app-wide routing decision by default, so it
  // cannot keep calling OpenRouter directly after the backend migration.
  it('defaults to the backend proxy', () => {
    expect(resolveAssetProvider()).toBe('turing')
  })

  it('defaults to openrouter when the direct escape hatch is on', () => {
    mockEnv.OPENWAGGLE_DIRECT_OPENROUTER = 'true'
    expect(resolveAssetProvider()).toBe('openrouter')
  })

  it('honours an explicit provider over the routing default', () => {
    mockEnv.OPENWAGGLE_ASSET_PROVIDER = 'openrouter'
    expect(resolveAssetProvider()).toBe('openrouter')

    mockEnv.OPENWAGGLE_ASSET_PROVIDER = 'runware'
    expect(resolveAssetProvider()).toBe('runware')

    mockEnv.OPENWAGGLE_DIRECT_OPENROUTER = 'true'
    mockEnv.OPENWAGGLE_ASSET_PROVIDER = 'turing'
    expect(resolveAssetProvider()).toBe('turing')
  })
})

describe('createOpenRouterImageBackend', () => {
  it('posts to the dedicated /images endpoint and decodes the result', async () => {
    const calls = stubFetch({ data: [{ b64_json: PNG_B64, media_type: 'image/png' }] })

    const backend = createOpenRouterImageBackend(CONFIG)
    const asset = await backend({ kind: 'image', prompt: 'a red circle' }, ctx())

    // Riverflow is a purpose-built image model and is only reachable here — a
    // chat-completions request would not return an image.
    expect(calls[0]?.url).toBe('https://openrouter.ai/api/v1/images')
    expect(calls[0]?.authorization).toBe('Bearer test-key')
    expect(calls[0]?.body.model).toBe('sourceful/riverflow-v2-fast')
    expect(calls[0]?.body.prompt).toBe('a red circle')

    // The harness backend's return type is one-or-many; a single-image request
    // yields the single form.
    expect(Array.isArray(asset)).toBe(false)
    const single = Array.isArray(asset) ? asset[0]! : asset
    expect(single.mimeType).toBe('image/png')
    expect(single.ext).toBe('png')
    expect(Buffer.from(single.bytes).toString('base64')).toBe(PNG_B64)
    vi.unstubAllGlobals()
  })

  it('forwards model-specific knobs such as font_inputs', async () => {
    const calls = stubFetch({ data: [{ b64_json: PNG_B64 }] })

    const backend = createOpenRouterImageBackend(CONFIG)
    await backend(
      {
        kind: 'image',
        prompt: 'a poster',
        options: { font_inputs: ['Inter'], model: 'other/model' },
      },
      ctx(),
    )

    expect(calls[0]?.body.font_inputs).toEqual(['Inter'])
    // A per-call model wins over the default.
    expect(calls[0]?.body.model).toBe('other/model')
    vi.unstubAllGlobals()
  })

  it('fails loudly when the model returns no image', async () => {
    // Silently falling back would let a placeholder be shipped as a real asset.
    stubFetch({ data: [{ revised_prompt: 'nope' }] })
    const backend = createOpenRouterImageBackend(CONFIG)
    await expect(backend({ kind: 'image', prompt: 'x' }, ctx())).rejects.toThrow(
      /returned no image bytes/,
    )
    vi.unstubAllGlobals()
  })

  it('surfaces the HTTP status on failure', async () => {
    stubFetch({}, { ok: false, status: 402, text: 'insufficient credits' })
    const backend = createOpenRouterImageBackend(CONFIG)
    await expect(backend({ kind: 'image', prompt: 'x' }, ctx())).rejects.toThrow(
      /image request failed \(402\)/,
    )
    vi.unstubAllGlobals()
  })

  it('refuses to call without an API key', async () => {
    const backend = createOpenRouterImageBackend({ ...CONFIG, apiKey: '' })
    await expect(backend({ kind: 'image', prompt: 'x' }, ctx())).rejects.toThrow(
      /no OpenRouter API key/,
    )
  })
})

describe('assetBackends', () => {
  it('wires every asset kind, so the harness placeholder is unreachable', () => {
    // Previously only `image` was wired and the rest fell through to the
    // harness placeholder — which writes a stand-in FILE. An agent could then
    // report a generated video that was really a text placeholder. Every kind
    // now routes to the backend's `/assets` endpoint; a kind the backend has no
    // provider for returns 501 and surfaces as a real error instead.
    const backends = assetBackends(CONFIG)
    for (const kind of ['image', 'video', 'audio', '3d'] as const) {
      expect(typeof backends[kind], `${kind} should have a backend`).toBe('function')
    }
  })
})
