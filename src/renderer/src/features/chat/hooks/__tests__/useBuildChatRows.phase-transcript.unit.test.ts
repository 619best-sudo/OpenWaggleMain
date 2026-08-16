import { describe, expect, it } from 'vitest'
import { buildChatRows, createUserMessage, type UIMessage } from './useBuildChatRows.test-utils'

// Phase cards are fully suppressed in the transcript: tool calls render inline via
// AssistantMessageBubble's InlineToolBlock, and UserQuestionCard / PlanReviewActions
// render in ChatPanel outside the transcript (see the comments in useBuildChatRows).
// These tests therefore assert that a phase transcript contributes NO `phase` row
// while the surrounding assistant/user bubbles still render.
describe('buildChatRows phase transcript migration', () => {
  it('does not emit phase rows for persisted phase transcript messages', () => {
    const phaseTranscriptMessage: UIMessage = {
      id: 'phase-transcript-message',
      role: 'assistant',
      parts: [],
      metadata: {
        phaseTranscript: {
          version: 1,
          phases: [
            {
              id: 'perform',
              label: 'Understood! Let me implement the requested changes',
              activityText: 'Applying code modifications',
              status: 'completed',
              elapsedMs: 1000,
              summary: 'Updated the title and preserved the phase transcript after restart.',
              tools: [],
            },
          ],
        },
      },
    }

    const rows = buildChatRows({
      messages: [createUserMessage('user-1', 'edit the title'), phaseTranscriptMessage],
      allMessages: [createUserMessage('user-1', 'edit the title'), phaseTranscriptMessage],
      machinePlan: null,
      isLoading: false,
      error: undefined,
      lastUserMessage: null,
      dismissedError: null,
      sessionId: 'session-phase',
      waggleMetadataLookup: {},
      phase: { current: null, completed: [], totalElapsedMs: 0, completedAtMs: null },
    })

    expect(rows.map((row) => row.type)).toEqual(['message'])
    expect(rows.map((row) => row.type)).not.toContain('phase')
  })

  it('renders legacy assistant tool transcript rows alongside the phase transcript (show-all-bubbles)', () => {
    const rawAssistantMessage: UIMessage = {
      id: 'assistant-legacy',
      role: 'assistant',
      parts: [
        { type: 'thinking', content: 'thinking' },
        {
          type: 'tool-call',
          id: 'tool-1',
          name: 'read',
          arguments: '{"path":"src/app.ts"}',
          state: 'output-available',
        },
        {
          type: 'tool-result',
          toolCallId: 'tool-1',
          content: 'const app = 1',
          state: 'complete',
        },
        { type: 'text', content: 'Updated the title.' },
      ],
    }

    const phaseTranscriptMessage: UIMessage = {
      id: 'phase-transcript-message',
      role: 'assistant',
      parts: [],
      metadata: {
        phaseTranscript: {
          version: 1,
          phases: [
            {
              id: 'perform',
              label: 'Understood! Let me implement the requested changes',
              activityText: 'Applying code modifications',
              status: 'completed',
              elapsedMs: 1000,
              summary: 'Updated the title.',
              tools: [{ toolCallId: 'tool-1', toolName: 'read', status: 'completed' }],
            },
          ],
        },
      },
    }

    const rows = buildChatRows({
      messages: [
        createUserMessage('user-1', 'edit the title'),
        rawAssistantMessage,
        phaseTranscriptMessage,
      ],
      allMessages: [
        createUserMessage('user-1', 'edit the title'),
        rawAssistantMessage,
        phaseTranscriptMessage,
      ],
      machinePlan: null,
      isLoading: false,
      error: undefined,
      lastUserMessage: null,
      dismissedError: null,
      sessionId: 'session-phase',
      waggleMetadataLookup: {},
      phase: { current: null, completed: [], totalElapsedMs: 0, completedAtMs: null },
    })

    expect(rows.map((row) => row.type)).toEqual(['message', 'message'])
    expect(
      rows.some((row) => row.type === 'message' && row.message.id === 'assistant-legacy'),
    ).toBe(true)
  })

  it('renders plain assistant clarification messages alongside the phase transcript (show-all-bubbles)', () => {
    const rawAssistantMessage: UIMessage = {
      id: 'assistant-clarification',
      role: 'assistant',
      parts: [
        {
          type: 'text',
          content:
            "I'd be happy to help you change the header name, but I need a bit more information.",
        },
      ],
    }

    const phaseTranscriptMessage: UIMessage = {
      id: 'phase-transcript-message',
      role: 'assistant',
      parts: [],
      metadata: {
        phaseTranscript: {
          version: 1,
          phases: [
            {
              id: 'prepare',
              label: 'Need clarification before editing',
              activityText: 'Collecting the missing file and header details',
              status: 'completed',
              elapsedMs: 1000,
              summary:
                'Asked for the target file path, current header name, and desired replacement.',
              pendingUserQuestion: {
                phase: 'prepare',
                question:
                  'Which file should I update, what is the current header name, and what should it be changed to?',
                kind: 'clarification',
              },
              tools: [],
            },
          ],
        },
      },
    }

    const rows = buildChatRows({
      messages: [
        createUserMessage('user-1', 'change header name'),
        rawAssistantMessage,
        phaseTranscriptMessage,
      ],
      allMessages: [
        createUserMessage('user-1', 'change header name'),
        rawAssistantMessage,
        phaseTranscriptMessage,
      ],
      machinePlan: null,
      isLoading: false,
      error: undefined,
      lastUserMessage: null,
      dismissedError: null,
      sessionId: 'session-phase',
      waggleMetadataLookup: {},
      phase: { current: null, completed: [], totalElapsedMs: 0, completedAtMs: null },
    })

    expect(rows.map((row) => row.type)).toEqual(['message', 'message'])
    expect(
      rows.some((row) => row.type === 'message' && row.message.id === 'assistant-clarification'),
    ).toBe(true)
  })

  it('leaves the live clarification card to ChatPanel instead of a transcript phase row', () => {
    const rows = buildChatRows({
      messages: [
        createUserMessage('user-1', 'change header name'),
        {
          id: 'assistant-clarification',
          role: 'assistant',
          parts: [
            {
              type: 'text',
              content:
                'Sure, I can help with that. Please provide the file path and the current header name.',
            },
          ],
        },
      ],
      allMessages: [
        createUserMessage('user-1', 'change header name'),
        {
          id: 'assistant-clarification',
          role: 'assistant',
          parts: [
            {
              type: 'text',
              content:
                'Sure, I can help with that. Please provide the file path and the current header name.',
            },
          ],
        },
      ],
      machinePlan: null,
      isLoading: true,
      error: undefined,
      lastUserMessage: null,
      dismissedError: null,
      sessionId: 'session-phase',
      waggleMetadataLookup: {},
      phase: {
        current: { label: 'Need clarification before editing', elapsedMs: 1200 },
        completed: [],
        totalElapsedMs: 1200,
        completedAtMs: null,
      },
      pendingUserQuestionRequest: {
        phase: 'prepare',
        question:
          'Which file should I update, what is the current header name, and what should it be changed to?',
        kind: 'clarification',
      },
    })

    // The pending question renders as a standalone UserQuestionCard in ChatPanel,
    // outside the transcript — buildChatRows must not also emit a phase card for it.
    expect(rows.map((row) => row.type)).not.toContain('phase')
    expect(
      rows.some((row) => row.type === 'message' && row.message.id === 'assistant-clarification'),
    ).toBe(true)
  })

  it('renders live phase rows from phase_end events alongside the raw assistant turn text (show-all-bubbles)', () => {
    const rows = buildChatRows({
      messages: [
        createUserMessage('user-1', 'create html page'),
        {
          id: 'assistant-raw-plan',
          role: 'assistant',
          parts: [
            {
              type: 'text',
              content: 'I found an HTML file already. Should I create a new one or modify it?',
            },
          ],
        },
      ],
      allMessages: [
        createUserMessage('user-1', 'create html page'),
        {
          id: 'assistant-raw-plan',
          role: 'assistant',
          parts: [
            {
              type: 'text',
              content: 'I found an HTML file already. Should I create a new one or modify it?',
            },
          ],
        },
      ],
      machinePlan: null,
      isLoading: true,
      error: undefined,
      lastUserMessage: null,
      dismissedError: null,
      sessionId: 'session-phase',
      waggleMetadataLookup: {},
      phase: {
        current: { label: 'Plan', elapsedMs: 2400 },
        completed: [],
        totalElapsedMs: 2400,
        completedAtMs: null,
      },
      livePhaseEvents: [
        {
          type: 'phase_end',
          phaseId: 'prepare',
          label: 'Let me understand the codebase before implementation',
          status: 'completed',
          summary: 'Scanned the project structure and identified the target HTML entry point.',
          planJson: [
            {
              title: 'Create the page',
              summary: 'Build the requested HTML page in the existing project.',
            },
          ],
          timestamp: Date.now(),
          model: 'turing-machine/turing-machine',
        },
      ],
    })

    // `phase-indicator` is the live Working/Thinking spinner row (appendStatusRows) and
    // is unrelated to the suppressed `phase` cards.
    expect(rows.map((row) => row.type)).toEqual(['message', 'message', 'phase-indicator'])
    expect(
      rows.some((row) => row.type === 'message' && row.message.id === 'assistant-raw-plan'),
    ).toBe(true)
  })
})
