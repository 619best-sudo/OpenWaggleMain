import type { GitStatusSummary } from '@shared/types/git'
import { Hash, ListTree, PanelLeft, SquareTerminal } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'

interface HeaderLeftProps {
  readonly sidebarOpen: boolean
  readonly title: string
  readonly onToggleSidebar: () => void
}

interface TerminalButtonProps {
  readonly open: boolean
  readonly projectPath: string | null
  readonly onToggle: () => void
}

interface CommitButtonProps {
  readonly isCommitting: boolean
  readonly projectPath: string | null
  readonly onOpen: () => void
}

interface SessionTreeButtonProps {
  readonly hasSessionTree: boolean
  readonly isChatRoute: boolean
  readonly open: boolean
  readonly onToggle: () => void
}

interface DiffToggleButtonProps {
  readonly error: string | null
  readonly isChatRoute: boolean
  readonly isLoading: boolean
  readonly open: boolean
  readonly projectPath: string | null
  readonly status: GitStatusSummary | null
  readonly onToggle: () => void
}

export function HeaderLeft({
  sidebarOpen,
  title,
  onToggleSidebar,
}: HeaderLeftProps) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
      {!sidebarOpen && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Show sidebar"
          aria-expanded={sidebarOpen}
          onClick={onToggleSidebar}
          className="no-drag"
          title="Show sidebar"
        >
          <PanelLeft className="size-4" />
        </Button>
      )}

      <Hash className="no-drag size-3.5 shrink-0 text-text-muted" />
      <div className="flex min-w-0 flex-1 items-center overflow-hidden whitespace-nowrap">
        <span className="no-drag block min-w-0 flex-1 truncate text-[14px] font-medium text-text-primary">
          {title}
        </span>
      </div>
    </div>
  )
}

function terminalTitle(projectPath: string | null, terminalOpen: boolean) {
  if (!projectPath) {
    return 'No project selected'
  }

  return terminalOpen ? 'Hide terminal' : 'Open terminal'
}

export function TerminalButton({ open, projectPath, onToggle }: TerminalButtonProps) {
  return (
    <Button
      variant="secondary"
      size="none"
      radius="sm"
      aria-label={open ? 'Hide terminal' : 'Open terminal'}
      aria-expanded={open}
      onClick={onToggle}
      className={cn(
        'no-drag h-7 border border-border bg-transparent px-2.5 hover:bg-bg-hover',
        !projectPath && 'pointer-events-none opacity-30',
      )}
      disabled={!projectPath}
      title={terminalTitle(projectPath, open)}
    >
      <SquareTerminal className="size-3.5 text-text-tertiary" />
      <span className="text-[13px] font-medium text-text-primary">{open ? 'Hide' : 'Open'}</span>
      <span className="text-[9px] text-text-muted">&#x2228;</span>
    </Button>
  )
}

export function CommitButton({ isCommitting, projectPath, onOpen }: CommitButtonProps) {
  const disabled = !projectPath || isCommitting

  return (
    <Button
      variant="unstyled"
      size="none"
      radius="sm"
      aria-label="Open commit dialog"
      onClick={onOpen}
      className={cn(
        'no-drag inline-flex h-7 items-center justify-center gap-1.5 rounded-md bg-accent px-2.5 text-accent-foreground transition-colors hover:bg-accent-dim',
        disabled && 'pointer-events-none opacity-40',
      )}
      disabled={disabled}
      title={projectPath ? 'Open commit dialog' : 'No project selected'}
    >
      <span className="text-[13px] font-semibold">Commit</span>
      <span className="text-[9px] opacity-50">&#x2228;</span>
    </Button>
  )
}

export function SessionTreeButton({
  hasSessionTree,
  isChatRoute,
  open,
  onToggle,
}: SessionTreeButtonProps) {
  const disabled = !hasSessionTree || !isChatRoute

  return (
    <Button
      variant={open ? 'subtle' : 'secondary'}
      size="none"
      radius="sm"
      aria-label="Toggle Session Tree"
      aria-expanded={open}
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        'no-drag h-7 border border-border px-2 hover:bg-bg-hover',
        open ? 'bg-bg-active' : 'bg-transparent',
        disabled && 'pointer-events-none opacity-30',
      )}
      title={hasSessionTree ? 'Toggle Session Tree' : 'No session tree available'}
    >
      <ListTree className="size-3.5 text-text-tertiary" />
    </Button>
  )
}

function diffStatusText(error: string | null, isLoading: boolean) {
  if (isLoading) {
    return 'Loading diff…'
  }

  return error ? 'Git unavailable' : 'Diff unavailable'
}

export function DiffToggleButton({
  error,
  isChatRoute,
  isLoading,
  open,
  projectPath,
  status,
  onToggle,
}: DiffToggleButtonProps) {
  const disabled = !projectPath || !isChatRoute || Boolean(error && !isLoading && !status)

  return (
    <Button
      variant="ghost"
      size="none"
      aria-label="Toggle diff panel"
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        'no-drag gap-1 hover:bg-white/5 px-2 h-7 rounded-md transition-colors',
        disabled && 'pointer-events-none opacity-30',
        open && 'bg-white/10',
      )}
      title="Toggle diff panel"
    >
      {status ? (
        <>
          <span className="text-[13px] font-medium text-[#8ba57b]">+{status.additions}</span>
          <span className="text-[13px] font-medium text-red-400">-{status.deletions}</span>
        </>
      ) : (
        <span className="text-[13px] font-medium text-[#71717a]">
          {diffStatusText(error, isLoading)}
        </span>
      )}
    </Button>
  )
}
