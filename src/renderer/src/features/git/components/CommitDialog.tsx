import { match } from '@diegogbrisa/ts-match'
import type { GitCommitResult, GitStatusSummary } from '@shared/types/git'
import { RefreshCw, X } from 'lucide-react'
import { useState } from 'react'
import { useEscapeHotkey } from '@/shared/hooks/useEscapeHotkey'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { CommitDialogBody, CommitDialogFooter } from './CommitDialogContent'

interface CommitDialogProps {
  projectPath: string | null
  status: GitStatusSummary | null
  statusError: string | null
  isRefreshing: boolean
  isCommitting: boolean
  onRefresh: () => void
  onCommit: (
    message: string,
    amend: boolean,
    paths: string[],
    push: boolean,
  ) => Promise<GitCommitResult>
  onClose: () => void
}

function humanCommitError(result: GitCommitResult) {
  if (result.ok) return ''

  return match(result.code)
    .with('empty-message', () => 'Commit message is required.')
    .with('nothing-to-commit', () => 'No changes are available to commit.')
    .with('merge-in-progress', () => 'A merge is in progress. Resolve it before committing.')
    .with('not-git-repo', () => 'Selected folder is not a Git repository.')
    .with('no-upstream', () => 'This branch has no upstream remote. Set one before pushing.')
    .with('push-rejected', () => 'Push was rejected by the remote. Pull or sync, then try again.')
    .with('remote-auth', () => 'Remote authentication failed. Check your Git credentials.')
    .otherwise(() => result.message)
}

export function CommitDialog({
  projectPath,
  status,
  statusError,
  isRefreshing,
  isCommitting,
  onRefresh,
  onCommit,
  onClose,
}: CommitDialogProps) {
  const [message, setMessage] = useState('')
  const [amend, setAmend] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingAction, setLoadingAction] = useState<'commit' | 'push' | null>(null)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(
    () => new Set((status?.changedFiles ?? []).map((file) => file.path)),
  )
  const changedFiles = status?.changedFiles ?? []

  useEscapeHotkey(onClose)

  function togglePath(filePath: string) {
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(filePath)) {
        next.delete(filePath)
      } else {
        next.add(filePath)
      }
      return next
    })
  }

  function toggleAll() {
    setSelectedPaths(
      selectedPaths.size === changedFiles.length
        ? new Set()
        : new Set(changedFiles.map((file) => file.path)),
    )
  }

  async function handleCommit(push: boolean) {
    if (!projectPath || !message.trim() || selectedPaths.size === 0) return
    setError(null)
    setLoadingAction(push ? 'push' : 'commit')
    await match
      .promise(onCommit(message.trim(), amend, [...selectedPaths], push))
      .with({ ok: true }, () => onClose())
      .with({ ok: false }, (result) => {
        setLoadingAction(null)
        setError(humanCommitError(result))
      })
      .exhaustive()
  }

  const canSubmit = !!projectPath && !!message.trim() && selectedPaths.size > 0 && !isCommitting

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Commit changes"
    >
      <div className="w-full max-w-[620px] overflow-hidden rounded-2xl border border-border-light bg-bg shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-border bg-bg-secondary/50 px-4 py-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-text-primary">Commit changes</h2>
            <div className="flex items-center gap-3 border-l border-border pl-3 text-[13px] text-text-secondary">
              {status ? (
                <div className="flex items-center">
                  <span className="font-medium text-text-primary">
                    {selectedPaths.size}/{status.filesChanged}
                  </span>
                  <span className="ml-1">files selected</span>
                  <span className="mx-1.5 opacity-50">•</span>
                  <span className="font-medium text-diff-add-text">+{status.additions}</span>
                  <span className="mx-1 opacity-50">/</span>
                  <span className="font-medium text-diff-remove-text">-{status.deletions}</span>
                </div>
              ) : (
                <span>Git status unavailable</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="unstyled"
              type="button"
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary"
              onClick={onRefresh}
              title="Refresh status"
              disabled={isRefreshing}
            >
              <RefreshCw className={cn('size-3.5', isRefreshing && 'animate-spin')} />
              Refresh
            </Button>
            <Button
              variant="unstyled"
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary"
              title="Close"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <CommitDialogBody
          status={status}
          statusError={statusError}
          error={error}
          form={{ message, amend, selectedPaths }}
          actions={{
            onMessageChange: setMessage,
            onAmendChange: setAmend,
            onTogglePath: togglePath,
            onToggleAll: toggleAll,
          }}
        />
        <CommitDialogFooter
          canSubmit={canSubmit}
          isCommitting={isCommitting}
          loadingAction={loadingAction}
          onClose={onClose}
          onCommit={() => void handleCommit(false)}
          onCommitAndPush={() => void handleCommit(true)}
        />
      </div>
    </div>
  )
}
