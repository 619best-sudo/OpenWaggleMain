import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../env', () => ({
  env: {
    OPENWAGGLE_OPENROUTER_API_KEY: 'openrouter-env-key',
    OPENROUTER_API_KEY: undefined,
    OPENWAGGLE_OPENROUTER_BASE_URL: undefined,
    OPENROUTER_BASE_URL: undefined,
    OPENWAGGLE_TURING_MACHINE_TOKEN: 'tm-env-token',
    OPENWAGGLE_TURING_MACHINE_BASE_URL: 'http://localhost:8787/v1',
    TURING_MACHINE_BASE_URL: undefined,
  },
  logLevel: 'error',
}))

vi.mock('../../pi/pi-provider-catalog', () => ({
  createPiRuntimeAuthStorage: () => ({
    get: (providerId: string) =>
      providerId === 'openrouter'
        ? { type: 'api_key', key: 'stored-openrouter-key' }
        : providerId === 'turing-machine'
          ? { type: 'api_key', key: 'stored-tm-key' }
          : undefined,
  }),
}))

const harnessCreateCount = vi.hoisted(() => ({ value: 0 }))

vi.mock('turing-harness', () => {
  class MockHarness {
    createProjectSession = vi.fn(async () => ({
      session: {
        fileMemoryRuntime: {
          getStatus: () => ({
            llmSyncEnabled: false,
            isRefreshing: false,
          }),
          refreshAllSummaries: vi.fn(async () => undefined),
        },
      },
    }))

    constructor() {
      harnessCreateCount.value += 1
    }

    dispose = vi.fn(async () => undefined)
  }

  return {
    Harness: MockHarness,
    FileMemory: {
      open: vi.fn(async () => ({
        getSummarySyncData: () => ({
          llmSyncEnabled: false,
        }),
      })),
    },
  }
})

import {
  checkoutWarmProjectSession,
  disposeAllWarmProjectSessions,
  prewarmProjectMemory,
} from '../turing-memory-prewarm'

describe('turing-memory-prewarm', () => {
  beforeEach(() => {
    harnessCreateCount.value = 0
  })

  afterEach(async () => {
    await disposeAllWarmProjectSessions()
  })

  it('reuses the prewarmed spare on checkout without rebuilding for the prompt', async () => {
    const prewarmed = await prewarmProjectMemory('/tmp/repo')
    expect(harnessCreateCount.value).toBe(1)

    const checkedOut = await checkoutWarmProjectSession('pi-session-1', '/tmp/repo')

    // The first prompt reuses the prewarmed spare instead of blocking on a fresh
    // project-session build (the source of new-thread "thinking starts late").
    expect(checkedOut.session).toBe(prewarmed.session)
  })

  it('replenishes a spare after checkout so the next new thread stays warm', async () => {
    await prewarmProjectMemory('/tmp/repo')
    expect(harnessCreateCount.value).toBe(1)

    // Checkout consumes the spare (spare -> assigned) and kicks off building a
    // replacement in the background, so a signature-matching spare is ready for
    // the next thread instead of being built on its critical path.
    await checkoutWarmProjectSession('pi-session-1', '/tmp/repo')
    expect(harnessCreateCount.value).toBe(2)
  })
})
