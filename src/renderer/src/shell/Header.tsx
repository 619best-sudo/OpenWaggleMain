import { match } from '@diegogbrisa/ts-match'
import { useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useChat } from '@/features/chat/hooks'
import { useDiffRouteNavigation } from '@/features/diff-panel/hooks'
import { CommitDialog } from '@/features/git/components'
import { useGit } from '@/features/git/hooks'
import { useProject, useSessions } from '@/features/sessions/hooks'
import { cn } from '@/shared/lib/cn'
import { useUIStore } from '@/shell/ui-store'
import {
  CommitButton,
  DiffToggleButton,
  HeaderLeft,
  SessionTreeButton,
  TerminalButton,
} from './HeaderControls'

export function Header() {
  const { activeSession } = useChat()
  const { activeSessionTree } = useSessions()
  const { projectPath } = useProject()
  const pathname = useRouterState({ select: (state) => state.location.pathname })

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
  const { closeDiff, diffOpen, isChatRoute, sessionTreeOpen, toggleDiff, toggleSessionTree } =
    useDiffRouteNavigation()
  const isFramedWorkspaceRoute =
    isChatRoute ||
    pathname.startsWith('/mcp') ||
    pathname.startsWith('/skills') ||
    pathname.startsWith('/waggle')

  function handleRefreshGit() {
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

  const title = activeSessionTree?.session.title ?? activeSession?.title ?? 'New session'

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
        <HeaderLeft
          sidebarOpen={sidebarOpen}
          title={title}
          onToggleSidebar={toggleSidebar}
        />

        <div className="flex shrink-0 items-center gap-2">
          <TerminalButton open={terminalOpen} projectPath={projectPath} onToggle={toggleTerminal} />
          <CommitButton
            isCommitting={gitCommitting}
            projectPath={projectPath}
            onOpen={() => setCommitOpen(true)}
          />
          <div className="w-px h-5 bg-border/40" />
          <SessionTreeButton
            hasSessionTree={Boolean(activeSessionTree)}
            isChatRoute={isChatRoute}
            open={sessionTreeOpen}
            onToggle={toggleSessionTree}
          />
          <DiffToggleButton
            error={gitError}
            isChatRoute={isChatRoute}
            isLoading={gitLoading}
            open={diffOpen}
            projectPath={projectPath}
            status={gitStatus}
            onToggle={toggleDiff}
          />
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
