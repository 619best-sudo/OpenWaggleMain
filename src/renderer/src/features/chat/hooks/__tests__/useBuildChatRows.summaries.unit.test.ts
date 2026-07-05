import { describe, expect, it } from 'vitest'
import type { MachineExecutionState } from '@shared/types/machine'
import {
  buildChatRows,
  createUserMessage,
  SessionBranchId,
  SessionId,
  SupportedModelId,
  type UIMessage,
} from './useBuildChatRows.test-utils'

describe('buildChatRows compaction summaries', () => {
  it('turns compaction summary messages into dedicated summary rows', () => {
    const compactionMessage: UIMessage = {
      id: 'compaction-summary',
      role: 'assistant',
      parts: [{ type: 'text', content: 'Compaction summary\n\nKept the failing test context.' }],
      metadata: {
        compactionSummary: {
          summary: 'Kept the failing test context.',
          tokensBefore: 123456,
        },
      },
    }

    const rows = buildChatRows({
      messages: [createUserMessage('user-1', 'compact'), compactionMessage],
      allMessages: [createUserMessage('user-1', 'compact'), compactionMessage],
      machinePlan: null,
      isLoading: false,
      error: undefined,
      lastUserMessage: null,
      dismissedError: null,
      sessionId: 'session-compaction',
      waggleMetadataLookup: {},
      phase: { current: null, completed: [], totalElapsedMs: 0, completedAtMs: null },
    })

    expect(rows.map((row) => row.type)).toEqual(['message', 'compaction-summary'])
    expect(rows[1]).toMatchObject({
      type: 'compaction-summary',
      id: 'compaction-summary',
      summary: 'Kept the failing test context.',
      tokensBefore: 123456,
    })
  })

  it('turns branch summary messages into dedicated summary rows', () => {
    const branchMessage: UIMessage = {
      id: 'branch-summary',
      role: 'assistant',
      parts: [{ type: 'text', content: 'Branch summary\n\nThe abandoned path edited tests.' }],
      metadata: {
        branchSummary: {
          summary: 'The abandoned path edited tests.',
        },
      },
    }

    const rows = buildChatRows({
      messages: [createUserMessage('user-1', 'branch'), branchMessage],
      allMessages: [createUserMessage('user-1', 'branch'), branchMessage],
      machinePlan: null,
      isLoading: false,
      error: undefined,
      lastUserMessage: null,
      dismissedError: null,
      sessionId: 'session-branch-summary',
      waggleMetadataLookup: {},
      phase: { current: null, completed: [], totalElapsedMs: 0, completedAtMs: null },
    })

    expect(rows.map((row) => row.type)).toEqual(['message', 'branch-summary'])
    expect(rows[1]).toMatchObject({
      type: 'branch-summary',
      id: 'branch-summary',
      summary: 'The abandoned path edited tests.',
    })
  })
})

describe('buildChatRows interrupted runs', () => {
  it('places an interrupted run notice before transcript messages', () => {
    const rows = buildChatRows({
      messages: [createUserMessage('user-1', 'continue from last run')],
      allMessages: [createUserMessage('user-1', 'continue from last run')],
      machinePlan: null,
      isLoading: false,
      error: undefined,
      lastUserMessage: null,
      dismissedError: null,
      sessionId: 'session-interrupted',
      waggleMetadataLookup: {},
      phase: { current: null, completed: [], totalElapsedMs: 0, completedAtMs: null },
      interruptedRun: {
        runId: 'run-interrupted-1',
        sessionId: SessionId('session-interrupted'),
        branchId: SessionBranchId('session-interrupted:main'),
        runMode: 'classic',
        model: SupportedModelId('openai/gpt-5.4'),
        interruptedAt: 1000,
      },
    })

    expect(rows[0]).toMatchObject({
      type: 'interrupted-run',
      runId: 'run-interrupted-1',
      branchId: SessionBranchId('session-interrupted:main'),
    })
    expect(rows[1]).toMatchObject({ type: 'message' })
  })
})

