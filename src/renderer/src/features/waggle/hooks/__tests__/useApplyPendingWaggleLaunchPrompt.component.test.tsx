// @vitest-environment jsdom

import { SessionBranchId, SessionId, SessionNodeId } from '@shared/types/brand'
import { DEFAULT_SETTINGS } from '@shared/types/settings'
import type { SessionWorkspace } from '@shared/types/session'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useComposerStore } from '@/features/composer/state'
import { useSessionStore } from '@/features/sessions/state'
import { usePreferencesStore } from '@/features/settings/state'
import { useWaggleLaunchPromptStore } from '../../state'
import { useApplyPendingWaggleLaunchPrompt } from '../useApplyPendingWaggleLaunchPrompt'

const SESSION_ID = SessionId('session-1')
const MAIN_BRANCH_ID = SessionBranchId('session-1:main')
const ACTIVE_NODE_ID = SessionNodeId('assistant-1')

function workspace(): SessionWorkspace {
  return {
    tree: {
      session: {
        id: SESSION_ID,
        title: 'Backend session',
        projectPath: '/tmp/openwaggle-project',
        createdAt: 1,
        updatedAt: 1,
        lastActiveNodeId: ACTIVE_NODE_ID,
        lastActiveBranchId: MAIN_BRANCH_ID,
      },
      nodes: [],
      branches: [
        {
          id: MAIN_BRANCH_ID,
          sessionId: SESSION_ID,
          sourceNodeId: null,
          headNodeId: ACTIVE_NODE_ID,
          name: 'main',
          isMain: true,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      branchStates: [],
      uiState: null,
    },
    activeBranchId: MAIN_BRANCH_ID,
    activeNodeId: ACTIVE_NODE_ID,
    transcriptPath: [],
  }
}

describe('useApplyPendingWaggleLaunchPrompt', () => {
  beforeEach(() => {
    useComposerStore.setState(useComposerStore.getInitialState())
    useSessionStore.setState({
      ...useSessionStore.getInitialState(),
      activeWorkspace: workspace(),
      draftBranch: null,
    })
    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      settings: {
        ...DEFAULT_SETTINGS,
        projectPath: '/tmp/openwaggle-project',
      },
    })
    useWaggleLaunchPromptStore.setState({ pendingBySessionId: {} })
  })

  it('applies a pending launch prompt into the active composer draft for the session', async () => {
    useWaggleLaunchPromptStore
      .getState()
      .queuePrompt(SESSION_ID, 'backend-engineer', 'Implement the projects API and verify DB writes.')

    renderHook(() => useApplyPendingWaggleLaunchPrompt(SESSION_ID))

    await waitFor(() => {
      expect(useComposerStore.getState().input).toBe(
        'Implement the projects API and verify DB writes.',
      )
      expect(
        useWaggleLaunchPromptStore.getState().pendingBySessionId[String(SESSION_ID)],
      ).toBeUndefined()
    })
  })
})
