import { MessageId, SessionBranchId, SessionId, SessionNodeId } from '@shared/types/brand'
import type { SessionNode } from '@shared/types/session'
import { describe, expect, it } from 'vitest'
import { getUIMessageText, getUIMessageTextCached } from '../chat-message-text'
import { mergeBackgroundReconnectMessages } from '../chat-reconnect-merge'
import { resolveTranscriptMessages } from '../session-workspace-transcript'

const SESSION_ID = SessionId('session-1')
const SESSION_DETAIL_ID = SessionId('session-1')
const MAIN_BRANCH_ID = SessionBranchId('session-1:main')

function uiMessage(
  id: string,
  role: 'user' | 'assistant',
  content: string,
  createdAt: Date = new Date(1),
) {
  return {
    id,
    role,
    parts: [{ type: 'text', content }],
    createdAt,
  }
}

function sessionNode(
  id: string,
  parentId: string | null,
  role: 'user' | 'assistant',
  content: string,
  createdOrder: number,
) {
  return {
    id: SessionNodeId(id),
    sessionId: SESSION_ID,
    parentId: parentId ? SessionNodeId(parentId) : null,
    piEntryType: 'message',
    kind: role === 'user' ? 'user_message' : 'assistant_message',
    role,
    timestampMs: createdOrder + 1,
    createdOrder,
    pathDepth: createdOrder,
    branchId: MAIN_BRANCH_ID,
    message: {
      id: MessageId(id),
      role,
      parts: [{ type: 'text', text: content }],
      createdAt: createdOrder + 1,
    },
    contentJson: JSON.stringify({ parts: [{ type: 'text', text: content }], model: null }),
    metadataJson: '{}',
  }
}

function workspaceWithPath(
  nodes: readonly SessionNode[],
  activeNodeId: SessionNodeId,
  lastActiveNodeId: SessionNodeId,
) {
  return {
    tree: {
      session: {
        id: SESSION_ID,
        title: 'Branch test',
        projectPath: '/tmp/project',
        createdAt: 1,
        updatedAt: 4,
        lastActiveNodeId,
        lastActiveBranchId: MAIN_BRANCH_ID,
      },
      nodes,
      branches: [
        {
          id: MAIN_BRANCH_ID,
          sessionId: SESSION_ID,
          sourceNodeId: null,
          headNodeId: lastActiveNodeId,
          name: 'main',
          isMain: true,
          createdAt: 1,
          updatedAt: 4,
        },
      ],
      branchStates: [],
      uiState: null,
    },
    activeBranchId: MAIN_BRANCH_ID,
    activeNodeId,
    transcriptPath: nodes
      .filter((node) => node.createdOrder <= activeNodeIdCreatedOrder(nodes, activeNodeId))
      .map((node) => ({
        node,
        branchId: node.branchId,
        isActive: node.id === activeNodeId,
      })),
  }
}

function activeNodeIdCreatedOrder(nodes: readonly SessionNode[], activeNodeId: SessionNodeId) {
  const activeNode = nodes.find((node) => node.id === activeNodeId)
  if (!activeNode) {
    throw new Error(`Missing active node fixture ${String(activeNodeId)}`)
  }
  return activeNode.createdOrder
}

