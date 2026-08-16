import { getAgentPhaseTitle } from '@shared/types/phase-titles'
import type { AgentTransportEvent } from '@shared/types/stream'
import type { AgentEvent as TuringAgentEvent } from 'turing-harness'
import { describe, expect, it } from 'vitest'
import { createTuringEventMapper } from '../turing/turing-event-mapper'

/**
 * Drive the turing event mapper with synthetic turing-harness AgentEvents and
 * assert the AgentTransportEvent stream it emits. Focuses on the additive 4P
 * events (phase_*) that this mapper owns; the pi-shaped message/tool events are
 * exercised by the broader adapter tests.
 */

function collect(events: readonly TuringAgentEvent[]) {
  const emitted: AgentTransportEvent[] = []
  const mapEvent = createTuringEventMapper({
    runId: 'run-1',
    model: 'turing-machine/turing-machine',
    emit: (event) => emitted.push(event),
  })
  for (const event of events) mapEvent(event)
  return emitted
}

describe('turing event mapper: working-phase projection (v2 categorizer chain)', () => {
  it('projects the first categorizer_start → phase_start (working) and agent_end → phase_end (working)', () => {
    const emitted = collect([
      { type: 'categorizer_start', categorizer: 'read', model: 'm/x' } as TuringAgentEvent,
      { type: 'categorizer_end', categorizer: 'read' } as TuringAgentEvent,
      { type: 'agent_end', messages: [] } as TuringAgentEvent,
    ])
    expect(emitted.map((event) => event.type)).toEqual(['phase_start', 'phase_end'])
    const [start, end] = emitted as Array<
      Extract<AgentTransportEvent, { type: 'phase_start' | 'phase_end' }>
    >
    expect(start.phaseId).toBe('working')
    expect(end.phaseId).toBe('working')
    if (end.type !== 'phase_end') throw new Error('expected phase_end')
    expect(end.status).toBe('completed')
  })

  it('marks a failed run (agent_end with a failing resolver) as a failed working phase', () => {
    const emitted: AgentTransportEvent[] = []
    const mapEvent = createTuringEventMapper({
      runId: 'run-1',
      model: 'm/x',
      emit: (event) => emitted.push(event),
      resolveEndStatus: () => 'failed',
    })
    mapEvent({
      type: 'categorizer_start',
      categorizer: 'write_edit',
      model: 'm/x',
    } as TuringAgentEvent)
    mapEvent({ type: 'agent_end', messages: [] } as TuringAgentEvent)
    const end = emitted.find((event) => event.type === 'phase_end')
    if (end?.type !== 'phase_end') throw new Error('expected phase_end')
    expect(end.status).toBe('failed')
  })

  it('refreshes the working-phase label per hop but emits ONE phase_start-card-worthy opening', () => {
    // First hop opens with the generic 'working' title; later hops re-emit
    // phase_start with their label (the session chip tracks the run); the
    // renderer's live cards key off phase_end, of which there is still ONE.
    const emitted = collect([
      { type: 'categorizer_start', categorizer: 'read', model: 'm/x' } as TuringAgentEvent,
      { type: 'categorizer_start', categorizer: 'write_edit', model: 'm/x' } as TuringAgentEvent,
      {
        type: 'categorizer_start',
        categorizer: 'activity_inspect',
        model: 'm/x',
      } as TuringAgentEvent,
      { type: 'agent_end', messages: [] } as TuringAgentEvent,
    ])
    const starts = emitted.filter((event) => event.type === 'phase_start')
    expect(starts).toHaveLength(3)
    if (starts[0].type !== 'phase_start' || starts[1].type !== 'phase_start') {
      throw new Error('expected phase_starts')
    }
    expect(starts[0].label).toBe(getAgentPhaseTitle('working'))
    expect(starts[1].label).toBe('Writing code')
    const ends = emitted.filter((event) => event.type === 'phase_end')
    expect(ends).toHaveLength(1)
  })

  it('hop ends are telemetry only — no phase events, no deliverable content', () => {
    // v2: categorizer_end carries no summary/deliverable by contract; the mapper
    // emits nothing for it (the run's single summary rides the persisted node).
    const emitted = collect([{ type: 'categorizer_end', categorizer: 'read' } as TuringAgentEvent])
    expect(emitted).toEqual([])
  })

  it('drops the retired 4P phase_* events', () => {
    // Neither harness emits them anymore; feeding them (e.g. from an old build)
    // must produce no transport events rather than crashing or stale cards.
    const emitted = collect([
      { type: 'phase_start', phase: 'prepare' } as unknown as TuringAgentEvent,
      {
        type: 'phase_end',
        phase: 'perfect',
        result: { verified: false },
      } as unknown as TuringAgentEvent,
      { type: 'phase_summary', phase: 'plan', uiSummary: 'ui' } as unknown as TuringAgentEvent,
    ])
    expect(emitted).toEqual([])
  })
})

