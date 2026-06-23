import { useRouterState } from '@tanstack/react-router'
import { isLightThemeMode } from '@shared/types/settings'
import { useEffect, type ReactNode } from 'react'
import { useBackgroundRunMonitor } from '@/features/chat/hooks'
import { FeedbackModal } from '@/features/feedback/components'
import { Sidebar } from '@/features/sidebar/components'
import { usePreferences } from '@/features/settings/hooks'
import { Header } from '@/shell/Header'
import { ToastOverlay } from '@/shell/ToastOverlay'
import { useUIStore } from '@/shell/ui-store'
import { useAutoUpdater } from '@/shell/useAutoUpdater'
import { useWorkspaceLifecycle } from './useWorkspaceLifecycle'
import { WorkspaceTerminal } from './WorkspaceTerminal'

interface WorkspaceShellProps {
  readonly children: ReactNode
}

export function WorkspaceShell({ children }: WorkspaceShellProps) {
  useWorkspaceLifecycle()
  useBackgroundRunMonitor()
  useAutoUpdater()
  const { settings } = usePreferences()
  const feedbackModalOpen = useUIStore((s) => s.feedbackModalOpen)
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const showChatHeader = pathname === '/' || pathname.startsWith('/sessions/')

  useEffect(() => {
    document.documentElement.dataset.theme = settings.themeMode
    document.documentElement.style.colorScheme = isLightThemeMode(settings.themeMode)
      ? 'light'
      : 'dark'
  }, [settings.themeMode])

  return (
    <div className="flex size-full gap-2 overflow-hidden bg-bg-app p-2">
      <Sidebar />

      <div className="home-panel-frame flex min-w-0 flex-1 flex-col overflow-hidden rounded-[16px] bg-bg shadow-sm">
        {showChatHeader ? <Header /> : null}
        {children}
        <WorkspaceTerminal />
      </div>

      <ToastOverlay />
      {feedbackModalOpen && <FeedbackModal />}
    </div>
  )
}
