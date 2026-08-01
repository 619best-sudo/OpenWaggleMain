import type { AgentKernelRunResult } from '../../../ports/agent-kernel-service'
import { AgentKernelService } from '../../../ports/agent-kernel-service'
import * as Effect from 'effect/Effect'
import { SessionId, SupportedModelId } from '@shared/types/brand'
import { afterEach, describe, expect, it, vi } from 'vitest'

const runPiSessionMock = vi.fn<(input: unknown) => Promise<AgentKernelRunResult>>()
const runPiWaggleMock = vi.fn<(input: unknown) => Promise<AgentKernelRunResult>>()
const runTuringSessionMock = vi.fn<(input: unknown) => Promise<AgentKernelRunResult>>()

vi.mock('../agent-kernel/classic-run', () => ({
  runPiSession: (input: unknown) => runPiSessionMock(input),
}))

vi.mock('../agent-kernel/waggle-run', () => ({
  runPiWaggle: (input: unknown) => runPiWaggleMock(input),
}))

vi.mock('../../turing/turing-classic-run', () => ({
  runTuringSession: (input: unknown) => runTuringSessionMock(input),
}))

import { PiAgentKernelLive } from '../pi-agent-kernel-adapter'

function makeRunResult(): AgentKernelRunResult {
  return {
    newMessages: [],
    piSessionId: 'pi-session-1',
    sessionSnapshot: {
      nodes: [],
      activeNodeId: null,
    },
  }
}

function makeRunInput(model = SupportedModelId('openai/gpt-5.4')) {
  return {
    session: {
      id: SessionId('session-routing'),
      title: 'Routing',
      projectPath: '/tmp/project',
      messages: [],
      createdAt: 1,
      updatedAt: 1,
    },
    runId: 'run-routing',
    payload: {
      text: 'change header name',
      thinkingLevel: 'high' as const,
      attachments: [],
    },
    model,
    signal: new AbortController().signal,
    onEvent: () => undefined,
  }
}

async function runThroughKernel(model = SupportedModelId('openai/gpt-5.4')) {
  return Effect.runPromise(
    Effect.gen(function* () {
      const kernel = yield* AgentKernelService
      return yield* kernel.run(makeRunInput(model))
    }).pipe(Effect.provide(PiAgentKernelLive)),
  )
}

describe('PiAgentKernelLive run routing', () => {
  afterEach(() => {
    runPiSessionMock.mockReset()
    runPiWaggleMock.mockReset()
    runTuringSessionMock.mockReset()
  })

  it('routes Turing Machine classic runs through runTuringSession', async () => {
    runTuringSessionMock.mockResolvedValue(makeRunResult())
    runPiSessionMock.mockResolvedValue(makeRunResult())

    await runThroughKernel(SupportedModelId('turing-machine/turing-machine'))

    expect(runTuringSessionMock).toHaveBeenCalledTimes(1)
    expect(runPiSessionMock).not.toHaveBeenCalled()
    expect(runPiWaggleMock).not.toHaveBeenCalled()
  })

  it('keeps non-Turing classic runs on the Pi session path', async () => {
    runPiSessionMock.mockResolvedValue(makeRunResult())

    await runThroughKernel()

    expect(runPiSessionMock).toHaveBeenCalledTimes(1)
    expect(runTuringSessionMock).not.toHaveBeenCalled()
    expect(runPiWaggleMock).not.toHaveBeenCalled()
  })
})
