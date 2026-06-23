import { SessionId, SupportedModelId } from '@shared/types/brand'
import { DEFAULT_SETTINGS } from '@shared/types/settings'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePreferencesStore } from '@/features/settings/state'
import { TeammatesPanel } from '../TeammatesPanel'

const {
  createSessionMock,
  generateTeamAgentMock,
  navigateMock,
  sendTeamMessageMock,
  showToastMock,
} = vi.hoisted(() => ({
  createSessionMock: vi.fn(),
  generateTeamAgentMock: vi.fn(),
  navigateMock: vi.fn(),
  sendTeamMessageMock: vi.fn(),
  showToastMock: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('@/features/chat/hooks/useChat', () => ({
  useChat: () => ({
    activeSession: null,
    activeSessionId: null,
    createSession: createSessionMock,
  }),
}))

vi.mock('@/shared/lib/ipc', () => ({
  api: {
    generateTeamAgent: generateTeamAgentMock,
    sendTeamMessage: sendTeamMessageMock,
  },
}))

vi.mock('@/shell/ui-store', () => ({
  useUIStore: <T,>(selector: (state: { showToast: typeof showToastMock }) => T) =>
    selector({ showToast: showToastMock }),
}))

describe('TeammatesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createSessionMock.mockResolvedValue(SessionId('session-team-1'))
    generateTeamAgentMock.mockResolvedValue({
      label: 'Reviewer',
      kind: 'reviewer',
      roleDescription: 'Review the latest changes and report issues.',
      whyToRun: 'Use before stop to verify the output.',
      runWhen: ['when-routed', 'before-stop'],
      createPrompt: 'app-generated',
      suggestedNextAgentIfSuccess: 'agent-1',
    })
    sendTeamMessageMock.mockResolvedValue(undefined)
    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      settings: {
        ...DEFAULT_SETTINGS,
        projectPath: '/repo/openwaggle',
        selectedModel: SupportedModelId('openai/gpt-5'),
      },
      isLoaded: true,
    })
  })

  it('launches the built-in teammate into a session and sends the first team prompt', async () => {
    render(<TeammatesPanel />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[1]!)
    expect(screen.getByLabelText('Task prompt')).toHaveValue('')
    fireEvent.change(screen.getByLabelText('Task prompt'), {
      target: { value: 'Create a SaaS landing page and make sure it opens.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Launch Team(New)' }))

    await waitFor(() => {
      expect(createSessionMock).toHaveBeenCalledWith('/repo/openwaggle')
      expect(sendTeamMessageMock).toHaveBeenCalledWith(
        SessionId('session-team-1'),
        expect.objectContaining({
          text: 'Create a SaaS landing page and make sure it opens.',
          thinkingLevel: DEFAULT_SETTINGS.thinkingLevel,
        }),
        SupportedModelId('openai/gpt-5'),
        expect.objectContaining({
          loopPolicy: expect.objectContaining({
            decisionMakerAgentId: 'web-verifier',
          }),
          agents: expect.arrayContaining([
            expect.objectContaining({ id: 'web-planner' }),
            expect.objectContaining({ id: 'web-builder' }),
            expect.objectContaining({ id: 'web-verifier' }),
          ]),
        }),
      )
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/sessions/$sessionId',
        params: { sessionId: 'session-team-1' },
      })
      expect(showToastMock).toHaveBeenCalledWith('"Web Executor" launched in Team(New).', 'success')
    })
  })

  it('launches a custom team built from the new agent form', async () => {
    render(<TeammatesPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Create Team' }))
    fireEvent.change(screen.getByLabelText('Team name'), {
      target: { value: 'Review Squad' },
    })
    fireEvent.change(screen.getByLabelText('Team task prompt'), {
      target: { value: 'Review the latest code changes and decide whether the work is ready.' },
    })
    // Expand Loop Policy & UI section
    fireEvent.click(screen.getByText('Loop Policy & UI'))
    fireEvent.change(screen.getByLabelText('Decision maker'), {
      target: { value: 'agent-1' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'Launch Custom Team' })[0]!)

    await waitFor(() => {
      expect(sendTeamMessageMock).toHaveBeenCalledWith(
        SessionId('session-team-1'),
        expect.objectContaining({
          text: 'Review the latest code changes and decide whether the work is ready.',
          thinkingLevel: DEFAULT_SETTINGS.thinkingLevel,
        }),
        SupportedModelId('openai/gpt-5'),
        expect.objectContaining({
          name: 'Review Squad',
          loopPolicy: expect.objectContaining({
            decisionMakerAgentId: 'agent-1',
            initialAgentId: 'agent-1',
          }),
          agents: expect.arrayContaining([
            expect.objectContaining({
              id: 'agent-1',
              kind: 'decision-maker',
              isDecisionMaker: true,
            }),
          ]),
        }),
      )
      expect(showToastMock).toHaveBeenCalledWith('"Review Squad" launched in Team(New).', 'success')
    })
  })

  it('generates agent setup from instructions using the Team API', async () => {
    render(<TeammatesPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Create Team' }))
    fireEvent.click(screen.getByRole('button', { name: '✨ Generate with AI' }))
    fireEvent.change(screen.getByLabelText('Agent instructions'), {
      target: { value: 'Reviewer who checks bugs and missing tests before stop.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate Fields' }))

    await waitFor(() => {
      expect(generateTeamAgentMock).toHaveBeenCalledWith('/repo/openwaggle', 'openai/gpt-5', {
        instructions: 'Reviewer who checks bugs and missing tests before stop.',
        availableAgentIds: ['agent-1'],
        availableAgentLabels: ['Executor'],
      })
      expect(screen.getByLabelText('Agent name')).toHaveValue('Reviewer')
      expect(screen.getByLabelText('Role description')).toHaveValue(
        'Review the latest changes and report issues.',
      )
      expect(showToastMock).toHaveBeenCalledWith('Generated setup for "Reviewer".', 'success')
    })
  })
})
