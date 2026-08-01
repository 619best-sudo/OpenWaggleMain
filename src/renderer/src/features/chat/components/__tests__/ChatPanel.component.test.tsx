import { SessionId, SessionNodeId, SupportedModelId } from '@shared/types/brand'
import type { UIMessage } from '@shared/types/chat-ui'
import { DEFAULT_SETTINGS } from '@shared/types/settings'
import { WAGGLE_INHERIT_MODEL } from '@shared/types/waggle'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { fromPartial } from '@total-typescript/shoehorn'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMessageQueueStore } from '@/features/chat/state'
import { useBranchSummaryStore } from '@/features/chat/state/branch-summary-store'
import { replaceComposerText } from '@/features/composer/lib/set-composer-text'
import { useComposerStore } from '@/features/composer/state'
import { useProviderStore } from '@/features/providers/state'
import { usePreferencesStore } from '@/features/settings/state'
import { useWaggleStore } from '@/features/waggle/state'
import type { ChatPanelSections } from '../../model'
import { ChatPanel, ChatPanelContent } from '../ChatPanel'

const useChatPanelSectionsMock = vi.hoisted(() => vi.fn<() => ChatPanelSections>())

vi.mock('../../hooks/use-chat-panel-controller', () => ({
  useChatPanelSections: useChatPanelSectionsMock,
}))

vi.mock('@/shared/lib/ipc', () => ({
  api: {
    getSettings: vi.fn().mockResolvedValue({}),
    updateSettings: vi.fn().mockResolvedValue({ ok: true }),
    getProviderModels: vi.fn().mockResolvedValue([]),
    getGitStatus: vi.fn().mockResolvedValue(null),
    listGitBranches: vi.fn().mockResolvedValue(null),
    checkoutGitBranch: vi.fn().mockResolvedValue({ ok: true, message: 'ok' }),
    createGitBranch: vi.fn().mockResolvedValue({ ok: true, message: 'ok' }),
    renameGitBranch: vi.fn().mockResolvedValue({ ok: true, message: 'ok' }),
    deleteGitBranch: vi.fn().mockResolvedValue({ ok: true, message: 'ok' }),
    setGitBranchUpstream: vi.fn().mockResolvedValue({ ok: true, message: 'ok' }),
    resolveToolPermission: vi.fn().mockResolvedValue(undefined),
    prepareAttachments: vi.fn().mockResolvedValue([]),
    onWaggleEvent: vi.fn(() => () => undefined),
    onWaggleTurnEvent: vi.fn(() => () => undefined),
  },
}))

function makeMessage(overrides: Partial<UIMessage> & { id: string; role: 'user' | 'assistant' }) {
  return fromPartial<UIMessage>({
    parts: [],
    ...overrides,
  })
}

function createSections(
  overrides: Partial<ChatPanelSections['transcript']> = {},
  composerOverrides: Partial<ChatPanelSections['composer']> = {},
) {
  const transcript = {
    messages: [],
    isLoading: false,
    projectPath: '/test/project',
    recentProjects: [],
    activeSessionId: SessionId('session-1'),
    chatRows: [],
    lastUserMessageId: null,
    streamSignalVersion: 0,
    userDidSend: false,
    onUserDidSendConsumed: vi.fn(),
    pendingToolPermissionRequest: null,
    toolPermissionBusy: false,
    toolPermissionError: null,
    onOpenProject: vi.fn().mockResolvedValue(undefined),
    onSelectProjectPath: vi.fn(),
    onRetryText: vi.fn().mockResolvedValue(undefined),
    onOpenSettings: vi.fn(),
    onDismissError: vi.fn(),
    onDismissToolPermission: vi.fn(),
    onApproveToolPermission: vi.fn().mockResolvedValue(undefined),
    onDenyToolPermission: vi.fn().mockResolvedValue(undefined),
    onDismissInterruptedRun: vi.fn(),
    onBranchFromMessage: vi.fn(),
    onForkFromMessage: vi.fn(),
    ...overrides,
  }

  return {
    transcript,
    composer: {
      activeSessionId: transcript.activeSessionId,
      waggleStatus: 'idle',
      followUpSuggestion: null,
      commandPaletteOpen: false,
      slashSkills: [],
      forkSelectorOpen: false,
      forkTargets: [],
      isLoading: transcript.isLoading,
      status: transcript.isLoading ? 'streaming' : 'ready',
      compactionStatus: null,
      activeTeammate: null,
      teamStatus: 'idle',
      onStopCollaboration: vi.fn(),
      onSelectSkill: vi.fn(),
      onStartWaggle: vi.fn(),
      onStartTeam: vi.fn(),
      onClearTeamMode: vi.fn(),
      onSendWithWaggle: vi.fn().mockResolvedValue(undefined),
      onSteer: vi.fn().mockResolvedValue(undefined),
      onCancel: vi.fn(),
      onToast: vi.fn(),
      onUseFollowUpPrompt: vi.fn(),
      onSkipBranchSummary: vi.fn(),
      onSummarizeBranch: vi.fn(),
      onStartCustomBranchSummary: vi.fn(),
      onCancelBranchSummary: vi.fn(),
      onOpenForkSelector: vi.fn(),
      onCloseForkSelector: vi.fn(),
      onSelectForkTarget: vi.fn(),
      onCloneToNewSession: vi.fn(),
      ...composerOverrides,
    },
    diff: {
      projectPath: transcript.projectPath,
      onSendMessage: transcript.onRetryText,
    },
  }
}

