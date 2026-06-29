import { MessageId, SessionBranchId, SessionId, SessionNodeId } from '@shared/types/brand'
import type { SessionNode } from '@shared/types/session'
import { describe, expect, it } from 'vitest'
import { mergeBackgroundReconnectMessages } from '../chat-reconnect-merge'
import { resolveTranscriptMessages } from '../session-workspace-transcript'

const SESSION_ID = SessionId('session-1')
const SESSION_DETAIL_ID = SessionId('session-1')
const MAIN_BRANCH_ID = SessionBranchId('session-1:main')

function uiMessage(id: string, role: 'user' | 'assistant', content: string) {
  return {
    id,
    role,
    parts: [{ type: 'text', content }],
    createdAt: new Date(1),
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
    const persistedNextUser = sessionNode('persisted-next-user', 'assistant-head', 'user', 'Keep refining the landing page.', 2)

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
      activeWorkspace: workspaceWithPath([user, assistant, internalPrompt], internalPrompt.id, internalPrompt.id),
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
      activeWorkspace: workspaceWithPath([user, persistedAssistant], persistedAssistant.id, persistedAssistant.id),
      messages: mergedMessages,
    })

    expect(resolved.map((message) => message.id)).toEqual(['1c141f11', 'fc0f92fb'])
  })
})
