import { describe, expect, it, vi } from 'vitest'

vi.mock('../../env', () => ({
  env: {
    OPENWAGGLE_OPENROUTER_API_KEY: 'openrouter-env-key',
    OPENROUTER_API_KEY: undefined,
    OPENWAGGLE_OPENROUTER_BASE_URL: undefined,
    OPENROUTER_BASE_URL: undefined,
    OPENWAGGLE_TURING_MACHINE_TOKEN: 'tm-env-token',
    OPENWAGGLE_TURING_MACHINE_BASE_URL: 'http://localhost:8787/v1',
    TURING_MACHINE_BASE_URL: undefined,
  },
}))

vi.mock('../pi/pi-provider-catalog', () => ({
  createPiRuntimeAuthStorage: () => ({
    get: (providerId: string) =>
      providerId === 'openrouter'
        ? { type: 'api_key', key: 'stored-openrouter-key' }
        : providerId === 'turing-machine'
          ? { type: 'api_key', key: 'stored-tm-key' }
          : undefined,
  }),
}))

import { resolveTuringLlmConfig } from '../turing/turing-llm-config'

describe('resolveTuringLlmConfig', () => {
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
})
