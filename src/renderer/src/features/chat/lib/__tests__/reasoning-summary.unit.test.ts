import type { UIMessage } from '@shared/types/chat-ui'
import { describe, expect, it } from 'vitest'
import { buildReasoningSummaries } from '../reasoning-summary'

type MessagePart = UIMessage['parts'][number]

function thinkingPart(content: string, stepId = 'thinking-1'): MessagePart {
  return { type: 'thinking', content, stepId }
}

function toolCallPart(
  name: string,
  args: string,
  state: Extract<MessagePart, { type: 'tool-call' }>['state'] = 'output-available',
  summary?: string,
  id = `${name}-1`,
): MessagePart {
  return {
    type: 'tool-call',
    id,
    name,
    arguments: args,
    ...(summary ? { summary } : {}),
    state,
  }
}

describe('buildReasoningSummaries', () => {
  it('uses curated headings for read tool calls', () => {
    const summaries = buildReasoningSummaries([
      thinkingPart('Need to inspect the file first.', 'step-1'),
      toolCallPart('read', '{"path":"src/app.ts"}', 'output-available', 'Read src/app.ts'),
    ])

    expect(summaries).toEqual([{ id: 'step-1', text: 'Loading file context', isRunning: false }])
  })

  it('uses curated headings for grep, find, and ls tool calls', () => {
    const summaries = buildReasoningSummaries([
      thinkingPart('Search for the setting next.', 'step-1'),
      toolCallPart('grep', '{"pattern":"setting","path":"src"}'),
      thinkingPart('Locate the matching files next.', 'step-2'),
      toolCallPart('find', '{"pattern":"*.tsx","path":"src"}'),
      thinkingPart('Review the folder layout after that.', 'step-3'),
      toolCallPart('ls', '{"path":"src"}'),
    ])

    expect(summaries).toEqual([
      { id: 'step-1', text: 'Searching file contents', isRunning: false },
      { id: 'step-2', text: 'Scanning directory tree', isRunning: false },
      { id: 'step-3', text: 'Reading directory structure', isRunning: false },
    ])
  })

  it('keeps the generic thinking summary while tool input is still streaming', () => {
    const summaries = buildReasoningSummaries([
      thinkingPart('Search for the setting next.', 'step-1'),
      toolCallPart('grep', '{"pattern":"setting"}', 'input-streaming'),
    ])

    expect(summaries).toEqual([{ id: 'step-1', text: 'Searching the codebase', isRunning: true }])
  })

  it('uses curated headings for edit and write tool calls', () => {
    const summaries = buildReasoningSummaries([
      thinkingPart('Need to patch the file first.', 'step-1'),
      toolCallPart('edit', '{"path":"src/app.ts"}'),
      thinkingPart('Need to create a new file after that.', 'step-2'),
      toolCallPart('write', '{"path":"src/new.ts"}'),
    ])

    expect(summaries).toEqual([
      { id: 'step-1', text: 'Applying code modifications', isRunning: false },
      { id: 'step-2', text: 'Creating source file', isRunning: false },
    ])
  })

  it('keeps the same curated heading for the same tool call id while args change', () => {
    const first = buildReasoningSummaries([
      thinkingPart('Need to inspect the file first.', 'step-1'),
      toolCallPart('read', '{"path":"src/app.ts"}', 'executing', undefined, 'tool-read-stable'),
    ])
    const second = buildReasoningSummaries([
      thinkingPart('Need to inspect the file first.', 'step-1'),
      toolCallPart(
        'read',
        '{"path":"src/app.ts","offset":20,"limit":40}',
        'output-available',
        undefined,
        'tool-read-stable',
      ),
    ])

    expect(first).toEqual([{ id: 'step-1', text: 'Reading implementation details', isRunning: true }])
    expect(second).toEqual([{ id: 'step-1', text: 'Reading implementation details', isRunning: false }])
  })

  it('falls back to compact generic summaries when no tool call follows', () => {
    const summaries = buildReasoningSummaries([
      thinkingPart('I should inspect the current implementation before answering.', 'step-1'),
    ])

    expect(summaries).toEqual([{ id: 'step-1', text: 'Inspecting the current context', isRunning: false }])
  })

  it('marks as running if it is the last part and message is streaming', () => {
    const summaries = buildReasoningSummaries([
      thinkingPart('I should inspect the current implementation before answering.', 'step-1'),
    ], true)

    expect(summaries).toEqual([{ id: 'step-1', text: 'Inspecting the current context', isRunning: true }])
  })

  it('limits the number of visible summaries and deduplicates repeated steps', () => {
    const summaries = buildReasoningSummaries([
      thinkingPart('Need to inspect the file first.', 'step-1'),
      toolCallPart('read', '{"path":"src/app.ts"}'),
      thinkingPart('Need to inspect the file first.', 'step-2'),
      toolCallPart('read', '{"path":"src/app.ts"}'),
      thinkingPart('Search for the setting next.', 'step-3'),
      toolCallPart('grep', '{"pattern":"setting","path":"src"}'),
      thinkingPart('Then update the implementation.', 'step-4'),
      toolCallPart('edit', '{"path":"src/app.ts"}'),
      thinkingPart('Finally verify the result.', 'step-5'),
    ])

    expect(summaries).toEqual([
      { id: 'step-1', text: 'Loading file context', isRunning: false },
      { id: 'step-3', text: 'Searching file contents', isRunning: false },
      { id: 'step-4', text: 'Applying code modifications', isRunning: false },
    ])
  })
})
