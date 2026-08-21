import type { AgentSessionEvent } from '@mariozechner/pi-coding-agent'
import type { SupportedModelId } from '@shared/types/llm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSessionListener } from '../session-listener'

const INTERVAL_MS = 150

function nowMock() {
  return { now: vi.spyOn(Date, 'now') }
}

function toolUpdate(toolCallId: string, partial: string): AgentSessionEvent {
  return {
    type: 'tool_execution_update',
    toolCallId,
    toolName: 'bash',
    args: { command: 'pnpm dev' },
    partialResult: { content: [{ type: 'text', text: partial }], details: undefined },
  } as unknown as AgentSessionEvent
}

function toolEnd(toolCallId: string): AgentSessionEvent {
  return {
    type: 'tool_execution_end',
    toolCallId,
    toolName: 'bash',
    args: { command: 'pnpm dev' },
    result: { content: [{ type: 'text', text: 'done' }] },
    isError: false,
  } as unknown as AgentSessionEvent
}

describe('session-listener tool_execution_update pacing', () => {
  let clock: ReturnType<typeof nowMock>

  afterEach(() => {
    clock?.now.mockRestore()
  })

  it('forwards only one snapshot per tool call within the pacing interval', () => {
    const t = 1_000_000
    clock = nowMock()
    clock.now.mockImplementation(() => t)

    const onEvent = vi.fn()
    const listener = createSessionListener(
      { model: 'test/model' as unknown as SupportedModelId, onEvent },
      'run-1',
    )

    // Burst of chunks for the same tool call — cumulative snapshots.
    listener(toolUpdate('t1', 'chunk-1'))
    listener(toolUpdate('t1', 'chunk-1-chunk-2'))
    listener(toolUpdate('t1', 'chunk-1-chunk-2-chunk-3'))

    expect(onEvent).toHaveBeenCalledTimes(1)
    const forwarded = onEvent.mock.calls[0][0] as { partialResult: { content: { text: string }[] } }
    expect(forwarded.partialResult.content[0].text).toBe('chunk-1')
  })

  it('forwards again once the interval has elapsed', () => {
    let t = 1_000_000
    clock = nowMock()
    clock.now.mockImplementation(() => t)

    const onEvent = vi.fn()
    const listener = createSessionListener(
      { model: 'test/model' as unknown as SupportedModelId, onEvent },
      'run-1',
    )

    listener(toolUpdate('t1', 'chunk-1'))
    t += INTERVAL_MS - 1
    listener(toolUpdate('t1', 'chunk-2'))
    expect(onEvent).toHaveBeenCalledTimes(1)

    t += 1 // now past the full interval
    listener(toolUpdate('t1', 'chunk-3'))
    expect(onEvent).toHaveBeenCalledTimes(2)
    const last = onEvent.mock.calls[1][0] as { partialResult: { content: { text: string }[] } }
    expect(last.partialResult.content[0].text).toBe('chunk-3')
  })

  it('paces each tool call independently', () => {
    const t = 1_000_000
    clock = nowMock()
    clock.now.mockImplementation(() => t)

    const onEvent = vi.fn()
    const listener = createSessionListener(
      { model: 'test/model' as unknown as SupportedModelId, onEvent },
      'run-1',
    )

    listener(toolUpdate('t1', 't1-a'))
    listener(toolUpdate('t2', 't2-a'))
    listener(toolUpdate('t1', 't1-b')) // suppressed: t1 within interval
    listener(toolUpdate('t2', 't2-b')) // suppressed: t2 within interval

    expect(onEvent).toHaveBeenCalledTimes(2)
    const forwarded = onEvent.mock.calls.map(
      (c) =>
        (c[0] as { partialResult: { content: { text: string }[] } }).partialResult.content[0].text,
    )
    expect(forwarded).toEqual(['t1-a', 't2-a'])
  })

  it('emits the end event even after a suppressed update', () => {
    const t = 1_000_000
    clock = nowMock()
    clock.now.mockImplementation(() => t)

    const onEvent = vi.fn()
    const listener = createSessionListener(
      { model: 'test/model' as unknown as SupportedModelId, onEvent },
      'run-1',
    )

    listener(toolUpdate('t1', 'chunk-1'))
    listener(toolUpdate('t1', 'chunk-2')) // suppressed by interval
    listener(toolEnd('t1'))

    expect(onEvent).toHaveBeenCalledTimes(2)
    expect((onEvent.mock.calls[1][0] as { type: string }).type).toBe('tool_execution_end')
  })
})
