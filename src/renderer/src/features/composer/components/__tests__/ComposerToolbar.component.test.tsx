import { SupportedModelId } from '@shared/types/brand'
import { DEFAULT_SETTINGS } from '@shared/types/settings'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppAuthStore } from '@/features/auth/state/app-auth-store'
import { useComposerActionStore } from '@/features/composer/state/composer-action-store'
import { useComposerStore } from '@/features/composer/state/composer-store'
import { useGitStore } from '@/features/git/state'
import { usePreferencesStore } from '@/features/settings/state'
import { ComposerToolbar } from '../ComposerToolbar'

vi.mock('@/shared/lib/ipc', () => ({
  api: {
    getSettings: vi.fn().mockResolvedValue({}),
    updateSettings: vi.fn().mockResolvedValue({ ok: true }),
    getProviderModels: vi.fn().mockResolvedValue([]),
    getGitStatus: vi.fn().mockResolvedValue(null),
    listGitBranches: vi.fn().mockResolvedValue(null),
    checkoutGitBranch: vi.fn().mockResolvedValue({ ok: true, message: 'Checked out' }),
    createGitBranch: vi.fn().mockResolvedValue({ ok: true, message: 'ok' }),
    renameGitBranch: vi.fn().mockResolvedValue({ ok: true, message: 'ok' }),
    deleteGitBranch: vi.fn().mockResolvedValue({ ok: true, message: 'ok' }),
    setGitBranchUpstream: vi.fn().mockResolvedValue({ ok: true, message: 'ok' }),
  },
}))

const SELECTED_MODEL = SupportedModelId('openai/gpt-5')

function renderToolbar(overrides: Partial<Parameters<typeof ComposerToolbar>[0]> = {}) {
  const fileInputRef: React.RefObject<HTMLInputElement | null> = { current: null }
  const defaults = {
    onSend: vi.fn(),
    onCancel: vi.fn(),
    isLoading: false,
    canSend: true,
    onToggleVoice: vi.fn(),
    voiceMode: 'idle' as const,
    fileInputRef,
  }
  return render(<ComposerToolbar {...defaults} {...overrides} />)
}

describe('ComposerToolbar', () => {
  beforeEach(() => {
    useComposerActionStore.setState(useComposerActionStore.getInitialState())
    useComposerStore.setState(useComposerStore.getInitialState())
    useAppAuthStore.setState(useAppAuthStore.getInitialState())
    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      settings: {
        ...DEFAULT_SETTINGS,
        selectedModel: SELECTED_MODEL,
        enabledModels: [SELECTED_MODEL],
        projectPath: '/test/project',
      },
      isLoaded: true,
    })
    useGitStore.setState({
      ...useGitStore.getInitialState(),
      status: {
        branch: 'main',
        additions: 0,
        deletions: 0,
        filesChanged: 0,
        changedFiles: [],
        clean: true,
        ahead: 0,
        behind: 0,
      },
      branches: {
        branches: [{ name: 'main', fullName: 'main', isCurrent: true, isRemote: false }],
      },
    })
  })

  it('renders a compact turing machine quota strip beside the context meter', () => {
    renderToolbar()

    expect(screen.getByText('Used')).toBeInTheDocument()
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('shows exhausted turing machine quota as 100 percent used', () => {
    useAppAuthStore.setState({
      subscriptionSnapshot: {
        tier: {
          key: 'pro',
          name: 'Pro',
          descriptionMarkdown: 'Pro plan',
          turingMachineQuotaUsdCents: 3000,
        },
        subscription: {
          status: 'active',
          billingCycle: 'monthly',
          currentPeriodStart: '2026-06-01T00:00:00.000Z',
          currentPeriodEnd: '2026-07-01T00:00:00.000Z',
          cancelAtPeriodEnd: false,
        },
        pricing: {
          billingCycle: 'monthly',
          originalCents: 5000,
          discountedCents: null,
          finalCents: 5000,
          discountPercent: 0,
        },
        turingMachine: {
          quotaUsdCents: 3000,
          consumedUsdCents: 3000,
          remainingUsdCents: 0,
          percentUsed: 0,
        },
      },
    })

    renderToolbar()

    expect(screen.getByText('Used')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('renders the branch picker when a project is selected', () => {
    renderToolbar()
    expect(screen.getByTitle(/Manage branches/)).toBeInTheDocument()
    expect(screen.getByText('main')).toBeInTheDocument()
  })

  it('renders the future tool permission selector', () => {
    renderToolbar()
    expect(screen.getByTitle('Permission: Ask')).toBeInTheDocument()
  })

  it('updates the future tool permission selector mode', async () => {
    renderToolbar()

    fireEvent.click(screen.getByTitle('Permission: Ask'))
    fireEvent.click(screen.getByRole('button', { name: /Allow all/i }))

    await waitFor(() => {
      expect(usePreferencesStore.getState().settings.toolPermissionMode).toBe('allow-all')
    })
  })

  it('does not render the branch picker when no project is selected', () => {
    usePreferencesStore.setState({
      settings: {
        ...usePreferencesStore.getState().settings,
        projectPath: null,
      },
    })

    renderToolbar()

    expect(screen.queryByTitle(/Manage branches/)).toBeNull()
  })

  it('does not render the thinking control in the composer toolbar', () => {
    renderToolbar()
    expect(screen.queryByTitle('Select thinking level')).toBeNull()
  })

  it('renders send button when not loading', () => {
    renderToolbar()
    expect(screen.getByTitle('Send message')).toBeInTheDocument()
  })

  it('renders cancel button when loading', () => {
    renderToolbar({ isLoading: true })
    expect(screen.getByTitle('Cancel')).toBeInTheDocument()
  })

  it('renders both cancel and add-message buttons when loading and canSend', () => {
    renderToolbar({ isLoading: true, canSend: true })
    expect(screen.getByTitle('Cancel')).toBeInTheDocument()
    expect(screen.getByTitle('Add message')).toBeInTheDocument()
  })

  it('calls onSend when send button is clicked', () => {
    const onSend = vi.fn()
    renderToolbar({ onSend })
    fireEvent.click(screen.getByTitle('Send message'))
    expect(onSend).toHaveBeenCalledOnce()
  })

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn()
    renderToolbar({ isLoading: true, onCancel })
    fireEvent.click(screen.getByTitle('Cancel'))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('disables send button when canSend is false', () => {
    renderToolbar({ canSend: false })
    const button = screen.getByTitle('Send message')
    expect(button).toBeDisabled()
  })

  it('shows mic button that toggles voice', () => {
    const onToggleVoice = vi.fn()
    renderToolbar({ onToggleVoice })
    fireEvent.click(screen.getByTitle('Start voice input'))
    expect(onToggleVoice).toHaveBeenCalledOnce()
  })

  it('shows transcribing state for mic button', () => {
    renderToolbar({ voiceMode: 'transcribing' })
    expect(screen.getByTitle('Transcribing audio')).toBeInTheDocument()
  })
})
