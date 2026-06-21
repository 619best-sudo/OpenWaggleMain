import type { GitStatusSummary } from '@shared/types/git'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CommitDialog } from '../CommitDialog'

vi.mock('@/shared/hooks/useEscapeHotkey', () => ({
  useEscapeHotkey: vi.fn(),
}))

function status(): GitStatusSummary {
  return {
    branch: 'main',
    additions: 5,
    deletions: 2,
    filesChanged: 2,
    changedFiles: [
      {
        path: 'src/app.ts',
        status: 'modified',
        staged: false,
        additions: 3,
        deletions: 1,
      },
      {
        path: 'src/new.ts',
        status: 'added',
        staged: false,
        additions: 2,
        deletions: 1,
      },
    ],
    clean: false,
    ahead: 0,
    behind: 0,
  }
}

describe('CommitDialog', () => {
  it('commits the selected files with a trimmed message and closes on success', async () => {
    const onCommit = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        commitHash: 'abc123',
        summary: 'abc123',
        pushed: false,
        pushError: null,
      })
    const onClose = vi.fn()

    render(
      <CommitDialog
        projectPath="/repo"
        status={status()}
        statusError={null}
        isRefreshing={false}
        isCommitting={false}
        onRefresh={vi.fn()}
        onCommit={onCommit}
        onClose={onClose}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('Describe your changes'), {
      target: { value: '  Refactor shell  ' },
    })
    fireEvent.click(screen.getByLabelText('Amend last commit'))
    fireEvent.click(screen.getByText('src/new.ts'))
    fireEvent.click(screen.getByRole('button', { name: 'Commit' }))

    await waitFor(() =>
      expect(onCommit).toHaveBeenCalledWith('Refactor shell', true, ['src/app.ts'], false),
    )
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('supports committing and pushing from the dialog footer', async () => {
    const onCommit = vi.fn().mockResolvedValue({
      ok: true,
      commitHash: 'abc123',
      summary: 'abc123',
      pushed: true,
      pushError: null,
    })

    render(
      <CommitDialog
        projectPath="/repo"
        status={status()}
        statusError={null}
        isRefreshing={false}
        isCommitting={false}
        onRefresh={vi.fn()}
        onCommit={onCommit}
        onClose={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('Describe your changes'), {
      target: { value: 'Ship shell polish' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Commit & push' }))

    await waitFor(() =>
      expect(onCommit).toHaveBeenCalledWith(
        'Ship shell polish',
        false,
        ['src/app.ts', 'src/new.ts'],
        true,
      ),
    )
  })

  it('shows human commit failures without closing the dialog', async () => {
    const onCommit = vi.fn().mockResolvedValue({
      ok: false,
      code: 'nothing-to-commit',
      message: 'nothing changed',
    })
    const onClose = vi.fn()

    render(
      <CommitDialog
        projectPath="/repo"
        status={status()}
        statusError={null}
        isRefreshing={false}
        isCommitting={false}
        onRefresh={vi.fn()}
        onCommit={onCommit}
        onClose={onClose}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('Describe your changes'), {
      target: { value: 'No-op' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Commit' }))

    expect(await screen.findByText('No changes are available to commit.')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