function renderPanel(
  overrides: Partial<ChatPanelSections['transcript']> = {},
  composerOverrides: Partial<ChatPanelSections['composer']> = {},
) {
  useChatPanelSectionsMock.mockReturnValue(createSections(overrides, composerOverrides))
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ChatPanel />
    </QueryClientProvider>,
  )
}

describe('ChatPanel', () => {
  beforeEach(() => {
    useBranchSummaryStore.setState(useBranchSummaryStore.getInitialState())
    useComposerStore.setState(useComposerStore.getInitialState())
    useMessageQueueStore.setState({ queues: new Map() })
    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      settings: {
        ...DEFAULT_SETTINGS,
        projectPath: '/test/project',
        selectedModel: SupportedModelId('openai/gpt-5'),
      },
      isLoaded: true,
    })
    useProviderStore.setState({
      ...useProviderStore.getInitialState(),
      providerModels: [],
    })
    useWaggleStore.getState().reset()
  })

  it('shows welcome screen when no messages', () => {
    renderPanel()
    expect(screen.getByText('What are we building?')).toBeInTheDocument()
    expect(screen.queryByText('Explore more')).toBeNull()
  })

  it('renders the redesigned welcome heading and project picker', () => {
    renderPanel()

    const heading = screen.getByRole('heading', { name: 'What are we building?' })
    const projectPickerButton = screen.getByRole('button', { name: 'project' })

    expect(heading).toHaveClass('font-bold')
    expect(projectPickerButton).toHaveClass('bg-accent', 'text-[16px]', 'font-semibold')
  })

  it('opens the folder picker directly from the empty-state CTA', () => {
    const onOpenProject = vi.fn().mockResolvedValue(undefined)
    renderPanel({
      projectPath: null,
      recentProjects: ['/test/other-project'],
      onOpenProject,
    })

    fireEvent.click(screen.getByRole('button', { name: /select a project folder to get started/i }))

    expect(onOpenProject).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Select folder…')).toBeNull()
  })

  it('keeps the active-project menu available when a project is already selected', () => {
    renderPanel({
      recentProjects: ['/test/other-project'],
    })

    fireEvent.click(screen.getByTitle('Open project picker'))

    expect(screen.getByText('Select folder…')).toBeInTheDocument()
    expect(screen.getByText('Recent projects')).toBeInTheDocument()
  })

  it('shows thinking phase indicator when loading with no assistant message', () => {
    renderPanel({
      isLoading: true,
      chatRows: [{ type: 'phase-indicator', label: 'Thinking', elapsedMs: 123 }],
    })
    const loader = document.querySelector('[data-phase-loader="true"]')
    expect(loader).toBeInTheDocument()
    expect(loader).toHaveClass('size-7')
    expect(screen.getByText('Thinking')).toBeInTheDocument()
  })

  it('uses the light loader in light theme', () => {
    usePreferencesStore.setState({
      ...usePreferencesStore.getState(),
      settings: {
        ...usePreferencesStore.getState().settings,
        themeMode: 'light',
      },
    })

    renderPanel({
      isLoading: true,
      chatRows: [{ type: 'phase-indicator', label: 'Thinking', elapsedMs: 0 }],
    })

    const loader = document.querySelector('[data-phase-loader="true"]')
    expect(loader).toBeInTheDocument()
    expect(loader).toHaveAttribute('src', expect.stringContaining('loader-light.gif'))
  })

  it('renders messages when present', () => {
    const message = makeMessage({
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', content: 'Hello agent' }],
    })
    renderPanel({
      messages: [message],
      chatRows: [{ type: 'message', message, isStreaming: false, showTurnDivider: false }],
    })
    expect(screen.queryByText(/open a project/i)).toBeNull()
    expect(document.querySelector('[data-user-message-id="u1"]')).toHaveClass('px-5')
    expect(document.querySelector('[data-user-message-id="u1"]')).toHaveClass('max-w-[960px]')
  })

  it('shows the inline tool permission card when a pending request exists', () => {
    renderPanel({
      pendingToolPermissionRequest: {
        messageId: 'assistant-1',
        toolCallId: 'tool-1',
        toolName: 'bash',
        input: { command: 'ls -la' },
        title: 'Approve Bash',
        description: 'Permission is required before running bash.',
        summary: 'Permission required before running bash: ls -la',
      },
    })

    expect(screen.getByText(/allow/i)).toBeInTheDocument()
    expect(screen.getByText('ls -la')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Deny' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Dismiss permission dialog' })).toBeNull()
  })

  it('shows a human-readable prompt for structured tools instead of raw JSON', () => {
    renderPanel({
      pendingToolPermissionRequest: {
        messageId: 'assistant-1',
        toolCallId: 'tool-mem',
        toolName: 'project_memory',
        input: { action: 'get' },
        title: 'Approve Project Memory',
        description: 'Permission is required before reading project memory.',
        summary: 'Permission required before reading project memory.',
      },
    })

    // No raw JSON should leak into the prompt.
    expect(screen.queryByText(/\{.*\}/)).toBeNull()
    expect(screen.getByText(/read project memory/i)).toBeInTheDocument()
    expect(screen.getByText('project_memory')).toBeInTheDocument()
  })

  it('renders the inline permission card above the gif loader', () => {
    renderPanel({
      isLoading: true,
      chatRows: [{ type: 'phase-indicator', label: 'Working', elapsedMs: 0 }],
      pendingToolPermissionRequest: {
        messageId: 'assistant-1',
        toolCallId: 'tool-1',
        toolName: 'bash',
        input: { command: 'ls -la' },
        title: 'Approve Bash',
        description: 'Permission is required before running bash.',
        summary: 'Permission required before running bash: ls -la',
      },
    })

    const loader = document.querySelector('[data-phase-loader="true"]')
    const approveButton = screen.getByRole('button', { name: 'Approve' })
    // Both should be present, and the permission card must come before the
    // loader in DOM order (the Approve button precedes the loader).
    expect(loader).toBeInTheDocument()
    expect(approveButton).toBeInTheDocument()
    expect(
      Boolean(loader.compareDocumentPosition(approveButton) & Node.DOCUMENT_POSITION_PRECEDING),
    ).toBe(true)
  })

  it('does not show the tool permission dialog while the routed session is switching', () => {
    const sections = createSections({
      activeSessionId: SessionId('session-1'),
      pendingToolPermissionRequest: {
        messageId: 'assistant-1',
        toolCallId: 'tool-1',
        toolName: 'bash',
        input: { command: 'ls -la' },
        title: 'Approve Bash',
        description: 'Permission is required before running bash.',
        summary: 'Permission required before running bash: ls -la',
      },
    })
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <ChatPanelContent sections={sections} routeSessionId="session-2" />
      </QueryClientProvider>,
    )

    expect(screen.queryByText('Permission')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })

  it('routes custom branch-summary submission through send instead of enqueue while loading', () => {
    const onSendWithWaggle = vi.fn().mockResolvedValue(undefined)
    useBranchSummaryStore.getState().openPrompt({
      sessionId: SessionId('session-1'),
      sourceNodeId: SessionNodeId('source-node'),
      restoreSelection: { branchId: null, nodeId: null },
      previousComposerText: 'original prompt',
      draftComposerText: 'draft prompt',
    })
    useBranchSummaryStore.getState().startCustomPrompt('draft prompt')
    useComposerStore.getState().setInput('focus on decisions')

    renderPanel(
      { isLoading: true },
      {
        isLoading: true,
        status: 'streaming',
        onSendWithWaggle,
      },
    )

    fireEvent.click(screen.getByTitle('Summarize branch'))

    expect(onSendWithWaggle).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'focus on decisions' }),
    )
    expect(useMessageQueueStore.getState().queues.get(SessionId('session-1'))).toBeUndefined()
  })

  it('renders the composer input area', () => {
    const { container } = renderPanel()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(container.querySelector('[data-chat-composer-form="true"]')).toHaveClass('max-w-[960px]')
  })

  it('copies the Turing user prompt into the composer when the CTA is clicked', () => {
    useWaggleStore.getState().startCollaboration(SessionId('session-1'), {
      mode: 'sequential',
      agents: [
        {
          label: 'Context Reader',
          model: WAGGLE_INHERIT_MODEL,
          roleDescription: 'Reads the request',
          color: 'blue',
        },
        {
          label: 'Installed Waggle Selector',
          model: WAGGLE_INHERIT_MODEL,
          roleDescription: 'Selects the next waggle',
          color: 'amber',
        },
      ],
      stop: { primary: 'consensus', maxTurnsSafety: 4 },
    })
    useWaggleStore.getState().handleTurnEvent({
      type: 'collaboration-complete',
      reason: 'Routing complete',
      totalTurns: 2,
    })

    renderPanel(
      {},
      {
        waggleStatus: 'completed',
        followUpSuggestion: {
          nextWaggle: 'product-planning',
          userPrompt:
            'Review the auth files, define the MVP scope, and produce acceptance criteria.',
          fallbackWaggle: 'code-review',
        },
        onUseFollowUpPrompt: (suggestion) => {
          replaceComposerText(suggestion.userPrompt)
        },
      },
    )

    fireEvent.click(screen.getByRole('button', { name: 'Use Prompt' }))

    expect(useComposerStore.getState().input).toBe(
      'Review the auth files, define the MVP scope, and produce acceptance criteria.',
    )
  })

  it('uses the darker sidenav-matched background for the chat panel shell', () => {
    const { container } = renderPanel()
    const mainPanel = container.querySelector('[data-chat-panel-main="true"]')
    expect(mainPanel).toHaveClass('bg-bg')
  })

  it('shows Writing phase when loading and assistant has streaming content', () => {
    const userMessage = makeMessage({
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', content: 'Hi' }],
    })
    const assistantMessage = makeMessage({
      id: 'a1',
      role: 'assistant',
      parts: [{ type: 'text', content: 'Hello!' }],
    })
    renderPanel({
      messages: [userMessage, assistantMessage],
      isLoading: true,
      chatRows: [
        { type: 'message', message: userMessage, isStreaming: false, showTurnDivider: false },
        { type: 'message', message: assistantMessage, isStreaming: true, showTurnDivider: false },
        { type: 'phase-indicator', label: 'Writing', elapsedMs: 456 },
      ],
    })
    const loader = document.querySelector('[data-phase-loader="true"]')
    expect(loader).toBeInTheDocument()
    expect(loader).toHaveClass('size-7')
    expect(screen.getByText('Writing')).toBeInTheDocument()
  })

  it('does not show phase indicator when not loading', () => {
    const userMessage = makeMessage({
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', content: 'Hi' }],
    })
    const assistantMessage = makeMessage({
      id: 'a1',
      role: 'assistant',
      parts: [{ type: 'text', content: 'Hello!' }],
    })
    renderPanel({
      messages: [userMessage, assistantMessage],
      isLoading: false,
      chatRows: [
        { type: 'message', message: userMessage, isStreaming: false, showTurnDivider: false },
        { type: 'message', message: assistantMessage, isStreaming: false, showTurnDivider: false },
      ],
    })
    const loader = document.querySelector('[data-phase-loader="true"]')
    expect(loader).toBeNull()
  })
})
