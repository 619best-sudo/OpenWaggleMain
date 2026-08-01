import { MessageId, SessionId, ToolCallId } from '@shared/types/brand'
import type { UIMessage } from '@shared/types/chat-ui'
import type { SessionDetail } from '@shared/types/session'
import { describe, expect, it } from 'vitest'
import {
  appendMissingOptimisticUserMessages,
  appendUnpersistedAssistantTail,
  formatAttachmentPreview,
  mergeBackgroundReconnectMessages,
  sessionToUIMessages,
} from '../useAgentChat.utils'

const LONG_TEXT = 'x'.repeat(400)
const REGULAR_ATTACHMENT_NAME = 'notes.md'
const AUTO_ATTACHMENT_NAME = 'Pasted Text 1.md'

function userMessage(id: string, content: string) {
  return {
    id,
    role: 'user',
    parts: [{ type: 'text', content }],
    createdAt: new Date(1),
  }
}

function assistantMessage(id: string, parts: UIMessage['parts']) {
  return {
    id,
    role: 'assistant',
    parts,
    createdAt: new Date(2),
  } satisfies UIMessage
}

describe('formatAttachmentPreview', () => {
  it('shows only attachment label for auto-converted long prompt files', () => {
    const preview = formatAttachmentPreview({
      name: AUTO_ATTACHMENT_NAME,
      extractedText: LONG_TEXT,
      origin: 'auto-paste-text',
    })
    expect(preview).toBe('[Attachment] Pasted Text 1.md')
  })

  it('clips regular attachment previews to max length', () => {
    const preview = formatAttachmentPreview({
      name: REGULAR_ATTACHMENT_NAME,
      extractedText: LONG_TEXT,
      origin: 'user-file',
    })
    expect(preview).toBe(`[Attachment] ${REGULAR_ATTACHMENT_NAME}\n${LONG_TEXT.slice(0, 320)}...`)
  })

  it('shows only attachment label when extracted text is empty', () => {
    const preview = formatAttachmentPreview({
      name: REGULAR_ATTACHMENT_NAME,
      extractedText: '   ',
      origin: 'user-file',
    })
    expect(preview).toBe(`[Attachment] ${REGULAR_ATTACHMENT_NAME}`)
  })
})

describe('appendMissingOptimisticUserMessages', () => {
  it('appends optimistic user messages that are absent from the persisted snapshot', () => {
    const snapshotMessages = [userMessage('persisted-1', 'already persisted')]
    const optimisticMessages = [
      userMessage('optimistic-1', 'already persisted'),
      userMessage('optimistic-2', 'still missing'),
    ]

    expect(appendMissingOptimisticUserMessages(snapshotMessages, optimisticMessages)).toEqual([
      ...snapshotMessages,
      optimisticMessages[1],
    ])
  })

  it('consumes persisted duplicate counts before appending extra optimistic duplicates', () => {
    const snapshotMessages = [
      userMessage('persisted-1', 'repeat'),
      userMessage('persisted-2', 'repeat'),
    ]
    const optimisticMessages = [
      userMessage('optimistic-1', 'repeat'),
      userMessage('optimistic-2', 'repeat'),
      userMessage('optimistic-3', 'repeat'),
    ]

    expect(appendMissingOptimisticUserMessages(snapshotMessages, optimisticMessages)).toEqual([
      ...snapshotMessages,
      optimisticMessages[2],
    ])
  })
})

describe('appendUnpersistedAssistantTail', () => {
  it('preserves live assistant output after a matching refreshed user snapshot', () => {
    const snapshotMessages = [userMessage('optimistic-user-1', 'review prototypes')]
    const liveAssistant: UIMessage = {
      id: 'assistant-live-1',
      role: 'assistant',
      parts: [{ type: 'text', content: 'Partial answer' }],
      createdAt: new Date(2),
    }

    expect(
      appendUnpersistedAssistantTail(snapshotMessages, [
        userMessage('optimistic-user-1', 'review prototypes'),
        liveAssistant,
      ]),
    ).toEqual([...snapshotMessages, liveAssistant])
  })

  it('does not append stale live output once the refreshed snapshot has a different assistant', () => {
    const snapshotMessages = [
      userMessage('optimistic-user-1', 'review prototypes'),
      {
        id: 'assistant-persisted-1',
        role: 'assistant',
        parts: [{ type: 'text', content: 'Persisted answer' }],
        createdAt: new Date(2),
      } satisfies UIMessage,
    ]
    const staleLiveAssistant: UIMessage = {
      id: 'assistant-live-1',
      role: 'assistant',
      parts: [{ type: 'text', content: 'Partial answer' }],
      createdAt: new Date(2),
    }

    expect(
      appendUnpersistedAssistantTail(snapshotMessages, [
        userMessage('optimistic-user-1', 'review prototypes'),
        staleLiveAssistant,
      ]),
    ).toEqual(snapshotMessages)
  })
})

