import type { GitCommitResult, GitStatusSummary } from '@shared/types/git'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Button } from '@/shared/ui/Button'
import { Header } from '../Header'
import { useUIStore } from '../ui-store'

interface CommitDialogProps {
  readonly onClose: () => void
  readonly onCommit: (message: string, amend: boolean, paths: string[]) => Promise<GitCommitResult>
  readonly onRefresh: () => void
}

const headerMocks = vi.hoisted(() => {
  const gitStatus: GitStatusSummary = {
    branch: 'main',
    additions: 3,
    deletions: 1,
    filesChanged: 2,
    changedFiles: [],
    clean: false,
    ahead: 0,
    behind: 0,
  }
  return {
    pathname: '/skills',
    projectPath: '/repo/openwaggle',
    gitError: null as string | null,
    gitStatus: gitStatus as GitStatusSummary | null,
    diffOpen: false,
    refreshStatus: vi.fn().mockResolvedValue(undefined),
    refreshBranches: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue({ ok: true, commitHash: 'abc123', summary: 'abc123' }),
    closeDiff: vi.fn(),
    toggleDiff: vi.fn(),
  }
})

vi.mock('@tanstack/react-router', () => ({
  useRouterState: <T,>(input: {
    readonly select: (state: { location: { pathname: string } }) => T
  }) => input.select({ location: { pathname: headerMocks.pathname } }),
}))

vi.mock('@/features/chat/hooks', () => ({
  useChat: () => ({ activeSession: { title: 'Fallback title' } }),
}))

vi.mock('@/features/diff-panel/hooks', () => ({
  useDiffRouteNavigation: () => ({
    diffOpen: headerMocks.diffOpen,
    isChatRoute: true,
    closeDiff: headerMocks.closeDiff,
    toggleDiff: headerMocks.toggleDiff,
  }),
}))

vi.mock('@/features/git/components', () => ({
  CommitDialog: ({ onClose, onCommit, onRefresh }: CommitDialogProps) => (
    <section>
      Commit dialog
      <Button variant="unstyled" type="button" onClick={onRefresh}>
        Refresh git
      </Button>
      <Button
        variant="unstyled"
        type="button"
        onClick={() => void onCommit('Ship it', false, ['src/app.ts'])}
      >
        Confirm commit
      </Button>
      <Button variant="unstyled" type="button" onClick={onClose}>
        Close commit
      </Button>
    </section>
  ),
}))

vi.mock('@/features/git/hooks', () => ({
  useGit: () => ({
    status: headerMocks.gitStatus,
    error: headerMocks.gitError,
    isLoading: false,
    isCommitting: false,
    refreshStatus: headerMocks.refreshStatus,
    refreshBranches: headerMocks.refreshBranches,
    commit: headerMocks.commit,
  }),
}))

vi.mock('@/features/sessions/hooks', () => ({
  useProject: () => ({ projectPath: headerMocks.projectPath }),
}))

describe('Header', () => {
  beforeEach(() => {
    headerMocks.pathname = '/skills'
    headerMocks.projectPath = '/repo/openwaggle'
    headerMocks.gitError = null
    headerMocks.gitStatus = {
      branch: 'main',
      additions: 3,
      deletions: 1,
      filesChanged: 2,
      changedFiles: [],
      clean: false,
      ahead: 0,
      behind: 0,
    }
    headerMocks.diffOpen = false
    useUIStore.setState({
      diffRefreshKey: 0,
      feedbackModalOpen: false,
      sidebarOpen: true,
      terminalOpen: false,
      toastData: null,
      toastMessage: null,
    })
    headerMocks.refreshStatus.mockClear()
    headerMocks.refreshBranches.mockClear()
    headerMocks.commit.mockClear()
    headerMocks.closeDiff.mockClear()
    headerMocks.toggleDiff.mockClear()
  })

  it('renders session/project context and wires app-level controls', async () => {
    render(<Header />)

    expect(screen.getByText('Fallback title')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open terminal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle diff panel' }))

    expect(useUIStore.getState().terminalOpen).toBe(true)
    expect(headerMocks.toggleDiff).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Open commit dialog' }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh git' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm commit' }))

    expect(screen.getByText('Commit dialog')).toBeInTheDocument()
    expect(headerMocks.refreshStatus).toHaveBeenCalledWith('/repo/openwaggle')
    expect(headerMocks.refreshBranches).toHaveBeenCalledWith('/repo/openwaggle')
    await waitFor(() =>
      expect(headerMocks.commit).toHaveBeenCalledWith('/repo/openwaggle', {
        message: 'Ship it',
        amend: false,
        paths: ['src/app.ts'],
      }),
    )
    expect(useUIStore.getState().diffRefreshKey).toBe(2)
    expect(useUIStore.getState().toastData?.message).toBe('Commit created: abc123')
  })

  it('closes the diff panel when Git becomes unavailable', async () => {
    headerMocks.diffOpen = true
    headerMocks.gitError = 'not a git repo'

    render(<Header />)

    await waitFor(() => expect(headerMocks.closeDiff).toHaveBeenCalledOnce())
  })

  it('hides git actions when the current project is not a git repo', () => {
    headerMocks.pathname = '/skills'
    headerMocks.gitError = 'not a git repo'
    headerMocks.gitStatus = null
    headerMocks.projectPath = '/repo/openwaggle'

    render(<Header />)

    expect(screen.getByRole('button', { name: 'Open terminal' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open commit dialog' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Toggle diff panel' })).not.toBeInTheDocument()
  })
})
