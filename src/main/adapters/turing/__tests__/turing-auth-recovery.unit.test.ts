/**
 * A run that outlives its token must be recoverable, not lost.
 *
 * The failure these pin down cost a real session: a `read` whose comprehension
 * escalated blocked for sixteen minutes, the user's JWT lapsed while it ran, and
 * the next completion request came back 401. The harness ended the loop and the
 * run finished with `success: false`, discarding fifty-eight turns of tool
 * results and producing no summary at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let directOpenRouter = false
let storedToken: string | undefined = 'jwt-expired'
const sentChannels: Array<{ channel: string; payload: unknown }> = []

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => windows,
  },
}))

vi.mock('../turing-llm-config', () => ({
  isDirectOpenRouterEnabled: () => directOpenRouter,
  resolveBackendToken: () => storedToken ?? '',
}))

vi.mock('../../../logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

let windows: Array<{ webContents: { send: (channel: string, payload: unknown) => void } }> = []

function makeWindow() {
  return {
    webContents: {
      send: (channel: string, payload: unknown) => {
        sentChannels.push({ channel, payload })
      },
    },
  }
}

import {
  isBackendAuthError,
  refreshBackendTokenAfterAuthFailure,
  resolveAuthRecoveryContinuation,
} from '../turing-auth-recovery'

beforeEach(() => {
  directOpenRouter = false
  storedToken = 'jwt-expired'
  sentChannels.length = 0
  windows = [makeWindow()]
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('isBackendAuthError', () => {
  it('recognises the harness wording for a backend 401', () => {
    // The harness names OpenRouter regardless of where `baseUrl` points, so this
    // string is what a rejected turing-machine call actually looks like.
    expect(isBackendAuthError('OpenRouter stream failed (401)')).toBe(true)
    expect(isBackendAuthError('OpenRouter request failed (403)')).toBe(true)
    expect(isBackendAuthError('Unauthorized')).toBe(true)
    expect(isBackendAuthError('Invalid API key')).toBe(true)
  })

  it('does not mistake other failures for an auth problem', () => {
    // A refresh here would be wasted work and would mask the real error.
    expect(isBackendAuthError('OpenRouter stream failed (502)')).toBe(false)
    expect(isBackendAuthError('loop stalled: 3 consecutive turns')).toBe(false)
    expect(isBackendAuthError(undefined)).toBe(false)
    expect(isBackendAuthError('')).toBe(false)
  })
})

describe('resolveAuthRecoveryContinuation', () => {
  it('never re-plans work the user already approved', () => {
    // The whole point of the recovery is that the interruption is invisible. A
    // second approval card is the most visible thing it could possibly do — and
    // the re-decomposed plan need not even match the one they edited.
    const continuation = resolveAuthRecoveryContinuation({
      planApproved: true,
      planMode: true,
    })

    expect(continuation.planMode).toBe(false)
    expect(continuation.prompt).toMatch(/still the plan/i)
    expect(continuation.prompt).toMatch(/remaining/i)
  })

  it('plans normally when the run died before anything was approved', () => {
    // Nothing to preserve: the user has not yet seen a card, so showing one now
    // is what would have happened anyway.
    const continuation = resolveAuthRecoveryContinuation({
      planApproved: false,
      planMode: true,
    })

    expect(continuation.planMode).toBe(true)
    expect(continuation.prompt).toMatch(/continue exactly where you left off/i)
  })

  it('stays out of plan mode for a run that never used it', () => {
    const continuation = resolveAuthRecoveryContinuation({
      planApproved: false,
      planMode: false,
    })

    expect(continuation.planMode).toBe(false)
  })

  it('tells the model the interruption was not its fault, either way', () => {
    // Otherwise it reads the truncated transcript as a failed attempt and starts
    // over, which is the exact waste the recovery exists to prevent.
    for (const planApproved of [true, false]) {
      const { prompt } = resolveAuthRecoveryContinuation({ planApproved, planMode: true })
      expect(prompt).toMatch(/not by anything wrong with the work/i)
      expect(prompt).toMatch(/rather than repeating|reusing the tool results/i)
    }
  })
})

describe('refreshBackendTokenAfterAuthFailure', () => {
  it('asks the renderer and resolves once a different token lands', async () => {
    const pending = refreshBackendTokenAfterAuthFailure()

    expect(sentChannels).toEqual([
      { channel: 'app-auth:refresh-required', payload: { reason: 'run-unauthorized' } },
    ])

    // The renderer completes its round trip and pushes the replacement down.
    storedToken = 'jwt-renewed'
    await vi.advanceTimersByTimeAsync(500)

    await expect(pending).resolves.toBe(true)
  })

  it('reports failure when the renderer clears the session', async () => {
    const pending = refreshBackendTokenAfterAuthFailure()

    // The refresh token was rejected too: this is a sign-out, and retrying the
    // run would just fail again against a backend that has no session for us.
    storedToken = undefined
    await vi.advanceTimersByTimeAsync(500)

    await expect(pending).resolves.toBe(false)
  })

  it('gives up rather than waiting on a renderer that never answers', async () => {
    const pending = refreshBackendTokenAfterAuthFailure()

    await vi.advanceTimersByTimeAsync(25_000)

    await expect(pending).resolves.toBe(false)
  })

  it('does not ask when there is no window to ask', async () => {
    windows = []

    await expect(refreshBackendTokenAfterAuthFailure()).resolves.toBe(false)
    expect(sentChannels).toEqual([])
  })

  it('stays out of the way on the direct-OpenRouter path', async () => {
    // That key is user-supplied and never expires; a 401 means it is wrong, and
    // no session refresh can fix it.
    directOpenRouter = true

    await expect(refreshBackendTokenAfterAuthFailure()).resolves.toBe(false)
    expect(sentChannels).toEqual([])
  })
})
