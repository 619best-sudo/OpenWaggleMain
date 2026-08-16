import { match } from '@diegogbrisa/ts-match'
import { useEffect, useState } from 'react'
import { useChat } from '@/features/chat/hooks'
import { useDiffRouteNavigation } from '@/features/diff-panel/hooks'
import { CommitDialog } from '@/features/git/components'
import { useGit } from '@/features/git/hooks'
import { forgetNonRepositoryPath } from '@/features/git/state'
import { useProject } from '@/features/sessions/hooks'
import { cn } from '@/shared/lib/cn'
import { useUIStore } from '@/shell/ui-store'
import { CommitButton, DiffToggleButton, HeaderLeft, TerminalButton } from './HeaderControls'

export function Header() {
  const { activeSession } = useChat()
  const { projectPath } = useProject()
  const sidebarOpen = useUIStore((s) => s.sidebarOpen)
  const terminalOpen = useUIStore((s) => s.terminalOpen)

  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const toggleTerminal = useUIStore((s) => s.toggleTerminal)
  const bumpDiffRefreshKey = useUIStore((s) => s.bumpDiffRefreshKey)
  const showToast = useUIStore((s) => s.showToast)

  const {
    status: gitStatus,
    error: gitError,
    isLoading: gitLoading,
    isCommitting: gitCommitting,
    refreshStatus: refreshGitStatus,
    refreshBranches: refreshGitBranches,
    commit: commitGit,
  } = useGit()

  const [commitOpen, setCommitOpen] = useState(false)
  const { closeDiff, diffOpen, isChatRoute, toggleDiff } = useDiffRouteNavigation()
  const gitUnavailable = Boolean(projectPath && gitError && !gitLoading && !gitStatus)
  const showCommitButton = Boolean(projectPath) && !gitUnavailable
  const showDiffButton = Boolean(projectPath) && isChatRoute && !gitUnavailable
  const showSeparator = showDiffButton

  function handleRefreshGit() {
    // An explicit refresh should re-probe a folder we previously wrote off as
    // "not a repo" — the user may have just run `git init`.
    forgetNonRepositoryPath(projectPath)
    void refreshGitStatus(projectPath)
    void refreshGitBranches(projectPath)
    bumpDiffRefreshKey()
  }

  async function handleCommitGit(message: string, amend: boolean, paths: string[]) {
    if (!projectPath) {
      return {
        ok: false as const,
        code: 'not-git-repo' as const,
        message: 'No project selected.',
      }
    }
    return match
      .promise(commitGit(projectPath, { message, amend, paths }))
      .with({ ok: true }, (result) => {
        bumpDiffRefreshKey()
        showToast(`Commit created: ${result.summary}`)
        return result
      })
      .with({ ok: false }, (result) => result)
      .exhaustive()
  }

  const title = activeSession?.title ?? 'New session'

  useEffect(() => {
    if (diffOpen && gitError) {
      closeDiff()
    }
  }, [closeDiff, diffOpen, gitError])

  return (
    <>
      <header
        className={cn(
          'drag-region flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-bg px-5',
        )}
      >
        <HeaderLeft sidebarOpen={sidebarOpen} title={title} onToggleSidebar={toggleSidebar} />

        <div className="flex shrink-0 items-center gap-2">
          <TerminalButton open={terminalOpen} projectPath={projectPath} onToggle={toggleTerminal} />
          {showCommitButton && (
            <CommitButton
              isCommitting={gitCommitting}
              projectPath={projectPath}
              onOpen={() => setCommitOpen(true)}
            />
          )}
          {showSeparator && <div className="h-5 w-px bg-border/40" />}
          {showDiffButton && (
            <DiffToggleButton
              error={gitError}
              isChatRoute={isChatRoute}
              isLoading={gitLoading}
              open={diffOpen}
              projectPath={projectPath}
              status={gitStatus}
              onToggle={toggleDiff}
            />
          )}
        </div>
      </header>

      {commitOpen && (
        <CommitDialog
          projectPath={projectPath}
          status={gitStatus}
          statusError={gitError}
          isRefreshing={gitLoading}
          isCommitting={gitCommitting}
          onRefresh={handleRefreshGit}
          onCommit={handleCommitGit}
          onClose={() => setCommitOpen(false)}
        />
      )}
    </>
  )
}
