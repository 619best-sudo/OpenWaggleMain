import { describe, expect, it } from 'vitest'
import { buildChatRows, createUserMessage, type UIMessage } from './useBuildChatRows.test-utils'

// Phase cards are fully suppressed in the transcript: tool calls render inline via
// AssistantMessageBubble's InlineToolBlock, and UserQuestionCard / PlanReviewActions
// render in ChatPanel outside the transcript (see the comments in useBuildChatRows).
// These tests therefore assert that a phase transcript contributes NO `phase` row
// while the surrounding assistant/user bubbles still render.
//
// The one exception is the phase's `summary` — the run's closing statement. It is
// not a text part on any message, so suppressing the card used to discard it: a
// read-only run ended on its `deliver` tool card with the answer nowhere on
// screen. It is lifted out as a `closing-summary` row instead.
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

    expect(rows.map((row) => row.type)).toEqual(['message', 'closing-summary'])
    expect(rows.map((row) => row.type)).not.toContain('phase')
    expect(rows.find((row) => row.type === 'closing-summary')).toMatchObject({
      summary: 'Updated the title and preserved the phase transcript after restart.',
    })
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

    expect(rows.map((row) => row.type)).toEqual(['message', 'message', 'closing-summary'])
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

    expect(rows.map((row) => row.type)).toEqual(['message', 'message', 'closing-summary'])
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
    expect(rows.map((row) => row.type)).toEqual([
      'message',
      'message',
      'closing-summary',
      'phase-indicator',
    ])
    expect(
      rows.some((row) => row.type === 'message' && row.message.id === 'assistant-raw-plan'),
    ).toBe(true)
    expect(rows.find((row) => row.type === 'closing-summary')).toMatchObject({
      summary: 'Scanned the project structure and identified the target HTML entry point.',
    })
  })

  // The regression this whole row exists for: a read-only run produces no diffs
  // and no assistant text — the harness puts the answer in `run_summary`, which
  // the main process parks on the `working` phase. If that is dropped, the last
  // thing rendered is the `deliver` tool card and the answer is invisible.
  it('renders the closing summary of a read-only run that has no assistant text of its own', () => {
    const deliverOnlyMessage: UIMessage = {
      id: 'assistant-deliver-only',
      role: 'assistant',
      parts: [
        {
          type: 'tool-call',
          id: 'deliver-1',
          name: 'deliver',
          arguments: '{"summary":"hop-scoped handoff note"}',
          state: 'output-available',
        },
        { type: 'tool-result', toolCallId: 'deliver-1', content: 'Delivered.', state: 'complete' },
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
              id: 'working',
              label: 'Understood! Let me work through the request carefully',
              activityText: 'Working on the task',
              status: 'completed',
              elapsedMs: 4000,
              summary: 'The `deliver` tool is semantic; the heuristics live in the router.',
              tools: [{ toolCallId: 'deliver-1', toolName: 'deliver', status: 'completed' }],
            },
          ],
        },
      },
    }

    const messages = [
      createUserMessage('user-1', 'is deliver heuristics or semantics?'),
      deliverOnlyMessage,
      phaseTranscriptMessage,
    ]
    const rows = buildChatRows({
      messages,
      allMessages: messages,
      machinePlan: null,
      isLoading: false,
      error: undefined,
      lastUserMessage: null,
      dismissedError: null,
      sessionId: 'session-readonly',
      waggleMetadataLookup: {},
      phase: { current: null, completed: [], totalElapsedMs: 0, completedAtMs: null },
    })

    const closing = rows.filter((row) => row.type === 'closing-summary')
    expect(closing).toHaveLength(1)
    expect(closing[0]).toMatchObject({
      summary: 'The `deliver` tool is semantic; the heuristics live in the router.',
    })
    // …and it lands after the turn it closes, not before it.
    expect(rows.at(-1)?.type).toBe('closing-summary')
  })

  it('skips the closing summary row when the phase has no summary', () => {
    const phaseTranscriptMessage: UIMessage = {
      id: 'phase-transcript-message',
      role: 'assistant',
      parts: [],
      metadata: {
        phaseTranscript: {
          version: 1,
          phases: [
            {
              id: 'working',
              label: 'Understood! Let me work through the request carefully',
              activityText: 'Working on the task',
              status: 'failed',
              elapsedMs: 100,
              tools: [],
            },
          ],
        },
      },
    }

    const messages = [createUserMessage('user-1', 'do the thing'), phaseTranscriptMessage]
    const rows = buildChatRows({
      messages,
      allMessages: messages,
      machinePlan: null,
      isLoading: false,
      error: undefined,
      lastUserMessage: null,
      dismissedError: null,
      sessionId: 'session-nosummary',
      waggleMetadataLookup: {},
      phase: { current: null, completed: [], totalElapsedMs: 0, completedAtMs: null },
    })

    // `activityText` ("Working on the task") is mapper-derived filler — rendering
    // it as the run's closing word would read as an answer that was never given.
    expect(rows.map((row) => row.type)).toEqual(['message'])
  })
})
