import type { SessionId } from '@shared/types/brand'
import { useEffect } from 'react'
import { buildComposerDraftContextKey } from '@/features/composer/lib/composer-draft-context'
import { replaceComposerText } from '@/features/composer/lib/set-composer-text'
import { useComposerStore } from '@/features/composer/state'
import { useSessionStore } from '@/features/sessions/state'
import { usePreferencesStore } from '@/features/settings/state'
import { useWaggleLaunchPromptStore } from '../state/waggle-launch-prompt-store'

export function useApplyPendingWaggleLaunchPrompt(activeSessionId: SessionId | null) {
  const projectPath = usePreferencesStore((state) => state.settings.projectPath)
  const activeWorkspace = useSessionStore((state) => state.activeWorkspace)
  const draftBranch = useSessionStore((state) => state.draftBranch)
  const pendingPrompt = useWaggleLaunchPromptStore((launchPromptState) =>
    activeSessionId ? launchPromptState.pendingBySessionId[String(activeSessionId)] ?? null : null,
  )

  useEffect(() => {
    if (!activeSessionId || !pendingPrompt || activeWorkspace?.tree.session.id !== activeSessionId) {
      return
    }

    const contextKey = buildComposerDraftContextKey({
      projectPath,
      sessionId: activeSessionId,
      activeBranchId: activeWorkspace.activeBranchId ?? null,
      activeNodeId: activeWorkspace.activeNodeId ?? null,
      draftSourceNodeId:
        draftBranch?.sessionId === activeSessionId ? draftBranch.sourceNodeId : null,
    })

    useComposerStore.getState().saveScopedDraft(contextKey, {
      input: pendingPrompt.prompt,
      attachments: [],
    })
    replaceComposerText(pendingPrompt.prompt)
    useWaggleLaunchPromptStore.getState().clearPrompt(activeSessionId)
  }, [activeSessionId, activeWorkspace, draftBranch, pendingPrompt, projectPath])
}