describe('buildChatRows machine timeline', () => {
  it('appends a machine timeline row after transcript messages when a machine plan exists', () => {
    const machinePlan: MachineExecutionState = {
      goal: 'Build machine mode timeline UI',
      originalRequest: 'build machine mode ui',
      phase: 'awaiting_approval',
      tasks: [
        {
          id: 'task-1',
          title: 'Plan the UI',
          prompt: 'Draft the timeline layout.',
          status: 'pending',
        },
      ],
      model: SupportedModelId('openai/gpt-5.5'),
      thinkingLevel: 'medium',
      generatedAt: 101,
    }

    const rows = buildChatRows({
      messages: [createUserMessage('user-1', 'build machine mode ui')],
      allMessages: [createUserMessage('user-1', 'build machine mode ui')],
      machinePlan,
      isLoading: false,
      error: undefined,
      lastUserMessage: null,
      dismissedError: null,
      sessionId: 'session-machine',
      waggleMetadataLookup: {},
      phase: { current: null, completed: [], totalElapsedMs: 0, completedAtMs: null },
    })

    expect(rows.map((row) => row.type)).toEqual(['message', 'machine-timeline'])
    expect(rows[1]).toMatchObject({
      type: 'machine-timeline',
      id: 'machine-timeline:101',
    })
  })

  it('synthesizes the original machine request as a user row when the planner prompt is hidden', () => {
    const machinePlan: MachineExecutionState = {
      goal: 'Create a single file solar system animation',
      originalRequest: 'create a single file index.html to design physics realistic solar system animation',
      phase: 'awaiting_approval',
      tasks: [
        {
          id: 'task-1',
          title: 'Create the file',
          prompt: 'Create index.html with the solar system animation.',
          status: 'pending',
        },
      ],
      model: SupportedModelId('openai/gpt-5.5'),
      thinkingLevel: 'medium',
      generatedAt: 202,
    }

    const rows = buildChatRows({
      messages: [],
      allMessages: [],
      machinePlan,
      isLoading: false,
      error: undefined,
      lastUserMessage: null,
      dismissedError: null,
      sessionId: 'session-machine-hidden',
      waggleMetadataLookup: {},
      phase: { current: null, completed: [], totalElapsedMs: 0, completedAtMs: null },
    })

    expect(rows.map((row) => row.type)).toEqual(['message', 'machine-timeline'])
    expect(rows[0]).toMatchObject({
      type: 'message',
      message: {
        role: 'user',
      },
    })
    if (rows[0]?.type !== 'message') {
      throw new Error('Expected a synthetic user message row.')
    }
    expect(rows[0].message.parts).toEqual([
      {
        type: 'text',
        content:
          'create a single file index.html to design physics realistic solar system animation',
      },
    ])
  })

  it('places the synthetic machine request before post-plan assistant transcript rows', () => {
    const machinePlan: MachineExecutionState = {
      goal: 'Create a single file solar system animation',
      originalRequest: 'create a single file index.html to design physics realistic solar system animation',
      phase: 'running',
      tasks: [
        {
          id: 'task-1',
          title: 'Create the file',
          prompt: 'Create index.html with the solar system animation.',
          status: 'running',
        },
      ],
      model: SupportedModelId('openai/gpt-5.5'),
      thinkingLevel: 'medium',
      generatedAt: 100,
    }

    const rows = buildChatRows({
      messages: [
        {
          id: 'assistant-task-1',
          role: 'assistant',
          parts: [{ type: 'text', content: 'Creating the file now.' }],
          createdAt: new Date(200),
        },
      ],
      allMessages: [
        {
          id: 'assistant-task-1',
          role: 'assistant',
          parts: [{ type: 'text', content: 'Creating the file now.' }],
          createdAt: new Date(200),
        },
      ],
      machinePlan,
      isLoading: false,
      error: undefined,
      lastUserMessage: null,
      dismissedError: null,
      sessionId: 'session-machine-order',
      waggleMetadataLookup: {},
      phase: { current: null, completed: [], totalElapsedMs: 0, completedAtMs: null },
    })

    expect(rows.map((row) => row.type)).toEqual(['message', 'machine-timeline', 'message'])
    if (rows[0]?.type !== 'message' || rows[2]?.type !== 'message') {
      throw new Error('Expected message rows around the machine timeline.')
    }
    expect(rows[0].message.role).toBe('user')
    expect(rows[2].message.id).toBe('assistant-task-1')
  })

  it('appends a completed machine summary card at the end of the transcript', () => {
    const machinePlan: MachineExecutionState = {
      goal: 'Create a single file solar system animation',
      originalRequest: 'create a single file index.html to design physics realistic solar system animation',
      phase: 'completed',
      tasks: [
        {
          id: 'task-1',
          title: 'Create the file',
          prompt: 'Create index.html with the solar system animation.',
          status: 'completed',
        },
      ],
      model: SupportedModelId('openai/gpt-5.5'),
      thinkingLevel: 'medium',
      generatedAt: 303,
      finishedAt: 404,
    }

    const rows = buildChatRows({
      messages: [
        createUserMessage(
          'user-1',
          'create a single file index.html to design physics realistic solar system animation',
        ),
        {
          id: 'assistant-task-1',
          role: 'assistant',
          parts: [{ type: 'text', content: 'Created the file.' }],
          createdAt: new Date(200),
        },
      ],
      allMessages: [
        createUserMessage(
          'user-1',
          'create a single file index.html to design physics realistic solar system animation',
        ),
        {
          id: 'assistant-task-1',
          role: 'assistant',
          parts: [{ type: 'text', content: 'Created the file.' }],
          createdAt: new Date(200),
        },
      ],
      machinePlan,
      isLoading: false,
      error: undefined,
      lastUserMessage: null,
      dismissedError: null,
      sessionId: 'session-machine-completed-summary',
      waggleMetadataLookup: {},
      phase: { current: null, completed: [], totalElapsedMs: 0, completedAtMs: null },
    })

    expect(rows.map((row) => row.type)).toEqual([
      'message',
      'machine-timeline',
      'message',
      'machine-timeline',
    ])
    expect(rows[1]).toMatchObject({
      type: 'machine-timeline',
      id: 'machine-timeline:303',
      variant: 'primary',
    })
    expect(rows[3]).toMatchObject({
      type: 'machine-timeline',
      id: 'machine-timeline-summary:303',
      variant: 'summary',
    })
  })

  it('keeps machine task transcript in the flat transcript when task message ids are persisted', () => {
    const machinePlan: MachineExecutionState = {
      goal: 'Create a single file solar system animation',
      originalRequest: 'create a single file index.html to design physics realistic solar system animation',
      phase: 'completed',
      tasks: [
        {
          id: 'task-1',
          title: 'Create the file',
          prompt: 'Create index.html with the solar system animation.',
          status: 'completed',
          messageIds: ['assistant-task-1'],
        },
      ],
      model: SupportedModelId('openai/gpt-5.5'),
      thinkingLevel: 'medium',
      generatedAt: 404,
      finishedAt: 505,
    }

    const allMessages = [
      createUserMessage(
        'user-1',
        'create a single file index.html to design physics realistic solar system animation',
      ),
      {
        id: 'assistant-task-1',
        role: 'assistant' as const,
        parts: [{ type: 'text' as const, content: 'Created the file.' }],
        createdAt: new Date(200),
      },
    ]

    const rows = buildChatRows({
      messages: allMessages,
      allMessages,
      machinePlan,
      isLoading: false,
      error: undefined,
      lastUserMessage: null,
      dismissedError: null,
      sessionId: 'session-machine-nested-task',
      waggleMetadataLookup: {},
      phase: { current: null, completed: [], totalElapsedMs: 0, completedAtMs: null },
    })

    expect(rows.map((row) => row.type)).toEqual([
      'message',
      'machine-timeline',
      'message',
      'machine-timeline',
    ])
    expect(rows[2]).toMatchObject({
      type: 'message',
      message: {
        id: 'assistant-task-1',
      },
    })
  })

  it('keeps thinking-only and mixed machine task transcript parts in the flat transcript', () => {
    const machinePlan: MachineExecutionState = {
      goal: 'Create a single file solar system animation',
      originalRequest: 'create a single file index.html to design physics realistic solar system animation',
      phase: 'running',
      currentTaskId: 'task-1',
      tasks: [
        {
          id: 'task-1',
          title: 'Create the file',
          prompt: 'Create index.html with the solar system animation.',
          status: 'running',
          messageIds: ['assistant-task-thinking', 'assistant-task-visible'],
        },
      ],
      model: SupportedModelId('openai/gpt-5.5'),
      thinkingLevel: 'medium',
      generatedAt: 404,
    }

    const allMessages = [
      createUserMessage(
        'user-1',
        'create a single file index.html to design physics realistic solar system animation',
      ),
      {
        id: 'assistant-task-thinking',
        role: 'assistant' as const,
        parts: [{ type: 'thinking' as const, content: 'Planning the next step.' }],
        createdAt: new Date(200),
      },
      {
        id: 'assistant-task-visible',
        role: 'assistant' as const,
        parts: [
          { type: 'thinking' as const, content: 'Inspecting the repo first.' },
          { type: 'text' as const, content: 'Created index.html with the initial scene.' },
        ],
        createdAt: new Date(201),
      },
    ]

    const rows = buildChatRows({
      messages: allMessages,
      allMessages,
      machinePlan,
      isLoading: true,
      error: undefined,
      lastUserMessage: null,
      dismissedError: null,
      sessionId: 'session-machine-hide-thinking',
      waggleMetadataLookup: {},
      phase: { current: null, completed: [], totalElapsedMs: 0, completedAtMs: null },
    })

    expect(rows.map((row) => row.type)).toEqual([
      'message',
      'machine-timeline',
      'message',
      'message',
      'phase-indicator',
    ])
    expect(rows[2]).toMatchObject({
      type: 'message',
      message: {
        id: 'assistant-task-thinking',
        parts: [{ type: 'thinking', content: 'Planning the next step.' }],
      },
    })
    expect(rows[3]).toMatchObject({
      type: 'message',
      message: {
        id: 'assistant-task-visible',
        parts: [
          { type: 'thinking', content: 'Inspecting the repo first.' },
          { type: 'text', content: 'Created index.html with the initial scene.' },
        ],
      },
    })
  })
})