describe('resolveTranscriptMessages', () => {
  it('uses the selected workspace transcript path instead of later main-branch messages', () => {
    const beforeBranch = sessionNode('user-before-branch', null, 'user', 'Before branch', 0)
    const answerBeforeBranch = sessionNode(
      'assistant-before-branch',
      'user-before-branch',
      'assistant',
      'Answer before branch',
      1,
    )
    const branchPoint = sessionNode(
      'user-branch-point',
      'assistant-before-branch',
      'user',
      'Branch from here',
      2,
    )
    const afterBranch = sessionNode(
      'assistant-after-branch',
      'user-branch-point',
      'assistant',
      'Main branch continuation should be hidden',
      3,
    )

    const resolved = resolveTranscriptMessages({
      activeSessionId: SESSION_DETAIL_ID,
      activeWorkspace: workspaceWithPath(
        [beforeBranch, answerBeforeBranch, branchPoint, afterBranch],
        branchPoint.id,
        afterBranch.id,
      ),
      messages: [
        uiMessage('user-before-branch', 'user', 'Before branch'),
        uiMessage('assistant-before-branch', 'assistant', 'Answer before branch'),
        uiMessage('user-branch-point', 'user', 'Branch from here'),
        uiMessage(
          'assistant-after-branch',
          'assistant',
          'Main branch continuation should be hidden',
        ),
      ],
      machinePlan: null,
    })

    expect(resolved.map((message) => message.id)).toEqual([
      'user-before-branch',
      'assistant-before-branch',
      'user-branch-point',
    ])
  })

  it('preserves live tail messages when the selected workspace is already at the active branch head', () => {
    const user = sessionNode('user-head', null, 'user', 'Head user', 0)
    const assistant = sessionNode('assistant-head', 'user-head', 'assistant', 'Head answer', 1)

    const resolved = resolveTranscriptMessages({
      activeSessionId: SESSION_DETAIL_ID,
      activeWorkspace: workspaceWithPath([user, assistant], assistant.id, assistant.id),
      messages: [
        uiMessage('user-head', 'user', 'Head user'),
        uiMessage('assistant-head', 'assistant', 'Head answer'),
        uiMessage('live-user', 'user', 'Live follow-up'),
        uiMessage('live-assistant', 'assistant', 'Live response'),
      ],
      machinePlan: null,
    })

    expect(resolved.map((message) => message.id)).toEqual([
      'user-head',
      'assistant-head',
      'live-user',
      'live-assistant',
    ])
  })

  it('keeps completed live tail messages while the workspace snapshot is still catching up', () => {
    const user = sessionNode('user-head', null, 'user', 'Head user', 0)
    const assistant = sessionNode('assistant-head', 'user-head', 'assistant', 'Head answer', 1)

    const resolved = resolveTranscriptMessages({
      activeSessionId: SESSION_DETAIL_ID,
      activeWorkspace: workspaceWithPath([user, assistant], assistant.id, assistant.id),
      messages: [
        uiMessage('user-head', 'user', 'Head user'),
        uiMessage('assistant-head', 'assistant', 'Head answer'),
        uiMessage('completed-assistant', 'assistant', 'Completed response still visible'),
      ],
      machinePlan: null,
    })

    expect(resolved.map((message) => message.id)).toEqual([
      'user-head',
      'assistant-head',
      'completed-assistant',
    ])
  })

  it('keeps persisted user turns visible when the workspace transcript path lags behind the live cache', () => {
    const user = sessionNode('user-head', null, 'user', 'Head user', 0)
    const assistant = sessionNode('assistant-head', 'user-head', 'assistant', 'Head answer', 1)
    const persistedNextUser = sessionNode(
      'persisted-next-user',
      'assistant-head',
      'user',
      'Keep refining the landing page.',
      2,
    )

    const resolved = resolveTranscriptMessages({
      activeSessionId: SESSION_DETAIL_ID,
      activeWorkspace: {
        tree: {
          session: {
            id: SESSION_ID,
            title: 'Branch test',
            projectPath: '/tmp/project',
            createdAt: 1,
            updatedAt: 4,
            lastActiveNodeId: assistant.id,
            lastActiveBranchId: MAIN_BRANCH_ID,
          },
          nodes: [user, assistant, persistedNextUser],
          branches: [
            {
              id: MAIN_BRANCH_ID,
              sessionId: SESSION_ID,
              sourceNodeId: null,
              headNodeId: assistant.id,
              name: 'main',
              isMain: true,
              createdAt: 1,
              updatedAt: 4,
            },
          ],
          branchStates: [],
          uiState: null,
        },
        activeBranchId: MAIN_BRANCH_ID,
        activeNodeId: assistant.id,
        transcriptPath: [
          { node: user, branchId: user.branchId, isActive: false },
          { node: assistant, branchId: assistant.branchId, isActive: true },
        ],
      },
      messages: [
        uiMessage('user-head', 'user', 'Head user'),
        uiMessage('assistant-head', 'assistant', 'Head answer'),
        uiMessage('persisted-next-user', 'user', 'Keep refining the landing page.'),
        uiMessage('live-assistant', 'assistant', 'On it.'),
      ],
      machinePlan: null,
    })

    expect(resolved.map((message) => message.id)).toEqual([
      'user-head',
      'assistant-head',
      'persisted-next-user',
      'live-assistant',
    ])
  })

  it('filters persisted internal Team fallback prompts from the visible transcript', () => {
    const user = sessionNode('user-head', null, 'user', 'Head user', 0)
    const assistant = sessionNode('assistant-head', 'user-head', 'assistant', 'Head answer', 1)
    const internalPrompt = sessionNode(
      'internal-team-prompt',
      'assistant-head',
      'user',
      `Continue the Code Reviewer task as Standards Auditor.

Use the latest chat transcript as context and continue from the current state.

End with these exact sections:
- Execution Summary:
- Next Agent:
- Next User Prompt:
- Unresolved Blockers:`,
      2,
    )

    const resolved = resolveTranscriptMessages({
      activeSessionId: SESSION_DETAIL_ID,
      activeWorkspace: workspaceWithPath(
        [user, assistant, internalPrompt],
        internalPrompt.id,
        internalPrompt.id,
      ),
      messages: [
        uiMessage('user-head', 'user', 'Head user'),
        uiMessage('assistant-head', 'assistant', 'Head answer'),
        uiMessage(
          'internal-team-prompt',
          'user',
          `Continue the Code Reviewer task as Standards Auditor.

Use the latest chat transcript as context and continue from the current state.

End with these exact sections:
- Execution Summary:
- Next Agent:
- Next User Prompt:
- Unresolved Blockers:`,
        ),
      ],
      machinePlan: null,
    })

    expect(resolved.map((message) => message.id)).toEqual(['user-head', 'assistant-head'])
  })

  it('preserves an unsaved tail even when the workspace path and cached messages have no overlap yet', () => {
    const persistedUser = sessionNode('persisted-user', null, 'user', 'Persisted user', 0)

    const resolved = resolveTranscriptMessages({
      activeSessionId: SESSION_DETAIL_ID,
      activeWorkspace: workspaceWithPath([persistedUser], persistedUser.id, persistedUser.id),
      messages: [
        uiMessage('snapshot-user', 'user', 'Snapshot-only user'),
        uiMessage('snapshot-assistant', 'assistant', 'Snapshot-only assistant'),
      ],
      machinePlan: null,
    })

    expect(resolved.map((message) => message.id)).toEqual([
      'persisted-user',
      'snapshot-user',
      'snapshot-assistant',
    ])
  })

  it('does not append a stale live assistant duplicate after reconnect when only the thinking step id differs', () => {
    const user = sessionNode('1c141f11', null, 'user', 'hello', 0)
    const persistedAssistant = {
      ...sessionNode('assistant-node', '1c141f11', 'assistant', 'Implemented the landing page.', 1),
      message: {
        id: MessageId('fc0f92fb'),
        role: 'assistant' as const,
        parts: [
          { type: 'reasoning' as const, text: 'Planning the answer.' },
          { type: 'text' as const, text: 'Implemented the landing page.' },
        ],
        createdAt: 2,
      },
      contentJson: JSON.stringify({
        parts: [
          { type: 'reasoning', text: 'Planning the answer.' },
          { type: 'text', text: 'Implemented the landing page.' },
        ],
        model: null,
      }),
    }

    const mergedMessages = mergeBackgroundReconnectMessages(
      [
        {
          id: '1c141f11',
          role: 'user',
          parts: [{ type: 'text', content: 'hello' }],
          createdAt: new Date('2026-06-26T14:18:55.301Z'),
        },
        {
          id: 'fc0f92fb',
          role: 'assistant',
          parts: [
            { type: 'thinking', content: 'Planning the answer.' },
            { type: 'text', content: 'Implemented the landing page.' },
          ],
          createdAt: new Date('2026-06-26T14:19:02.687Z'),
        },
      ],
      [
        {
          id: '1c141f11',
          role: 'user',
          parts: [{ type: 'text', content: 'hello' }],
          createdAt: new Date('2026-06-26T14:18:55.301Z'),
        },
        {
          id: '17a7444c-bedf-48f9-81c3-c8c49062dfc2',
          role: 'assistant',
          parts: [
            {
              type: 'thinking',
              content: 'Planning the answer.',
              stepId: '17a7444c-bedf-48f9-81c3-c8c49062dfc2:thinking:0',
            },
            { type: 'text', content: 'Implemented the landing page.' },
          ],
          createdAt: new Date('2026-06-26T14:18:58.991Z'),
        },
      ],
    )

    const resolved = resolveTranscriptMessages({
      activeSessionId: SESSION_DETAIL_ID,
      activeWorkspace: workspaceWithPath(
        [user, persistedAssistant],
        persistedAssistant.id,
        persistedAssistant.id,
      ),
      messages: mergedMessages,
      machinePlan: null,
    })

    expect(resolved.map((message) => message.id)).toEqual(['1c141f11', 'fc0f92fb'])
  })

  it('filters the machine planner prompt and the matching planner JSON response from the transcript', () => {
    const user = sessionNode('user-head', null, 'user', 'Head user', 0)
    const assistant = sessionNode('assistant-head', 'user-head', 'assistant', 'Head answer', 1)
    const machinePrompt = uiMessage(
      'machine-planner-prompt',
      'user',
      `Machine mode is enabled.

You are the planning agent for a sequential coding workflow.
Adopt the Multi-Model Software Engineering System below and compress it into one repository-aware machine-mode plan.
Project: Multi-Model Software Engineering System.
Goal: beat strong single-model coding workflows for website and game development by operating as an AI software company.
Core idea:
- Do not behave like one super AI.
- Behave like an AI software company where specialized roles collaborate through a central orchestrator that maintains the complete understanding of the project.
System architecture:
- User Prompt -> Executive Planner (CEO) -> Product + Architecture Design -> Dependency Graph (DPM) -> Engineering Manager -> Frontend Workers / Backend Workers / Infrastructure Workers -> Code Review Pipeline -> Build / Test / Validate -> Failure Analyzer -> Repair Task Generator -> Repeat Until Green.
Shared memory:
- Every role reads and writes the same project memory.
- Shared memory contains requirements, UI design, architecture, API contracts, database schema, folder structure, coding guidelines, dependency graph, progress, previous decisions, test results, bugs, and acceptance criteria.
Execution pipeline:
- Understand Request.
- Product Planning.
- Architecture Design.
- Generate Dependency Graph.
- Break into Micro Tasks.
- Route Tasks to Best Models.
- Implement.
- Review.
- Build.
- Test.
- Repair.
- Repeat until complete.
Return exactly one JSON object and no prose.
Do not explain your reasoning.
Do not include any conversational text.
Do not say what you are about to do.
Use this JSON shape:
{
  "goal": "string",
  "tasks": [
    {
      "id": "task-1",
      "title": "short title",
      "prompt": "the exact instruction to execute next",
      "dependsOn": ["task ids this task depends on"]
    }
  ]
}
Rules:
- Keep tasks sequential, dependency-aware, and implementation-focused.
- Every task prompt should be ready to send directly to the coding agent.
- Do not include markdown fences.
- Do not include explanatory prose before or after the JSON.

User request:
create a single file index.html to design physics realistic solar system animation`,
    )
    const machinePlanResponse = uiMessage(
      'machine-plan-response',
      'assistant',
      `{"goal":"Create a single self-contained index.html file that renders a physics-realistic solar system animation","tasks":[{"id":"task-1","title":"Scaffold base HTML and viewport CSS","prompt":"Create index.html with full-screen canvas styling.","dependsOn":[]}]}`,
    )

    const resolved = resolveTranscriptMessages({
      activeSessionId: SESSION_DETAIL_ID,
      activeWorkspace: workspaceWithPath([user, assistant], assistant.id, assistant.id),
      messages: [
        uiMessage('user-head', 'user', 'Head user'),
        uiMessage('assistant-head', 'assistant', 'Head answer'),
        machinePrompt,
        machinePlanResponse,
      ],
      machinePlan: {
        goal: 'Create a single self-contained index.html file that renders a physics-realistic solar system animation',
        originalRequest:
          'create a single file index.html to design physics realistic solar system animation',
        phase: 'awaiting_approval',
        tasks: [
          {
            id: 'task-1',
            title: 'Scaffold base HTML and viewport CSS',
            prompt: 'Create index.html with full-screen canvas styling.',
            status: 'pending',
            dependsOn: [],
          },
        ],
        model: 'openai/gpt-5.5',
        thinkingLevel: 'medium',
        generatedAt: 1,
      },
    })

    expect(resolved.map((message) => message.id)).toEqual(['user-head', 'assistant-head'])
  })

  it('moves a late machine original-request user message ahead of visible assistant task rows', () => {
    const machinePrompt = sessionNode(
      'machine-prompt',
      null,
      'user',
      `Machine mode is enabled.

You are the planning agent for a sequential coding workflow.
Adopt the Multi-Model Software Engineering System below and compress it into one repository-aware machine-mode plan.
Project: Multi-Model Software Engineering System.
Execution pipeline:
- Understand Request.
- Product Planning.
- Architecture Design.
- Generate Dependency Graph.
- Break into Micro Tasks.
- Route Tasks to Best Models.
- Implement.
- Review.
- Build.
- Test.
- Repair.
- Repeat until complete.
Return exactly one JSON object and no prose.
User request:
create a beautifull sass page in single file index.html`,
      0,
    )
    const machinePlanResponse = sessionNode(
      'machine-plan-response',
      'machine-prompt',
      'assistant',
      `{"goal":"Create a single-file, responsive, beautiful webpage using SASS styling saved as index.html","tasks":[{"id":"task-1","title":"Generate polished single-file SASS index.html","prompt":"Create the page in index.html.","dependsOn":[]}]}`,
      1,
    )
    const assistantTask = sessionNode(
      'assistant-task',
      'machine-plan-response',
      'assistant',
      'Verifying the updated index.html now.',
      2,
    )

    const resolved = resolveTranscriptMessages({
      activeSessionId: SESSION_DETAIL_ID,
      activeWorkspace: workspaceWithPath(
        [machinePrompt, machinePlanResponse, assistantTask],
        assistantTask.id,
        assistantTask.id,
      ),
      messages: [
        uiMessage(
          'machine-prompt',
          'user',
          `Machine mode is enabled.

You are the planning agent for a sequential coding workflow.
Adopt the Multi-Model Software Engineering System below and compress it into one repository-aware machine-mode plan.
Project: Multi-Model Software Engineering System.
Execution pipeline:
- Understand Request.
- Product Planning.
- Architecture Design.
- Generate Dependency Graph.
- Break into Micro Tasks.
- Route Tasks to Best Models.
- Implement.
- Review.
- Build.
- Test.
- Repair.
- Repeat until complete.
Return exactly one JSON object and no prose.
User request:
create a beautifull sass page in single file index.html`,
        ),
        uiMessage(
          'machine-plan-response',
          'assistant',
          `{"goal":"Create a single-file, responsive, beautiful webpage using SASS styling saved as index.html","tasks":[{"id":"task-1","title":"Generate polished single-file SASS index.html","prompt":"Create the page in index.html.","dependsOn":[]}]}`,
        ),
        uiMessage('assistant-task', 'assistant', 'Verifying the updated index.html now.'),
        uiMessage(
          'optimistic-user-machine-request',
          'user',
          'create a beautifull sass page in single file index.html',
        ),
      ],
      machinePlan: {
        goal: 'Create a single-file, responsive, beautiful webpage using SASS styling saved as index.html',
        originalRequest: 'create a beautifull sass page in single file index.html',
        phase: 'completed',
        tasks: [
          {
            id: 'task-1',
            title: 'Generate polished single-file SASS index.html',
            prompt: 'Create the page in index.html.',
            status: 'completed',
            dependsOn: [],
          },
        ],
        model: 'openai/gpt-5.5',
        thinkingLevel: 'medium',
        generatedAt: 1,
        finishedAt: 2,
      },
    })

    expect(resolved.map((message) => message.id)).toEqual([
      'optimistic-user-machine-request',
      'assistant-task',
    ])
  })

  it('still reorders the machine original request when the workspace snapshot is unavailable', () => {
    const resolved = resolveTranscriptMessages({
      activeSessionId: SESSION_DETAIL_ID,
      activeWorkspace: null,
      messages: [
        uiMessage('assistant-1', 'assistant', 'Started implementing the page.'),
        uiMessage('assistant-2', 'assistant', 'Verifying the final result.'),
        uiMessage(
          'optimistic-user-machine-request',
          'user',
          'create a beautifull sass page in single file index.html',
        ),
      ],
      machinePlan: {
        goal: 'Create a single-file, responsive, beautiful webpage using SASS styling saved as index.html',
        originalRequest: 'create a beautifull sass page in single file index.html',
        phase: 'failed',
        tasks: [
          {
            id: 'task-1',
            title: 'Generate polished single-file SASS index.html',
            prompt: 'Create the page in index.html.',
            status: 'failed',
            dependsOn: [],
            lastError: 'Machine run was cancelled.',
          },
        ],
        model: 'openai/gpt-5.5',
        thinkingLevel: 'medium',
        generatedAt: 1,
        approvedAt: 2,
        finishedAt: 3,
        lastError: 'Machine run was cancelled.',
      },
    })

    expect(resolved.map((message) => message.id)).toEqual([
      'optimistic-user-machine-request',
      'assistant-1',
      'assistant-2',
    ])
  })

  it('reorders the visible machine request from transcript-local signals when machine branch state is missing', () => {
    const resolved = resolveTranscriptMessages({
      activeSessionId: SESSION_DETAIL_ID,
      activeWorkspace: null,
      messages: [
        uiMessage(
          'hidden-machine-planner-prompt',
          'user',
          `Machine mode is enabled.
You are the planning agent for a sequential coding workflow.
Return exactly one JSON object and no prose.
User request:
create a beautifull sass page in single file index.html`,
          new Date('2026-07-05T20:45:46.100Z'),
        ),
        uiMessage(
          'assistant-1',
          'assistant',
          'Started implementing the page.',
          new Date('2026-07-05T20:45:50.585Z'),
        ),
        uiMessage(
          'assistant-2',
          'assistant',
          'Verifying the final result.',
          new Date('2026-07-05T20:45:50.857Z'),
        ),
        uiMessage(
          'optimistic-user-machine-request',
          'user',
          'create a beautifull sass page in single file index.html',
          new Date('2026-07-05T20:45:46.326Z'),
        ),
      ],
      machinePlan: null,
    })

    expect(resolved.map((message) => message.id)).toEqual([
      'optimistic-user-machine-request',
      'assistant-1',
      'assistant-2',
    ])
  })

  it('filters internal machine tool-handoff assistant payloads from the visible transcript', () => {
    const assistantTask = sessionNode(
      'assistant-task',
      null,
      'assistant',
      'Verifying the updated index.html now.',
      0,
    )

    const resolved = resolveTranscriptMessages({
      activeSessionId: SESSION_DETAIL_ID,
      activeWorkspace: workspaceWithPath([assistantTask], assistantTask.id, assistantTask.id),
      messages: [
        uiMessage('assistant-task', 'assistant', 'Verifying the updated index.html now.'),
        uiMessage(
          'assistant-tool-handoff',
          'assistant',
          `[TOOL_HANDOFF]
{"type":"tool_handoff","tool":"read","tool_call_id":"call_123","status":"ok","summary":"File read complete."}`,
        ),
      ],
      machinePlan: {
        goal: 'Create a single-file, responsive, beautiful webpage using SASS styling saved as index.html',
        originalRequest: 'create a beautifull sass page in single file index.html',
        phase: 'completed',
        tasks: [
          {
            id: 'task-1',
            title: 'Generate polished single-file SASS index.html',
            prompt: 'Create the page in index.html.',
            status: 'completed',
            dependsOn: [],
          },
        ],
        model: 'openai/gpt-5.5',
        thinkingLevel: 'medium',
        generatedAt: 1,
        finishedAt: 2,
      },
    })

    expect(resolved.map((message) => message.id)).toEqual(['assistant-task'])
  })

  it('keeps persisted machine task transcript rows in the flat transcript', () => {
    const assistantTask = sessionNode('assistant-task', null, 'assistant', 'Created the file.', 0)

    const resolved = resolveTranscriptMessages({
      activeSessionId: SESSION_DETAIL_ID,
      activeWorkspace: workspaceWithPath([assistantTask], assistantTask.id, assistantTask.id),
      messages: [
        uiMessage('user-1', 'user', 'create a beautifull sass page in single file index.html'),
        uiMessage('assistant-task', 'assistant', 'Created the file.'),
      ],
      machinePlan: {
        goal: 'Create a single-file, responsive, beautiful webpage using SASS styling saved as index.html',
        originalRequest: 'create a beautifull sass page in single file index.html',
        phase: 'completed',
        tasks: [
          {
            id: 'task-1',
            title: 'Generate polished single-file SASS index.html',
            prompt: 'Create the page in index.html.',
            status: 'completed',
            messageIds: ['assistant-task'],
            dependsOn: [],
          },
        ],
        model: 'openai/gpt-5.5',
        thinkingLevel: 'medium',
        generatedAt: 1,
        finishedAt: 2,
      },
    })

    expect(resolved.map((message) => message.id)).toEqual(['assistant-task'])
  })
})

describe('getUIMessageTextCached', () => {
  it('returns the same value as getUIMessageText', () => {
    const message = uiMessage('m-1', 'user', 'hello world')
    expect(getUIMessageTextCached(message)).toBe(getUIMessageText(message))
  })

  it('concatenates multiple text parts (correctness of the cached path)', () => {
    const message = {
      id: 'm-2',
      role: 'assistant' as const,
      parts: [
        { type: 'text', content: 'first' },
        { type: 'tool-call', id: 'tc', name: 'read', arguments: '', state: 'complete' },
        { type: 'text', content: 'second' },
      ],
      createdAt: new Date(1),
    }
    expect(getUIMessageTextCached(message)).toBe('first\n\nsecond')
  })

  it('is stable across repeated calls on the same message object', () => {
    const message = uiMessage('m-3', 'user', 'unchanged')
    expect(getUIMessageTextCached(message)).toBe('unchanged')
    expect(getUIMessageTextCached(message)).toBe('unchanged')
  })
})
