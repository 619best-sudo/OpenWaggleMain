import type { AgentSession } from '@mariozechner/pi-coding-agent'
import type { AgentTransportEvent } from '@shared/types/stream'
import { fromPartial } from '@total-typescript/shoehorn'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStuckTerminalToolWatchdog } from '../stuck-terminal-tool-watchdog'

function createSession() {
  return fromPartial<AgentSession>({
    abort: vi.fn(async () => undefined),
  })
}

function terminalErrorEvent(): Extract<AgentTransportEvent, { type: 'tool_execution_end' }> {
  return {
    type: 'tool_execution_end',
    toolCallId: 'tool-1',
    toolName: 'bash',
    args: { command: 'pnpm test' },
    result: {
      content: [{ type: 'text', text: 'Command exited with code 1' }],
      details: { fullOutputPath: '/tmp/pi-bash.log' },
    },
    isError: true,
    timestamp: Date.now(),
    model: 'openai/gpt-5.4',
  }
}

describe('createStuckTerminalToolWatchdog', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('aborts and emits an error when a terminal tool error leaves the run stuck', async () => {
    vi.useFakeTimers()

    const session = createSession()
    const emitErrorEvent = vi.fn()
    const watchdog = createStuckTerminalToolWatchdog({
      session,
      runId: 'run-1',
      emitErrorEvent,
      abortWarning: 'abort failed',
    })

    watchdog.observe(terminalErrorEvent())
    const operation = watchdog.watch(() => new Promise<void>(() => undefined))
    const assertion = expect(operation).rejects.toThrow(
      'Inspect the terminal log at /tmp/pi-bash.log and continue from that failure.',
    )

    await vi.advanceTimersByTimeAsync(60_000)
    await assertion
    await Promise.resolve()

    expect(session.abort).toHaveBeenCalledOnce()
    expect(emitErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent_end',
        runId: 'run-1',
        reason: 'error',
      }),
    )
  })

  it('clears the watchdog when the run makes progress after a terminal tool error', async () => {
    vi.useFakeTimers()

    const session = createSession()
    const emitErrorEvent = vi.fn()
    const watchdog = createStuckTerminalToolWatchdog({
      session,
      runId: 'run-1',
      emitErrorEvent,
      abortWarning: 'abort failed',
    })

    const deferred = {
      resolve: (): void => {},
    }
    const operation = watchdog.watch(
      () =>
        new Promise<void>((resolve) => {
          deferred.resolve = () => resolve()
        }),
    )

    watchdog.observe(terminalErrorEvent())
    await vi.advanceTimersByTimeAsync(55_000)
    watchdog.observe({
      type: 'queue_update',
      steering: [],
      followUp: ['retry with the terminal log'],
      timestamp: Date.now(),
      model: 'openai/gpt-5.4',
    })
    await vi.advanceTimersByTimeAsync(65_000)
    deferred.resolve()

    await expect(operation).resolves.toBeUndefined()
    expect(session.abort).not.toHaveBeenCalled()
    expect(emitErrorEvent).not.toHaveBeenCalled()
  })
})
