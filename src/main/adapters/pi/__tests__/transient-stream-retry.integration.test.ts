/**
 * Integration test for request-initiation retry in the patched pi-agent-core
 * loop. Under heavy load the backend/gateway can reject a request with a bodyless
 * transient status (a spurious 401/5xx with no body) before any tokens stream.
 * Those are retried; a genuine (bodied) auth error is not.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import {
  assistantStopMessage,
  baseConfig,
  fakeResponse,
  loadRunAgentLoop,
  type RunAgentLoop,
  userPrompt,
} from './routed-tool-authoring-harness'

let runAgentLoop: RunAgentLoop

beforeAll(async () => {
  runAgentLoop = await loadRunAgentLoop()
})

const emptyContext = () => ({
  systemPrompt: 'You are a coding agent.',
  messages: [],
  tools: [],
})
const noRoute = async () => undefined

describe('transient stream retry (patched pi-agent-core loop)', () => {
  it('retries a transient bodyless 401 at request initiation and recovers', async () => {
    let createCalls = 0
    const streamFn = () => {
      createCalls += 1
      if (createCalls === 1) {
        // Transient gateway hiccup under load — no body.
        throw new Error('401 status code (no body)')
      }
      return fakeResponse(assistantStopMessage())
    }

    await runAgentLoop(
      userPrompt(),
      emptyContext(),
      baseConfig(noRoute),
      async () => {},
      undefined,
      streamFn,
    )

    // The first attempt failed transiently; the request was retried and succeeded.
    expect(createCalls).toBe(2)
  })

  it('recovers from a transient bodyless 503 as well', async () => {
    let createCalls = 0
    const streamFn = () => {
      createCalls += 1
      if (createCalls <= 2) {
        throw new Error('503 status code (no body)')
      }
      return fakeResponse(assistantStopMessage())
    }

    await runAgentLoop(
      userPrompt(),
      emptyContext(),
      baseConfig(noRoute),
      async () => {},
      undefined,
      streamFn,
    )

    // Two transient failures, then success — within the retry budget.
    expect(createCalls).toBe(3)
  })

  it('does not retry a genuine (bodied) auth error', async () => {
    let createCalls = 0
    const streamFn = () => {
      createCalls += 1
      throw new Error('401 Unauthorized: invalid api key')
    }

    await expect(
      runAgentLoop(
        userPrompt(),
        emptyContext(),
        baseConfig(noRoute),
        async () => {},
        undefined,
        streamFn,
      ),
    ).rejects.toThrow(/invalid api key/i)
    expect(createCalls).toBe(1)
  })

  it('gives up after the retry budget is exhausted', async () => {
    let createCalls = 0
    const streamFn = () => {
      createCalls += 1
      throw new Error('401 status code (no body)')
    }

    await expect(
      runAgentLoop(
        userPrompt(),
        emptyContext(),
        baseConfig(noRoute),
        async () => {},
        undefined,
        streamFn,
      ),
    ).rejects.toThrow(/no body/i)
    // Initial attempt + 2 retries.
    expect(createCalls).toBe(3)
  })
})