/**
 * Tool-call streaming + ordering. The model authors a tool call as
 * toolcall_start → toolcall_delta* → toolcall_end; the mapper must forward these
 * so the UI shows the call (with streaming args) the moment authoring begins,
 * NOT only when the runner later executes it. The emitted toolCallId must equal
 * the runner's real id so tool_execution_* binds to the SAME part (no duplicate).
 */
describe('turing event mapper: tool-call streaming', () => {
  type ToolCallBlock = {
    type: 'toolCall'
    id: string
    name: string
    arguments: Record<string, unknown>
  }
  type PartialMsg = { content: ToolCallBlock[] }

  function assistant(event: TuringAgentEvent) {
    return event
  }

  it('forwards toolcall_start/delta/end so the UI renders the call as it is authored', () => {
    // The id is known from the start (common OpenRouter shape).
    const partial = (id: string, args: Record<string, unknown>): PartialMsg => ({
      content: [{ type: 'toolCall', id, name: 'read', arguments: args }],
    })
    const emitted = collect([
      assistant({
        type: 'message_update',
        message: {} as never,
        assistantMessageEvent: {
          type: 'toolcall_start',
          contentIndex: 0,
          partial: partial('call-1', {}) as never,
        },
      }),
      assistant({
        type: 'message_update',
        message: {} as never,
        assistantMessageEvent: {
          type: 'toolcall_delta',
          contentIndex: 0,
          delta: '{"path"',
          partial: partial('call-1', {}) as never,
        },
      }),
      assistant({
        type: 'message_update',
        message: {} as never,
        assistantMessageEvent: {
          type: 'toolcall_delta',
          contentIndex: 0,
          delta: ':"/a"}',
          partial: partial('call-1', { path: '/a' }) as never,
        },
      }),
      assistant({
        type: 'message_update',
        message: {} as never,
        assistantMessageEvent: {
          type: 'toolcall_end',
          contentIndex: 0,
          toolCall: { type: 'toolCall', id: 'call-1', name: 'read', arguments: { path: '/a' } },
          partial: partial('call-1', { path: '/a' }) as never,
        },
      }),
    ])

    const toolUpdates = emitted
      .filter((e) => e.type === 'message_update')
      .map(
        (e) =>
          (e as { assistantMessageEvent: { type: string; toolCallId?: string } })
            .assistantMessageEvent,
      )

    expect(toolUpdates.map((u) => u.type)).toEqual([
      'toolcall_start',
      'toolcall_delta',
      'toolcall_delta',
      'toolcall_end',
    ])
    // Every forwarded event carries the SAME real toolCallId — so the runner's
    // later tool_execution_start binds to this part instead of creating a dupe.
    for (const update of toolUpdates) {
      expect(update.toolCallId).toBe('call-1')
    }
  })

  it('buffers toolcall_start until the id resolves (id arrives in a later delta)', () => {
    // id empty at start, resolves on the second delta.
    const partialNoId = (): PartialMsg => ({
      content: [{ type: 'toolCall', id: '', name: 'bash', arguments: {} }],
    })
    const partialWithId = (id: string): PartialMsg => ({
      content: [{ type: 'toolCall', id, name: 'bash', arguments: {} }],
    })
    const emitted = collect([
      assistant({
        type: 'message_update',
        message: {} as never,
        assistantMessageEvent: {
          type: 'toolcall_start',
          contentIndex: 0,
          partial: partialNoId() as never,
        },
      }),
      assistant({
        type: 'message_update',
        message: {} as never,
        assistantMessageEvent: {
          type: 'toolcall_delta',
          contentIndex: 0,
          delta: 'before-id',
          partial: partialNoId() as never,
        },
      }),
      assistant({
        type: 'message_update',
        message: {} as never,
        assistantMessageEvent: {
          type: 'toolcall_delta',
          contentIndex: 0,
          delta: 'after-id',
          partial: partialWithId('call-2') as never,
        },
      }),
      assistant({
        type: 'message_update',
        message: {} as never,
        assistantMessageEvent: {
          type: 'toolcall_end',
          contentIndex: 0,
          toolCall: { type: 'toolCall', id: 'call-2', name: 'bash', arguments: { command: 'ls' } },
          partial: partialWithId('call-2') as never,
        },
      }),
    ])

    const toolUpdates = emitted
      .filter((e) => e.type === 'message_update')
      .map(
        (e) =>
          (e as { assistantMessageEvent: { type: string; toolCallId?: string; delta?: string } })
            .assistantMessageEvent,
      )

    // start is deferred until the id is known; deltas are preserved in order.
    expect(toolUpdates.map((u) => u.type)).toEqual([
      'toolcall_start',
      'toolcall_delta',
      'toolcall_delta',
      'toolcall_end',
    ])
    // Only the two real arg deltas carry `delta`; start/end do not.
    expect(toolUpdates.map((u) => u.delta)).toEqual([undefined, 'before-id', 'after-id', undefined])
    for (const update of toolUpdates) {
      expect(update.toolCallId).toBe('call-2')
    }
  })

  it('keeps two concurrently-authored tool calls ordered by their own contentIndex', () => {
    const partial = (blocks: Array<[string, string]>): PartialMsg => ({
      content: blocks.map(([id, name]) => ({ type: 'toolCall', id, name, arguments: {} })),
    })
    const emitted = collect([
      assistant({
        type: 'message_update',
        message: {} as never,
        assistantMessageEvent: {
          type: 'toolcall_start',
          contentIndex: 0,
          partial: partial([['call-a', 'read']]) as never,
        },
      }),
      assistant({
        type: 'message_update',
        message: {} as never,
        assistantMessageEvent: {
          type: 'toolcall_start',
          contentIndex: 1,
          partial: partial([
            ['call-a', 'read'],
            ['call-b', 'grep'],
          ]) as never,
        },
      }),
      assistant({
        type: 'message_update',
        message: {} as never,
        assistantMessageEvent: {
          type: 'toolcall_end',
          contentIndex: 0,
          toolCall: { type: 'toolCall', id: 'call-a', name: 'read', arguments: {} },
          partial: partial([
            ['call-a', 'read'],
            ['call-b', 'grep'],
          ]) as never,
        },
      }),
      assistant({
        type: 'message_update',
        message: {} as never,
        assistantMessageEvent: {
          type: 'toolcall_end',
          contentIndex: 1,
          toolCall: { type: 'toolCall', id: 'call-b', name: 'grep', arguments: {} },
          partial: partial([
            ['call-a', 'read'],
            ['call-b', 'grep'],
          ]) as never,
        },
      }),
    ])

    const toolUpdates = emitted
      .filter((e) => e.type === 'message_update')
      .map(
        (e) =>
          (e as { assistantMessageEvent: { type: string; toolCallId?: string } })
            .assistantMessageEvent,
      )

    expect(toolUpdates.map((u) => `${u.type}:${u.toolCallId}`)).toEqual([
      'toolcall_start:call-a',
      'toolcall_start:call-b',
      'toolcall_end:call-a',
      'toolcall_end:call-b',
    ])
  })
})