describe('mergeBackgroundReconnectMessages', () => {
  it('does not duplicate an optimistic user message already present in the reconnect snapshot', () => {
    const persistedUser = userMessage('persisted-user-1', 'Draft a one-page summary of this app')
    const optimisticUser = userMessage('optimistic-user-1', 'Draft a one-page summary of this app')
    const cachedAssistant = assistantMessage('assistant-live-1', [
      { type: 'thinking', content: 'Inspecting implementation files' },
    ])

    expect(
      mergeBackgroundReconnectMessages([persistedUser], [optimisticUser, cachedAssistant]),
    ).toEqual([persistedUser, cachedAssistant])
  })

  it('does not keep a duplicate assistant turn when reconnect returns the same content with a different id', () => {
    const reconnectAssistant = assistantMessage('assistant-persisted-1', [
      { type: 'thinking', content: 'Inspecting implementation files' },
      { type: 'text', content: 'Implemented the landing page.' },
    ])
    const cachedAssistantDuplicate = assistantMessage('assistant-live-1', [
      { type: 'thinking', content: 'Inspecting implementation files' },
      { type: 'text', content: 'Implemented the landing page.' },
    ])

    expect(
      mergeBackgroundReconnectMessages(
        [userMessage('persisted-user-1', 'Create landing page'), reconnectAssistant],
        [userMessage('persisted-user-1', 'Create landing page'), cachedAssistantDuplicate],
      ),
    ).toEqual([userMessage('persisted-user-1', 'Create landing page'), reconnectAssistant])
  })

  it('does not keep a duplicate assistant turn when only the live thinking step id differs', () => {
    const reconnectAssistant = assistantMessage('assistant-persisted-1', [
      { type: 'thinking', content: 'Planning the answer.' },
      { type: 'text', content: 'Implemented the landing page.' },
    ])
    const cachedAssistantDuplicate = assistantMessage('assistant-live-1', [
      {
        type: 'thinking',
        content: 'Planning the answer.',
        stepId: 'assistant-live-1:thinking:0',
      },
      { type: 'text', content: 'Implemented the landing page.' },
    ])

    expect(
      mergeBackgroundReconnectMessages(
        [userMessage('persisted-user-1', 'Create landing page'), reconnectAssistant],
        [userMessage('persisted-user-1', 'Create landing page'), cachedAssistantDuplicate],
      ),
    ).toEqual([userMessage('persisted-user-1', 'Create landing page'), reconnectAssistant])
  })

  it('drops stale merged tool turns appended after the final summary when reconnect returns split persisted rows', () => {
    const reconnectFirstToolCallAssistant = assistantMessage('assistant-persisted-1', [
      { type: 'thinking', content: 'Inspecting the page.' },
      {
        type: 'tool-call',
        id: 'tool-1',
        name: 'playwright_browser_snapshot',
        arguments: '{"selector":"body"}',
        state: 'input-complete',
      },
    ])
    const reconnectFirstToolResultAssistant = assistantMessage('assistant-persisted-2', [
      {
        type: 'tool-result',
        toolCallId: 'tool-1',
        state: 'complete',
        content: '{"html":"<body>...</body>"}',
      },
    ])
    const reconnectSecondToolCallAssistant = assistantMessage('assistant-persisted-3', [
      { type: 'thinking', content: 'Checking the CTA.' },
      {
        type: 'tool-call',
        id: 'tool-2',
        name: 'playwright_browser_evaluate',
        arguments: '{"script":"cta"}',
        state: 'input-complete',
      },
    ])
    const reconnectSecondToolResultAssistant = assistantMessage('assistant-persisted-4', [
      {
        type: 'tool-result',
        toolCallId: 'tool-2',
        state: 'complete',
        content: '{"cta":"Start now"}',
      },
    ])
    const reconnectSummaryAssistant = assistantMessage('assistant-persisted-5', [
      { type: 'thinking', content: 'Writing the final summary.' },
      { type: 'text', content: 'The page headline and CTA are visible.' },
    ])
    const staleMergedFirstToolTurn = assistantMessage('assistant-runtime-uuid-1', [
      { type: 'thinking', content: 'Inspecting the page.' },
      {
        type: 'tool-call',
        id: 'tool-1',
        name: 'playwright_browser_snapshot',
        arguments: '{"selector":"body"}',
        state: 'output-available',
      },
      {
        type: 'tool-result',
        toolCallId: 'tool-1',
        state: 'output-available',
        content: '{"html":"<body>...</body>"}',
      },
    ])
    const staleMergedSecondToolTurn = assistantMessage('assistant-runtime-uuid-2', [
      { type: 'thinking', content: 'Checking the CTA.' },
      {
        type: 'tool-call',
        id: 'tool-2',
        name: 'playwright_browser_evaluate',
        arguments: '{"script":"cta"}',
        state: 'output-available',
      },
      {
        type: 'tool-result',
        toolCallId: 'tool-2',
        state: 'output-available',
        content: '{"cta":"Start now"}',
      },
    ])

    const mergedMessages = mergeBackgroundReconnectMessages(
      [
        userMessage('persisted-user-1', 'Check the page'),
        reconnectFirstToolCallAssistant,
        reconnectFirstToolResultAssistant,
        reconnectSecondToolCallAssistant,
        reconnectSecondToolResultAssistant,
        reconnectSummaryAssistant,
      ],
      [
        userMessage('persisted-user-1', 'Check the page'),
        reconnectFirstToolCallAssistant,
        reconnectFirstToolResultAssistant,
        reconnectSecondToolCallAssistant,
        reconnectSecondToolResultAssistant,
        reconnectSummaryAssistant,
        staleMergedFirstToolTurn,
        staleMergedSecondToolTurn,
      ],
    )

    expect(mergedMessages.map((message) => message.id)).toEqual([
      'persisted-user-1',
      'assistant-persisted-1',
      'assistant-persisted-2',
      'assistant-persisted-3',
      'assistant-persisted-4',
      'assistant-persisted-5',
    ])
  })

  it('drops a stale merged tool turn containing multiple tool calls and results appended after the summary', () => {
    const reconnectToolCallsAssistant = assistantMessage('assistant-persisted-1', [
      { type: 'thinking', content: 'Calling two tools.' },
      {
        type: 'tool-call',
        id: 'tool-1',
        name: 'playwright_browser_snapshot',
        arguments: '{"selector":"body"}',
        state: 'input-complete',
      },
      {
        type: 'tool-call',
        id: 'tool-2',
        name: 'playwright_browser_evaluate',
        arguments: '{"script":"cta"}',
        state: 'input-complete',
      },
    ])
    const reconnectFirstToolResultAssistant = assistantMessage('assistant-persisted-2', [
      {
        type: 'tool-result',
        toolCallId: 'tool-1',
        state: 'complete',
        content: '{"html":"<body>...</body>"}',
      },
    ])
    const reconnectSecondToolResultAssistant = assistantMessage('assistant-persisted-3', [
      {
        type: 'tool-result',
        toolCallId: 'tool-2',
        state: 'complete',
        content: '{"cta":"Start now"}',
      },
    ])
    const reconnectSummaryAssistant = assistantMessage('assistant-persisted-4', [
      { type: 'thinking', content: 'Writing the final summary.' },
      { type: 'text', content: 'Both tools executed.' },
    ])
    const staleMergedMultiToolTurn = assistantMessage('assistant-runtime-uuid-1', [
      { type: 'thinking', content: 'Calling two tools.' },
      {
        type: 'tool-call',
        id: 'tool-2',
        name: 'playwright_browser_evaluate',
        arguments: '{"script":"cta"}',
        state: 'output-available',
      },
      {
        type: 'tool-call',
        id: 'tool-1',
        name: 'playwright_browser_snapshot',
        arguments: '{"selector":"body"}',
        state: 'output-available',
      },
      {
        type: 'tool-result',
        toolCallId: 'tool-2',
        state: 'output-available',
        content: '{"cta":"Start now"}',
      },
      {
        type: 'tool-result',
        toolCallId: 'tool-1',
        state: 'output-available',
        content: '{"html":"<body>...</body>"}',
      },
    ])

    const mergedMessages = mergeBackgroundReconnectMessages(
      [
        userMessage('persisted-user-1', 'Check the page'),
        reconnectToolCallsAssistant,
        reconnectFirstToolResultAssistant,
        reconnectSecondToolResultAssistant,
        reconnectSummaryAssistant,
      ],
      [
        userMessage('persisted-user-1', 'Check the page'),
        reconnectToolCallsAssistant,
        reconnectFirstToolResultAssistant,
        reconnectSecondToolResultAssistant,
        reconnectSummaryAssistant,
        staleMergedMultiToolTurn,
      ],
    )

    expect(mergedMessages.map((message) => message.id)).toEqual([
      'persisted-user-1',
      'assistant-persisted-1',
      'assistant-persisted-2',
      'assistant-persisted-3',
      'assistant-persisted-4',
    ])
  })
})

