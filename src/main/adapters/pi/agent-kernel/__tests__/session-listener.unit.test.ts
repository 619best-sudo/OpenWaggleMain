import { SupportedModelId } from '@shared/types/brand'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const listenerMocks = vi.hoisted(() => ({
  renderPiToolCallSummary: vi.fn(() => 'Run pnpm test'),
}))

vi.mock('../pi-tool-call-summary', () => ({
  renderPiToolCallSummary: listenerMocks.renderPiToolCallSummary,
}))

import { createSessionListener } from '../session-listener'

function createListener() {
  const onEvent = vi.fn()
  const listener = createSessionListener(
    {
      model: SupportedModelId('openai/gpt-5.5'),
      cwd: '/repo',
      onEvent,
    },
    'run-1',
  )

  return { listener, onEvent }
}

describe('createSessionListener tool summary caching', () => {
  beforeEach(() => {
    listenerMocks.renderPiToolCallSummary.mockClear()
  })

  it('renders tool execution summaries once per tool call across streaming updates', () => {
    const { listener } = createListener()

    listener({
      type: 'tool_execution_start',
      toolCallId: 'tool-1',
      toolName: 'bash',
      args: { command: 'pnpm test' },
      timestamp: 1,
    } as never)
    listener({
      type: 'tool_execution_update',
      toolCallId: 'tool-1',
      toolName: 'bash',
      args: { command: 'pnpm test' },
      partialResult: { content: [{ type: 'text', text: 'running' }] },
      timestamp: 2,
    } as never)
    listener({
      type: 'tool_execution_end',
      toolCallId: 'tool-1',
      toolName: 'bash',
      result: { content: [{ type: 'text', text: 'done' }] },
      isError: false,
      timestamp: 3,
    } as never)

    expect(listenerMocks.renderPiToolCallSummary).toHaveBeenCalledTimes(1)
  })

  it('renders assistant tool call summaries once per tool call across deltas', () => {
    const { listener } = createListener()

    listener({
      type: 'message_start',
      message: {
        role: 'assistant',
      },
    } as never)
    listener({
      type: 'message_update',
      assistantMessageEvent: {
        type: 'toolcall_start',
        contentIndex: 0,
        partial: {
          content: [{ type: 'toolCall', id: 'tool-2', name: 'read', arguments: { path: 'src/app.ts' } }],
        },
      },
    } as never)
    listener({
      type: 'message_update',
      assistantMessageEvent: {
        type: 'toolcall_delta',
        contentIndex: 0,
        delta: '',
        partial: {
          content: [{ type: 'toolCall', id: 'tool-2', name: 'read', arguments: { path: 'src/app.ts' } }],
        },
      },
    } as never)
    listener({
      type: 'message_update',
      assistantMessageEvent: {
        type: 'toolcall_end',
        contentIndex: 0,
        toolCall: { id: 'tool-2', name: 'read', arguments: { path: 'src/app.ts' } },
      },
    } as never)

    expect(listenerMocks.renderPiToolCallSummary).toHaveBeenCalledTimes(1)
  })
})
