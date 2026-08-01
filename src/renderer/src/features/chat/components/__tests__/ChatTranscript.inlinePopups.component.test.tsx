/**
 * Every PENDING inline popup must reach the screen.
 *
 * These are blocking round trips: the main process parks the agent on a resolver
 * and waits for the user's answer. A popup whose state is set but which never
 * renders leaves the run thinking forever with nothing to click — which is
 * exactly what happened when the render gate omitted plan review.
 */

import type { UIMessage } from '@shared/types/chat-ui'
import type { PendingPlanReviewRequest } from '@shared/types/plan-review'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUIStore } from '@/shell/ui-store'
import type { ChatTranscriptSectionState } from '../../model'

const REQUEST_ANIMATION_FRAME_DELAY_MS = 16

vi.mock('../ChatRowRenderer', () => ({
  ChatRowRenderer: () => <div>row-content</div>,
}))

vi.mock('../WelcomeScreen', () => ({
  WelcomeScreen: () => <div>welcome</div>,
}))

vi.mock('@/shared/lib/cn', () => ({
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}))

// Stand-ins: this suite is about whether the popups are REACHED, not how they look.
vi.mock('../PlanReviewCard', () => ({
  PlanReviewCard: () => <div data-testid="plan-review-card">plan review</div>,
}))

vi.mock('../ToolPermissionInlineCard', () => ({
  ToolPermissionInlineCard: () => <div data-testid="tool-permission-card">tool permission</div>,
}))

vi.mock('../UserQuestionCard', () => ({
  UserQuestionCard: () => <div data-testid="user-question-card">user question</div>,
}))

import { ChatTranscript } from '../ChatTranscript'

function createSection(overrides: Partial<ChatTranscriptSectionState> = {}) {
  const message: UIMessage = {
    id: 'msg-1',
    role: 'user',
    parts: [{ type: 'text', content: 'hello' }],
  }

  return {
    messages: [message],
    isLoading: false,
    projectPath: '/repo',
    recentProjects: [],
    activeSessionId: null,
    machinePlan: null,
    chatRows: [
      { type: 'message', message, isStreaming: false, isRunActive: false, showTurnDivider: false },
    ],
    lastUserMessageId: 'msg-1',
    streamSignalVersion: 0,
    userDidSend: false,
    onUserDidSendConsumed: vi.fn(),
    onOpenProject: vi.fn().mockResolvedValue(undefined),
    onSelectProjectPath: vi.fn(),
    onRetryText: vi.fn().mockResolvedValue(undefined),
    onOpenSettings: vi.fn(),
    onApproveMachinePlan: vi.fn().mockResolvedValue(undefined),
    onDiscardMachinePlan: vi.fn().mockResolvedValue(undefined),
    onDismissError: vi.fn(),
    onDismissInterruptedRun: vi.fn(),
    onBranchFromMessage: vi.fn(),
    onForkFromMessage: vi.fn(),
    ...overrides,
  }
}

function planReview(): PendingPlanReviewRequest {
  return {
    planReviewId: 'review-1',
    revision: 1,
    task: 'add a header',
    revisionsRemaining: 3,
    planSet: {
      plans: [
        {
          id: 'plan-1',
          title: 'Ship it',
          summary: '',
          tasks: [
            {
              id: 't1',
              order: 1,
              title: 'Add the header',
              summary: 'new component',
              files: ['src/Header.tsx'],
              fileMutations: { 'src/Header.tsx': 'write' },
              complexity: 'medium',
            },
          ],
        },
      ],
      executionOrder: ['plan-1'],
    },
  }
}

function toolPermission() {
  return {
    toolCallId: 'call-1',
    toolName: 'write',
    input: {},
    summary: 'write a file',
    messageId: 'live:call-1',
  }
}

async function renderTranscript(overrides: Partial<ChatTranscriptSectionState>) {
  render(<ChatTranscript section={createSection(overrides)} />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(REQUEST_ANIMATION_FRAME_DELAY_MS)
  })
}

describe('ChatTranscript inline popups', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    if (!Element.prototype.scrollTo) {
      Element.prototype.scrollTo = vi.fn()
    }
    vi.useFakeTimers()
    useUIStore.setState(useUIStore.getInitialState())
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) =>
      window.setTimeout(() => callback(performance.now()), REQUEST_ANIMATION_FRAME_DELAY_MS),
    )
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((handle) => {
      window.clearTimeout(handle)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('renders the plan review card when it is the ONLY pending popup', async () => {
    // The regression: `create_plan` blocks on this card, and a tool permission is
    // already resolved by the time it appears — so nothing else is pending. If the
    // render gate ignores plan review, the run thinks forever with no way out.
    await renderTranscript({ pendingPlanReviewRequest: planReview() })
    expect(screen.getByTestId('plan-review-card')).toBeInTheDocument()
  })

  it('renders a tool permission and a plan review together', async () => {
    await renderTranscript({
      pendingToolPermissionRequest: toolPermission(),
      pendingPlanReviewRequest: planReview(),
    })
    expect(screen.getByTestId('tool-permission-card')).toBeInTheDocument()
    expect(screen.getByTestId('plan-review-card')).toBeInTheDocument()
  })

  it('renders no popup when nothing is pending', async () => {
    await renderTranscript({})
    expect(screen.queryByTestId('plan-review-card')).not.toBeInTheDocument()
    expect(screen.queryByTestId('tool-permission-card')).not.toBeInTheDocument()
    expect(screen.queryByTestId('user-question-card')).not.toBeInTheDocument()
  })
})
