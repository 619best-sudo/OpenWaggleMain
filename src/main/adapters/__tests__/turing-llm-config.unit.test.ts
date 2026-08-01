import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mutable so individual tests can flip the direct-OpenRouter escape hatch.
const mockEnv: Record<string, string | undefined> = {
  OPENWAGGLE_DIRECT_OPENROUTER: undefined,
  OPENWAGGLE_OPENROUTER_API_KEY: 'openrouter-env-key',
  OPENROUTER_API_KEY: undefined,
  OPENWAGGLE_OPENROUTER_BASE_URL: undefined,
  OPENROUTER_BASE_URL: undefined,
}

vi.mock('../../env', () => ({
  get env() {
    return mockEnv
  },
}))

vi.mock('../turing/providers/turing-credentials', () => ({
  readStoredApiKey: (providerId: string) =>
    providerId === 'openrouter'
      ? 'stored-openrouter-key'
      : providerId === 'turing-machine'
        ? 'stored-tm-jwt'
        : undefined,
}))

import { resolveTuringLlmConfig, toolModelCandidatesFor } from '../turing/turing-llm-config'

// `resolveTuringMachineBaseUrl` reads process.env directly, not the env module.
const BACKEND_BASE_URL = 'http://localhost:8787/turing-machine'

beforeEach(() => {
  mockEnv.OPENWAGGLE_DIRECT_OPENROUTER = undefined
  process.env.OPENWAGGLE_TURING_MACHINE_BASE_URL = BACKEND_BASE_URL
})

afterEach(() => {
  delete process.env.OPENWAGGLE_TURING_MACHINE_BASE_URL
  delete process.env.OPENWAGGLE_TURING_MACHINE_TOKEN
})

describe('resolveTuringLlmConfig — backend routing (default)', () => {
  // The whole point of the migration: no model ref may reach OpenRouter directly,
  // and no OpenRouter key may be used, unless the escape hatch is explicitly on.
  it('sends the turing-machine alias to the backend as the sentinel model', () => {
    const config = resolveTuringLlmConfig('turing-machine/turing-machine')

    // The harness appends /chat/completions, so this must be the backend mount.
    expect(config.baseUrl).toBe(BACKEND_BASE_URL)
    expect(config.apiKey).toBe('stored-tm-jwt')
    // The sentinel hands upstream model choice to the backend.
    expect(config.modelSlug).toBe('turing-machine')
  })

  it('routes explicit provider slugs through the backend too, unchanged', () => {
    const config = resolveTuringLlmConfig('openrouter/qwen/qwen3-coder')

    expect(config.baseUrl).toBe(BACKEND_BASE_URL)
    expect(config.apiKey).toBe('stored-tm-jwt')
    // Prefix stripped; the backend forwards an explicit slug upstream verbatim.
    expect(config.modelSlug).toBe('qwen/qwen3-coder')
  })

  it('routes non-openrouter provider refs through the backend as full slugs', () => {
    const config = resolveTuringLlmConfig('anthropic/claude-opus-4.8')

    expect(config.baseUrl).toBe(BACKEND_BASE_URL)
    expect(config.modelSlug).toBe('anthropic/claude-opus-4.8')
  })

  it('never falls back to an OpenRouter key when the user is signed out', () => {
    process.env.OPENWAGGLE_TURING_MACHINE_TOKEN = 'shared-token'
    const config = resolveTuringLlmConfig('turing-machine/turing-machine')

    // Stored JWT wins; the env shared token is the headless fallback.
    expect(config.apiKey).toBe('stored-tm-jwt')
    expect(config.apiKey).not.toBe('openrouter-env-key')
  })
})

describe('resolveTuringLlmConfig — direct OpenRouter escape hatch', () => {
  beforeEach(() => {
    mockEnv.OPENWAGGLE_DIRECT_OPENROUTER = 'true'
  })

  it('maps the turing-machine alias to direct OpenRouter Laguna', () => {
    const config = resolveTuringLlmConfig('turing-machine/turing-machine')

    expect(config.baseUrl).toBe('https://openrouter.ai/api/v1')
    expect(config.apiKey).toBe('stored-openrouter-key')
    expect(config.modelSlug).toBe('poolside/laguna-xs-2.1')
  })

  it('keeps explicit OpenRouter models on direct OpenRouter routing', () => {
    const config = resolveTuringLlmConfig('openrouter/qwen/qwen3-coder')

    expect(config.baseUrl).toBe('https://openrouter.ai/api/v1')
    expect(config.apiKey).toBe('stored-openrouter-key')
    expect(config.modelSlug).toBe('qwen/qwen3-coder')
  })

  it('only treats recognised truthy values as enabling the hatch', () => {
    for (const value of ['1', 'true', 'yes', 'on', 'TRUE']) {
      mockEnv.OPENWAGGLE_DIRECT_OPENROUTER = value
      expect(resolveTuringLlmConfig('turing-machine/turing-machine').baseUrl).toBe(
        'https://openrouter.ai/api/v1',
      )
    }
    // Anything else must leave the secure backend path in place.
    for (const value of ['0', 'false', 'no', 'off', '', 'maybe']) {
      mockEnv.OPENWAGGLE_DIRECT_OPENROUTER = value
      expect(resolveTuringLlmConfig('turing-machine/turing-machine').baseUrl).toBe(BACKEND_BASE_URL)
    }
  })
})

describe('toolModelCandidatesFor', () => {
  // The pool is what turing-harness selects from per call, ordered cheap -> capable.
  // It is also the ONLY thing that enables the staged read's internal escalation, so
  // the single-entry case must stay single-entry: a pool with no stronger tier leaves
  // the tool single-stage instead of escalating to itself.
  it('is the run model alone when no escalation model is configured', () => {
    const pool = toolModelCandidatesFor({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'k',
      modelSlug: 'qwen/qwen3-coder',
      escalationModelSlug: undefined,
    })

    expect(pool).toEqual(['qwen/qwen3-coder'])
  })

  it('appends the escalation model as the capable tier', () => {
    const pool = toolModelCandidatesFor({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'k',
      modelSlug: 'qwen/qwen3-coder',
      escalationModelSlug: 'anthropic/claude-opus-4.8',
    })

    expect(pool).toEqual(['qwen/qwen3-coder', 'anthropic/claude-opus-4.8'])
  })

  it('collapses to one entry when the escalation model IS the run model', () => {
    const pool = toolModelCandidatesFor({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'k',
      modelSlug: 'anthropic/claude-opus-4.8',
      escalationModelSlug: 'anthropic/claude-opus-4.8',
    })

    expect(pool).toEqual(['anthropic/claude-opus-4.8'])
  })
})
