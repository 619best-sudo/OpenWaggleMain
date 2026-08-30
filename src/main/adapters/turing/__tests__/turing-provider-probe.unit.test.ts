/**
 * The probe is the app's second LLM caller: the Connections "Test" button, team
 * agent generation and the team router all go through it, and none of them run
 * through the harness. Its contract is that it hits the same endpoint with the
 * same model a real run would — so these tests assert exactly that, on the wire.
 */
import * as Effect from 'effect/Effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderProbeService } from '../../../ports/provider-probe-service'
import { TuringProviderProbeLive } from '../providers/turing-provider-probe-service'
import { TURING_MODELS } from '../turing-models.config'

vi.mock('../providers/turing-credentials', () => ({
  readStoredApiKey: (slot: string) => (slot === 'turing-machine' ? 'jwt-token' : undefined),
  hasStoredApiKey: () => true,
}))

interface SentRequest {
  readonly url: string
  readonly model: unknown
  readonly authorization: unknown
}

let sent: SentRequest[] = []

function okResponse() {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content: 'OK' } }] }),
    text: async () => '',
  } as unknown as Response
}

beforeEach(() => {
  sent = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { body: string; headers: Record<string, string> }) => {
      const body = JSON.parse(init.body) as { model?: unknown }
      sent.push({
        url: String(url),
        model: body.model,
        authorization: init.headers.Authorization,
      })
      return okResponse()
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function probe(providerId: string, modelId: string) {
  return Effect.runPromise(
    Effect.gen(function* () {
      const service = yield* ProviderProbeService
      yield* service.probeCredentials({ providerId, modelId, projectPath: '/tmp/project' })
    }).pipe(Effect.provide(TuringProviderProbeLive)),
  )
}

function generate(providerId: string, modelId: string) {
  return Effect.runPromise(
    Effect.gen(function* () {
      const service = yield* ProviderProbeService
      return yield* service.generateText({ providerId, modelId, prompt: 'hi' })
    }).pipe(Effect.provide(TuringProviderProbeLive)),
  )
}

describe('the turing provider probe talks to the backend', () => {
  it('sends every probe to the backend, never to openrouter.ai', async () => {
    await probe('turing-machine', 'turing-machine')

    expect(sent[0]?.url).not.toContain('openrouter.ai')
    expect(sent[0]?.url).toMatch(/\/chat\/completions$/)
    // The user's JWT, not a provider key.
    expect(sent[0]?.authorization).toBe('Bearer jwt-token')
  })

  // THE REGRESSION. The backend stopped resolving the `turing-machine` sentinel
  // when it became a transparent passthrough — it now forwards `model` to
  // OpenRouter verbatim. Sending the sentinel made every Connections test, team
  // agent generation and team router call fail upstream on a nonexistent model.
  it('resolves the turing-machine sentinel to a real slug instead of shipping it', async () => {
    await probe('turing-machine', 'turing-machine')
    await probe('turing-machine', 'turing-machine/turing-machine')
    await generate('turing-machine', 'turing-machine/turing-machine')

    for (const request of sent) {
      expect(request.model).not.toBe('turing-machine')
      expect(request.model).not.toBe('turing-machine/turing-machine')
      // The same model a real run drives with — the probe's whole premise.
      expect(request.model).toBe(TURING_MODELS.driver)
    }
  })

  it('forwards a catalogued provider slug unchanged, so billing names the real model', async () => {
    await probe('anthropic', 'anthropic/claude-sonnet-4')

    expect(sent[0]?.model).toBe('anthropic/claude-sonnet-4')
    expect(sent[0]?.url).not.toContain('openrouter.ai')
  })
})
