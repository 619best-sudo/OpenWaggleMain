// @vitest-environment jsdom

import {
  MessageId,
  SessionBranchId,
  SessionId,
  SessionNodeId,
  SupportedModelId,
} from '@shared/types/brand'
import type { SessionNode, SessionWorkspace } from '@shared/types/session'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/sessions/state'
import { useTranscriptSection } from '../useTranscriptSection'

const SESSION_ID = SessionId('session-refresh')
const MAIN_BRANCH_ID = SessionBranchId('session-refresh:main')

function uiMessage(id: string, role: 'user' | 'assistant', content: string) {
  return {
    id,
    role,
    parts: [{ type: 'text', content }],
    createdAt: new Date(1),
  }
}

function messageNode(
  id: string,
  parentId: string | null,
  role: 'user' | 'assistant',
  content: string,
  createdOrder: number,
): SessionNode {
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

function phaseTranscriptNode(createdOrder: number): SessionNode {
  return {
    id: SessionNodeId(`phase-transcript-${createdOrder}`),
    sessionId: SESSION_ID,
    parentId: SessionNodeId('assistant-1'),
    piEntryType: 'custom',
    kind: 'custom',
    timestampMs: createdOrder + 1,
    createdOrder,
    pathDepth: createdOrder,
    branchId: MAIN_BRANCH_ID,
    contentJson: JSON.stringify({
      customType: 'openwaggle.phase-transcript',
      data: {
        version: 1,
        phases: [
          {
            id: 'perform',
            label: 'Performing',
            activityText: 'Applying code modifications',
            status: 'completed',
            elapsedMs: 1000,
            summary: 'Updated the HTML title.',
            tools: [],
          },
        ],
      },
    }),
    metadataJson: '{}',
  }
}

function workspaceWithNodes(nodes: readonly SessionNode[], activeNodeId: SessionNodeId): SessionWorkspace {
  return {
    tree: {
      session: {
        id: SESSION_ID,
        title: 'Refresh test',
        projectPath: '/tmp/project',
        createdAt: 1,
        updatedAt: 3,
        lastActiveNodeId: activeNodeId,
        lastActiveBranchId: MAIN_BRANCH_ID,
      },
      nodes,
      branches: [
        {
          id: MAIN_BRANCH_ID,
          sessionId: SESSION_ID,
          sourceNodeId: null,
          headNodeId: activeNodeId,
          name: 'main',
          isMain: true,
          createdAt: 1,
          updatedAt: 3,
        },
      ],
      branchStates: [],
      uiState: null,
    },
    activeBranchId: MAIN_BRANCH_ID,
    activeNodeId,
    transcriptPath: nodes.map((node) => ({
      node,
      branchId: node.branchId,
      isActive: node.id === activeNodeId,
    })),
  }
}

const phase = {
  current: null,
  phases: [],
  completed: [],
  totalElapsedMs: 0,
  completedAtMs: null,
  reset: vi.fn(),
}

describe('useTranscriptSection refresh recovery', () => {
  beforeEach(() => {
    useSessionStore.setState({
      ...useSessionStore.getInitialState(),
      activeWorkspace: null,
    })
  })

  it('keeps rendering the last persisted phase transcript while workspace reloads', () => {
    const user = messageNode('user-1', null, 'user', 'edit the title', 0)
    const assistant = messageNode('assistant-1', 'user-1', 'assistant', 'Raw assistant chatter', 1)
    const transcript = phaseTranscriptNode(2)

    useSessionStore.setState({
      activeWorkspace: workspaceWithNodes([user, assistant, transcript], assistant.id),
    })

    const { result } = renderHook(() =>
      useTranscriptSection({
        messages: [
          uiMessage('user-1', 'user', 'edit the title'),
          uiMessage('assistant-1', 'assistant', 'Raw assistant chatter'),
        ],
        isLoading: false,
        isSteering: false,
        error: undefined,
        streamSignalVersion: 0,
        projectPath: '/tmp/project',
        recentProjects: [],
        activeSessionId: SESSION_ID,
        activeSession: null,
        machinePlan: null,
        model: SupportedModelId('openai/gpt-5'),
        waggleStatus: 'idle',
        phase,
        handleOpenProject: vi.fn(),
        handleSelectProjectPath: vi.fn(),
        handleSendText: vi.fn(),
        handleApproveMachinePlan: vi.fn(),
        handleDiscardMachinePlan: vi.fn(),
        openSettings: vi.fn(),
        handleDismissInterruptedRun: vi.fn(),
        handleResolveUserQuestion: vi.fn(),
        pendingUserQuestionRequest: null,
        handleBranchFromMessage: vi.fn(),
        handleForkFromMessage: vi.fn(),
        userDidSend: false,
        onUserDidSendConsumed: vi.fn(),
      }),
    )

    expect(result.current.chatRows.some((row) => row.type === 'phase')).toBe(true)

    act(() => {
      useSessionStore.setState({ activeWorkspace: null })
    })

    expect(result.current.chatRows.some((row) => row.type === 'phase')).toBe(true)
  })

  it('renders persisted phase rows from hydrated message metadata before the workspace reloads', () => {
    const { result } = renderHook(() =>
      useTranscriptSection({
        messages: [
          uiMessage('user-1', 'user', 'edit the title'),
          {
            id: 'phase-transcript-message',
            role: 'assistant',
            parts: [],
            createdAt: new Date(2),
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
          },
        ],
        isLoading: false,
        isSteering: false,
        error: undefined,
        streamSignalVersion: 0,
        projectPath: '/tmp/project',
        recentProjects: [],
        activeSessionId: SESSION_ID,
        activeSession: null,
        machinePlan: null,
        model: SupportedModelId('openai/gpt-5'),
        waggleStatus: 'idle',
        phase,
        handleOpenProject: vi.fn(),
        handleSelectProjectPath: vi.fn(),
        handleSendText: vi.fn(),
        handleApproveMachinePlan: vi.fn(),
        handleDiscardMachinePlan: vi.fn(),
        openSettings: vi.fn(),
        handleDismissInterruptedRun: vi.fn(),
        handleResolveUserQuestion: vi.fn(),
        pendingUserQuestionRequest: null,
        handleBranchFromMessage: vi.fn(),
        handleForkFromMessage: vi.fn(),
        userDidSend: false,
        onUserDidSendConsumed: vi.fn(),
      }),
    )

    expect(result.current.chatRows.some((row) => row.type === 'phase')).toBe(true)
    expect(
      result.current.chatRows.some(
        (row) =>
          row.type === 'message' &&
          row.message.role === 'assistant' &&
          row.message.id === 'phase-transcript-message',
      ),
    ).toBe(false)
  })
})