// ─── isRunActive propagation ────────────────────────────────────────

describe('buildChatRows reasoning visibility', () => {
  it('keeps assistant rows that contain inline reasoning content', () => {
    const rows = buildChatRows({
      messages: [
        createUserMessage('user-1', 'think first'),
        {
          id: 'assistant-reasoning',
          role: 'assistant',
          parts: [{ type: 'thinking', content: 'Planning the next tool call.' }],
        },
      ],
      allMessages: [
        createUserMessage('user-1', 'think first'),
        {
          id: 'assistant-reasoning',
          role: 'assistant',
          parts: [{ type: 'thinking', content: 'Planning the next tool call.' }],
        },
      ],
      machinePlan: null,
      isLoading: false,
      error: undefined,
      lastUserMessage: null,
      dismissedError: null,
      sessionId: 'session-reasoning',
      waggleMetadataLookup: {},
      phase: { current: null, completed: [], totalElapsedMs: 0, completedAtMs: null },
    })

    const assistantRows = rows.filter(
      (row) => row.type === 'message' && row.message.role === 'assistant',
    )

    expect(assistantRows).toHaveLength(1)
    expect(assistantRows[0]?.message.parts).toEqual([
      {
        type: 'thinking',
        content: 'Planning the next tool call.',
      },
    ])
  })
})