describe('turing event mapper: streamed message-id recording', () => {
  it('records one streamed messageId per assistant turn (message_start…message_end), in order', () => {
    const emitted: AgentTransportEvent[] = []
    const mapEvent = createTuringEventMapper({
      runId: 'run-1',
      model: 'm',
      emit: (event) => emitted.push(event),
    })

    // Two assistant turns. Each is a message_start → (content) → message_end.
    mapEvent({
      type: 'message_start',
      message: { role: 'assistant' },
    } as unknown as TuringAgentEvent)
    mapEvent({
      type: 'message_update',
      message: {} as never,
      assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'first' },
    } as unknown as TuringAgentEvent)
    mapEvent({ type: 'message_end', message: { role: 'assistant' } } as unknown as TuringAgentEvent)
    mapEvent({
      type: 'message_start',
      message: { role: 'assistant' },
    } as unknown as TuringAgentEvent)
    mapEvent({
      type: 'message_update',
      message: {} as never,
      assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'second' },
    } as unknown as TuringAgentEvent)
    mapEvent({ type: 'message_end', message: { role: 'assistant' } } as unknown as TuringAgentEvent)

    const streamedIds = mapEvent.getStreamedMessageIds()
    expect(streamedIds).toHaveLength(2)
    // Each streamed id was actually used in the emitted message_start/message_end.
    const starts = emitted.filter((e) => e.type === 'message_start') as Array<{ messageId: string }>
    expect(starts.map((e) => e.messageId)).toEqual([...streamedIds])
  })
})
