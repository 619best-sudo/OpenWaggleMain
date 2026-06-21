import type { GitStatusSummary } from '@shared/types/git'
import { Loader2 } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { Checkbox } from '@/shared/ui/Checkbox'
import { Textarea } from '@/shared/ui/Textarea'

const ROWS = 3
const COMMIT_MESSAGE_ID = 'commit-message'

const STATUS_CLASS: Record<string, string> = {
  modified: 'text-text-secondary',
  added: 'text-diff-add-text',
  deleted: 'text-diff-remove-text',
  renamed: 'text-accent',
  copied: 'text-accent',
  untracked: 'text-text-tertiary',
  unknown: 'text-text-tertiary',
}

interface CommitDialogBodyProps {
  readonly status: GitStatusSummary | null
  readonly statusError: string | null
  readonly error: string | null
  readonly form: {
    readonly message: string
    readonly amend: boolean
    readonly selectedPaths: ReadonlySet<string>
  }
  readonly actions: {
    readonly onMessageChange: (message: string) => void
    readonly onAmendChange: (amend: boolean) => void
    readonly onTogglePath: (filePath: string) => void
    readonly onToggleAll: () => void
  }
}

export function CommitDialogBody({
  status,
  statusError,
  error,
  form,
  actions,
}: CommitDialogBodyProps) {
  const changedFiles = status?.changedFiles ?? []
  return (
    <div className="space-y-4 bg-bg p-4">
      {statusError && (
        <p className="rounded-lg border border-error/20 bg-error/8 px-3 py-2 text-[13px] text-error">
          {statusError}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-error/20 bg-error/8 px-3 py-2 text-[13px] text-error">
          {error}
        </p>
      )}
      <ChangedFilesSelector
        changedFiles={changedFiles}
        selectedPaths={form.selectedPaths}
        onToggleAll={actions.onToggleAll}
        onTogglePath={actions.onTogglePath}
      />
      <CommitMessageFields form={form} actions={actions} />
    </div>
  )
}

function CommitMessageFields({
  form,
  actions,
}: {
  readonly form: { readonly message: string; readonly amend: boolean }
  readonly actions: {
    readonly onMessageChange: (message: string) => void
    readonly onAmendChange: (amend: boolean) => void
  }
}) {
  return (
    <>
      <label className="block" htmlFor={COMMIT_MESSAGE_ID}>
        <span className="mb-1.5 block text-[13px] font-medium text-text-secondary">
          Commit message
        </span>
        <Textarea
          id={COMMIT_MESSAGE_ID}
          rows={ROWS}
          value={form.message}
          onChange={(e) => actions.onMessageChange(e.target.value)}
          placeholder="Describe your changes"
          resize="none"
          className="bg-bg text-sm text-text-primary placeholder:text-text-muted focus:border-accent/40 focus:ring-1 focus:ring-accent/15"
        />
      </label>
      <Checkbox
        checked={form.amend}
        onChange={(e) => actions.onAmendChange(e.target.checked)}
        label="Amend last commit"
      />
    </>
  )
}

function ChangedFilesSelector({
  changedFiles,
  selectedPaths,
  onToggleAll,
  onTogglePath,
}: {
  readonly changedFiles: NonNullable<GitStatusSummary['changedFiles']>
  readonly selectedPaths: ReadonlySet<string>
  readonly onToggleAll: () => void
  readonly onTogglePath: (filePath: string) => void
}) {
  return (
    <div className="max-h-[220px] overflow-y-auto rounded-xl border border-border-light bg-bg-secondary/35">
      {changedFiles.length > 0 && (
        <div className="flex items-center gap-2 border-b border-border bg-bg-secondary/60 px-3 py-2">
          <Checkbox
            checked={selectedPaths.size === changedFiles.length}
            onChange={onToggleAll}
          />
          <span className="text-[12px] font-medium text-text-tertiary">
            {selectedPaths.size === changedFiles.length ? 'Deselect all' : 'Select all'}
          </span>
        </div>
      )}
      {changedFiles.length === 0 ? (
        <div className="px-3 py-2 text-[13px] text-text-tertiary">No file changes detected.</div>
      ) : (
        changedFiles.map((file) => (
          <Checkbox
            key={file.path}
            checked={selectedPaths.has(file.path)}
            onChange={() => onTogglePath(file.path)}
            label={
              <>
                <span className={cn('flex-1 truncate text-[13px]', STATUS_CLASS[file.status])}>
                  {file.path}
                </span>
                <span className="w-[72px] shrink-0 text-right font-mono text-[12px] tracking-tight text-text-tertiary">
                  {file.additions > 0 ? <span className="text-diff-add-text">+{file.additions}</span> : ''}
                  {file.additions > 0 && file.deletions > 0 ? ' / ' : ''}
                  {file.deletions > 0 ? (
                    <span className="text-diff-remove-text">-{file.deletions}</span>
                  ) : (
                    ''
                  )}
                </span>
              </>
            }
            labelClassName="w-full border-b border-border/80 px-3 py-2 last:border-b-0 transition-colors hover:bg-bg-hover/70"
          />
        ))
      )}
    </div>
  )
}

interface CommitDialogFooterProps {
  readonly canSubmit: boolean
  readonly isCommitting: boolean
  readonly onClose: () => void
  readonly onCommit: () => void
}

export function CommitDialogFooter({
  canSubmit,
  isCommitting,
  onClose,
  onCommit,
}: CommitDialogFooterProps) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-border bg-bg-secondary/30 px-4 py-3">
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
      <Button
        variant="accent"
        onClick={onCommit}
        disabled={!canSubmit}
        leftIcon={isCommitting ? <Loader2 className="size-3.5 animate-spin" /> : undefined}
      >
        Commit
      </Button>
    </div>
  )
}
