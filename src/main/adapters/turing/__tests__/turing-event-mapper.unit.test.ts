import { describe, expect, it, vi } from 'vitest'
import type { AgentTransportEvent } from '@shared/types/stream'
import { createTuringEventMapper } from '../turing-event-mapper'

describe('turing-event-mapper', () => {
  it('anchors tool execution under one assistant message and forwards toolcall_* deltas', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-21T18:00:00.000Z'))

    const emitted: AgentTransportEvent[] = []
    const mapEvent = createTuringEventMapper({
      runId: 'run-1',
      model: 'claude-sonnet-4-5',
      emit: (event) => emitted.push(event),
    })

    mapEvent({ type: 'message_start', message: { role: 'assistant', content: [] } } as never)
    // The model authors a tool call: toolcall_start with the id already known.
    mapEvent({
      type: 'message_update',
      message: { role: 'assistant', content: [] },
      assistantMessageEvent: {
        type: 'toolcall_start',
        contentIndex: 0,
        partial: {
          role: 'assistant',
          content: [{ type: 'toolCall', id: 'tool-1', name: 'read', arguments: { path: 'index.html' } }],
        },
      },
    } as never)
    mapEvent({
      type: 'tool_execution_start',
      toolCallId: 'tool-1',
      toolName: 'read',
      args: { path: 'index.html' },
    } as never)
    mapEvent({
      type: 'tool_execution_end',
      toolCallId: 'tool-1',
      toolName: 'read',
      args: { path: 'index.html' },
      result: 'ok',
      isError: false,
    } as never)
    mapEvent({ type: 'message_end', message: { role: 'assistant', content: [] } } as never)

    const types = emitted.map((event) => event.type)
    // toolcall_start is forwarded as a message_update so the UI shows the call as
    // it is authored; tool_execution_* anchor under the same assistant message.
    expect(types).toContain('tool_execution_start')
    expect(types).toContain('tool_execution_end')
    const messageStart = emitted.find((event) => event.type === 'message_start')
    const toolStart = emitted.find((event) => event.type === 'tool_execution_start')
    if (messageStart?.type !== 'message_start' || toolStart?.type !== 'tool_execution_start') {
      throw new Error('unexpected event shape')
    }
    expect(toolStart.parentMessageId).toBe(messageStart.messageId)

    vi.useRealTimers()
  })

  it('still forwards text deltas as normal assistant transcript updates', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-21T18:00:00.000Z'))

    const emitted: AgentTransportEvent[] = []
    const mapEvent = createTuringEventMapper({
      runId: 'run-2',
      model: 'claude-sonnet-4-5',
      emit: (event) => emitted.push(event),
    })

    mapEvent({ type: 'message_start', message: { role: 'assistant', content: [] } } as never)
    mapEvent({
      type: 'message_update',
      message: { role: 'assistant', content: [] },
      assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'Hello' },
    } as never)
    mapEvent({ type: 'message_end', message: { role: 'assistant', content: [] } } as never)

    expect(emitted.map((event) => event.type)).toEqual(['message_start', 'message_update', 'message_end'])
    const [messageStart, messageUpdate] = emitted
    expect(messageStart?.type).toBe('message_start')
    expect(messageUpdate?.type).toBe('message_update')
    if (messageStart?.type !== 'message_start' || messageUpdate?.type !== 'message_update') {
      throw new Error('unexpected event shape')
    }
    expect(messageUpdate.messageId).toBe(messageStart.messageId)
    expect(messageUpdate.assistantMessageEvent).toEqual({
      type: 'text_delta',
      contentIndex: 0,
      delta: 'Hello',
    })

    vi.useRealTimers()
  })

  it('projects chain_start/chain_end as a single working phase', () => {
    const emitted: AgentTransportEvent[] = []
    const mapEvent = createTuringEventMapper({
      runId: 'run-3',
      model: 'claude-sonnet-4-5',
      emit: (event) => emitted.push(event),
    })

    mapEvent({ type: 'chain_start', task: 'fix the title' } as never)
    mapEvent({ type: 'chain_end', success: true, iterations: 1 } as never)

    expect(emitted.map((event) => event.type)).toEqual(['phase_start', 'phase_end'])
    const [start, end] = emitted as Array<
      Extract<AgentTransportEvent, { type: 'phase_start' | 'phase_end' }>
    >
    expect(start.phaseId).toBe('working')
    expect(end.phaseId).toBe('working')
    if (end.type !== 'phase_end') throw new Error('expected phase_end')
    expect(end.status).toBe('completed')
  })

  it('marks a failed chain_end as a failed working phase', () => {
    const emitted: AgentTransportEvent[] = []
    const mapEvent = createTuringEventMapper({
      runId: 'run-3b',
      model: 'claude-sonnet-4-5',
      emit: (event) => emitted.push(event),
    })

    mapEvent({ type: 'chain_start', task: 'fix the title' } as never)
    mapEvent({ type: 'chain_end', success: false, iterations: 2 } as never)

    const end = emitted.find((event) => event.type === 'phase_end')
    if (end?.type !== 'phase_end') throw new Error('expected phase_end')
    expect(end.status).toBe('failed')
    expect(end.phaseId).toBe('working')
  })

  it('drops the 4P phase_* events the flat loop no longer emits', () => {
    const emitted: AgentTransportEvent[] = []
    const mapEvent = createTuringEventMapper({
      runId: 'run-4',
      model: 'claude-sonnet-4-5',
      emit: (event) => emitted.push(event),
    })

    mapEvent({ type: 'phase_start', phase: 'perform' } as never)
    mapEvent({ type: 'phase_end', phase: 'perfect', result: { verified: false } } as never)
    mapEvent({ type: 'phase_summary', phase: 'plan' } as never)

    expect(emitted).toEqual([])
  })
})