describe('buildChatRows isRunActive', () => {
  it('sets isRunActive on the last assistant row when isLoading is true', () => {
    const messages = [
      createUserMessage('user-1', 'hello'),
      {
        id: 'assistant-1',
        role: 'assistant' as const,
        parts: [{ type: 'text' as const, content: 'first reply' }],
      },
      {
        id: 'assistant-2',
        role: 'assistant' as const,
        parts: [{ type: 'text' as const, content: 'second reply' }],
      },
    ]

    const rows = buildChatRows({
      messages,
      allMessages: messages,
      machinePlan: null,
      isLoading: true,
      error: undefined,
      lastUserMessage: null,
      dismissedError: null,
      sessionId: 'session-active',
      waggleMetadataLookup: {},
      phase: { current: null, completed: [], totalElapsedMs: 0, completedAtMs: null },
    })

    const assistantRows = rows.filter(
      (row) => row.type === 'message' && row.message.role === 'assistant',
    )

    // All assistant rows in an active run should have isRunActive true
    for (const row of assistantRows) {
      expect(row.isRunActive).toBe(true)
    }
  })

  it('sets isRunActive to false when isLoading is false', () => {
    const messages = [
      createUserMessage('user-1', 'hello'),
      {
        id: 'assistant-1',
        role: 'assistant' as const,
        parts: [{ type: 'text' as const, content: 'reply' }],
      },
    ]

    const rows = buildChatRows({
      messages,
      allMessages: messages,
      machinePlan: null,
      isLoading: false,
      error: undefined,
      lastUserMessage: null,
      dismissedError: null,
      sessionId: 'session-inactive',
      waggleMetadataLookup: {},
      phase: { current: null, completed: [], totalElapsedMs: 0, completedAtMs: null },
    })

    const assistantRows = rows.filter(
      (row) => row.type === 'message' && row.message.role === 'assistant',
    )

    for (const row of assistantRows) {
      expect(row.isRunActive).toBe(false)
    }
  })
})

// ─── Waggle message metadata tests ────────────────────────────────
