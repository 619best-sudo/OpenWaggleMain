import { describe, expect, it, vi } from 'vitest'
import type { AgentTransportEvent } from '@shared/types/stream'
import { getAgentPhaseTitle } from '@shared/types/phase-titles'
import { createTuringEventMapper } from '../turing-event-mapper'

describe('turing-event-mapper', () => {
  it('anchors tool execution under one assistant message without forwarding toolcall deltas', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-21T18:00:00.000Z'))

    const emitted: AgentTransportEvent[] = []
    const mapEvent = createTuringEventMapper({
      runId: 'run-1',
      model: 'claude-sonnet-4-5',
      emit: (event) => emitted.push(event),
    })

    mapEvent({ type: 'message_start', message: { role: 'assistant', content: [] } } as never)
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

    expect(emitted.map((event) => event.type)).toEqual([
      'message_start',
      'tool_execution_start',
      'tool_execution_end',
      'message_end',
    ])
    const [messageStart, toolStart] = emitted
    expect(messageStart?.type).toBe('message_start')
    expect(toolStart?.type).toBe('tool_execution_start')
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

  it('marks perfect verification failures as failed phase updates', () => {
    const emitted: AgentTransportEvent[] = []
    const mapEvent = createTuringEventMapper({
      runId: 'run-3',
      model: 'claude-sonnet-4-5',
      emit: (event) => emitted.push(event),
    })

    mapEvent({
      type: 'phase_end',
      phase: 'perfect',
      result: {
        phase: 'perfect',
        summary: 'VERDICT: FAIL\nThe expected title was not found.',
        verified: false,
        complexity: 0,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        messages: [],
      },
    } as never)

    expect(emitted).toHaveLength(1)
    expect(emitted[0]).toEqual(
      expect.objectContaining({
        type: 'phase_end',
        phaseId: 'perfect',
        status: 'failed',
        summary: 'The expected title was not found.',
      }),
    )
  })

  it('prefers the perfect summary artifact over a verdict-only raw summary', () => {
    const emitted: AgentTransportEvent[] = []
    const mapEvent = createTuringEventMapper({
      runId: 'run-3b',
      model: 'claude-sonnet-4-5',
      emit: (event) => emitted.push(event),
    })

    mapEvent({
      type: 'phase_end',
      phase: 'perfect',
      result: {
        phase: 'perfect',
        summary: 'VERDICT: PASS',
        artifacts: {
          summary: 'Verified the app flow and confirmed the generated summary is shown after verification.',
        },
        verified: true,
        complexity: 0,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        messages: [],
      },
    } as never)

    expect(emitted).toHaveLength(1)
    expect(emitted[0]).toEqual(
      expect.objectContaining({
        type: 'phase_end',
        phaseId: 'perfect',
        status: 'completed',
        summary: 'Verified the app flow and confirmed the generated summary is shown after verification.',
      }),
    )
  })

  it('uses retry-specific perform titles after a failed perfect verdict', () => {
    const emitted: AgentTransportEvent[] = []
    const mapEvent = createTuringEventMapper({
      runId: 'run-4',
      model: 'claude-sonnet-4-5',
      emit: (event) => emitted.push(event),
    })

    mapEvent({ type: 'phase_start', phase: 'perform' } as never)
    mapEvent({
      type: 'phase_end',
      phase: 'perfect',
      result: {
        phase: 'perfect',
        summary: 'VERDICT: FAIL\nThe title still does not match the requirement.',
        verified: false,
        complexity: 0,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        messages: [],
      },
    } as never)
    mapEvent({ type: 'phase_start', phase: 'perform' } as never)

    const performStarts = emitted.filter(
      (event): event is Extract<AgentTransportEvent, { type: 'phase_start' }> =>
        event.type === 'phase_start' && event.phaseId === 'perform',
    )

    expect(performStarts).toHaveLength(2)
    expect(performStarts[0]?.label).toBe(getAgentPhaseTitle('perform', 0))
    expect(performStarts[1]?.label).toBe(
      getAgentPhaseTitle('perform', 1, { retryReason: 'failed_verification' }),
    )
  })
})
