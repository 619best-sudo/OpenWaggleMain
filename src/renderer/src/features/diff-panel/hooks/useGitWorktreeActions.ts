import type { GitWorktreeResult } from '@shared/types/git'
import { useState } from 'react'
import { useGitStore } from '@/features/git/state'
import { api } from '@/shared/lib/ipc'
import { useUIStore } from '@/shell/ui-store'

/**
 * The diff panel's bottom-bar mutations: revert all and stage all.
 *
 * Lives outside DiffPanel so the component stays a projection of its
 * reducer; this hook owns the busy flag, the confirm gate, and the
 * post-success refresh Header also performs after a commit — git status
 * for the badge, then diffRefreshKey to remount the panel so getGitDiff
 * re-runs.
 */
export function useGitWorktreeActions(projectPath: string | null) {
  const [isBusy, setIsBusy] = useState(false)
  const showToast = useUIStore((s) => s.showToast)
  const bumpDiffRefreshKey = useUIStore((s) => s.bumpDiffRefreshKey)
  const refreshGitStatus = useGitStore((s) => s.refreshStatus)

  async function runWorktreeAction(
    verb: 'revert' | 'stage',
    run: (projectPath: string) => Promise<GitWorktreeResult | undefined>,
  ) {
    if (!projectPath || isBusy) return
    setIsBusy(true)
    try {
      // `undefined` means the action was dismissed at the confirm dialog.
      const result = await run(projectPath)
      if (!result) return
      if (result.ok) {
        showToast(result.summary, 'success')
        void refreshGitStatus(projectPath)
        bumpDiffRefreshKey()
      } else {
        showToast(result.message, 'error')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      showToast(`Failed to ${verb} changes: ${message}`, 'error')
    } finally {
      setIsBusy(false)
    }
  }

  function handleRevertAll() {
    void runWorktreeAction('revert', async (path) => {
      // Reverting throws away uncommitted work with no undo, so the native
      // dialog is the one mandatory gate between the click and `reset --hard`.
      const confirmed = await api.showConfirm(
        'Revert all changes in this project?',
        'Staged and unstaged changes to tracked files will be discarded. Untracked files are kept.',
      )
      if (!confirmed) return
      return api.revertAllGitChanges(path)
    })
  }

  function handleStageAll() {
    void runWorktreeAction('stage', (path) => api.stageAllGitChanges(path))
  }

  return { isBusy, handleRevertAll, handleStageAll }
}