describe('sessionToUIMessages', () => {
  it('preserves persisted tool-call state on tool-call parts', () => {
    const session: SessionDetail = {
      id: SessionId('session-1'),
      title: 'Pending tool',
      projectPath: '/repo',
      createdAt: 1,
      updatedAt: 1,
      messages: [
        {
          id: MessageId('msg-1'),
          role: 'assistant',
          createdAt: 1,
          parts: [
            {
              type: 'tool-call',
              toolCall: {
                id: ToolCallId('tool-1'),
                name: 'write',
                args: { path: 'pending.txt' },
                state: 'input-complete',
              },
            },
          ],
        },
      ],
    }

    const messages = sessionToUIMessages(session)
    const toolCall = messages[0]?.parts[0]

    expect(toolCall).toEqual({
      type: 'tool-call',
      id: 'tool-1',
      name: 'write',
      arguments: '{"path":"pending.txt"}',
      state: 'input-complete',
    })
  })

  it('re-attaches a persisted tool-result to its tool-call part across messages', () => {
    // Persisted tool results live in their own `tool-result` role message,
    // separate from the assistant message that issued the call. Without
    // cross-message recovery the hydrated tool-call part would have no
    // `output`, collapsing read/edit/write tool strips once a run completes.
    const session: SessionDetail = {
      id: SessionId('session-recovery'),
      title: 'Recovered result',
      projectPath: '/repo',
      createdAt: 1,
      updatedAt: 1,
      messages: [
        {
          id: MessageId('msg-call'),
          role: 'assistant',
          createdAt: 1,
          parts: [
            {
              type: 'tool-call',
              toolCall: {
                id: ToolCallId('tool-read'),
                name: 'read',
                args: { path: 'README.md' },
                state: 'input-complete',
              },
            },
          ],
        },
        {
          id: MessageId('msg-result'),
          role: 'assistant',
          createdAt: 2,
          parts: [
            {
              type: 'tool-result',
              toolResult: {
                id: ToolCallId('tool-read'),
                name: 'read',
                args: { path: 'README.md' },
                result: 'File contents go here',
                isError: false,
                duration: 12,
              },
            },
          ],
        },
      ],
    }

    const messages = sessionToUIMessages(session)
    const toolCall = messages[0]?.parts[0]

    expect(toolCall).toEqual({
      type: 'tool-call',
      id: 'tool-read',
      name: 'read',
      arguments: '{"path":"README.md"}',
      state: 'input-complete',
      output: 'File contents go here',
    })
  })

  it('attaches a real Pi-shaped tool result so the body stays expandable after hydration', async () => {
    // Mirrors how Pi persists results: a `tool-result` node whose `result` is
    // `{ content: [{type:'text', text}], details }`. The inline tool block uses
    // getToolResultText/getToolDiffData on `output`; if the lookup attached it,
    // those helpers must yield content so the strip stays clickable + expanded.
    const session: SessionDetail = {
      id: SessionId('session-pi-shape'),
      title: 'Pi-shaped result',
      projectPath: '/repo',
      createdAt: 1,
      updatedAt: 1,
      messages: [
        {
          id: MessageId('call-edit'),
          role: 'assistant',
          createdAt: 1,
          parts: [
            {
              type: 'tool-call',
              toolCall: {
                id: ToolCallId('edit-1'),
                name: 'edit',
                args: { path: 'src/app.ts', oldString: 'a', newString: 'b' },
                state: 'input-complete',
              },
            },
          ],
        },
        {
          id: MessageId('result-edit'),
          role: 'assistant',
          createdAt: 2,
          parts: [
            {
              type: 'tool-result',
              toolResult: {
                id: ToolCallId('edit-1'),
                name: 'edit',
                args: { path: 'src/app.ts', oldString: 'a', newString: 'b' },
                result: {
                  content: [{ type: 'text', text: 'applied' }],
                  details: { diff: '-a\n+b' },
                },
                isError: false,
                duration: 3,
              },
            },
          ],
        },
      ],
    }

    const messages = sessionToUIMessages(session)
    const toolCall = messages[0]?.parts[0]
    const output = (toolCall as { output?: unknown }).output

    expect(output).toBeDefined()
    // Same consumption path the inline block uses to decide expandability.
    const { getToolResultText, getToolDiffData } = await import('../tool-call-block')
    expect(getToolResultText(output)).not.toBe('')
    expect(
      getToolDiffData(output, 'edit', { path: 'src/app.ts', oldString: 'a', newString: 'b' }),
    ).not.toBeNull()
  })

  it('maps persisted reasoning parts to inline thinking UI parts', () => {
    const session: SessionDetail = {
      id: SessionId('session-reasoning'),
      title: 'Reasoning',
      projectPath: '/repo',
      createdAt: 1,
      updatedAt: 1,
      messages: [
        {
          id: MessageId('msg-reasoning'),
          role: 'assistant',
          createdAt: 1,
          parts: [{ type: 'reasoning', text: 'Need to inspect the file first.' }],
        },
      ],
    }

    const messages = sessionToUIMessages(session)

    expect(messages[0]?.parts).toEqual([
      {
        type: 'thinking',
        content: 'Need to inspect the file first.',
      },
    ])
  })
})
