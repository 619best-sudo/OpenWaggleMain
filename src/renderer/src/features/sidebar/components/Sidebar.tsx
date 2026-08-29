import { useSessionStatusStore } from '@/features/sessions/state'
import { cn } from '@/shared/lib/cn'
import { SIDEBAR_LAYOUT } from '../constants/sidebar-layout'
import { useSidebarController } from '../hooks/useSidebarController'
import {
  SidebarBrandArea,
  SidebarPrimaryActions,
  SidebarProjectsHeader,
  SidebarRail,
  SidebarSettingsButton,
} from './SidebarNavigation'
import { SidebarProjectList } from './SidebarProjectList'

export function Sidebar() {
  const controller = useSidebarController()
  const markUnread = useSessionStatusStore((state) => state.markUnread)
  // Two distinct states, not one. The settings view takes the sidebar away
  // entirely (it has its own full-window navigation), while collapsing it keeps
  // a 50px icon rail so the primary actions never leave.
  const sidebarHidden = controller.activeView === 'settings'
  const railed = !controller.sidebarOpen && !sidebarHidden
  const renderState = {
    activeBranchId: controller.activeBranchId,
    activeSessionId: controller.activeSessionId,
    activeSessionTree: controller.matchingActiveSessionTree,
    collapsedProjectPaths: controller.collapsedProjectPaths,
    draftBranch: controller.draftBranch,
    draftSessionProjectPath: controller.draftSessionProjectPath,
    projectPath: controller.projectPath,
  }
  const projectActions = {
    newSession(nextProjectPath: string) {
      void controller.handleSelectProjectPath(nextProjectPath)
    },
    openInFinder: controller.handleOpenProjectInFinder,
    rename: controller.handleRenameProject,
    archiveSessions: controller.handleArchiveProjectSessions,
    remove: controller.handleRemoveProject,
    toggleCollapsed: controller.handleToggleProjectCollapsed,
  }
  const sessionActions = {
    select: controller.handleSelectSession,
    delete: controller.handleDeleteSession,
    archive: controller.handleArchiveSession,
    clone: controller.handleCloneSession,
    markUnread,
  }
  const branchActions = {
    select: controller.handleSelectBranch,
    rename: controller.handleRenameBranch,
    archive: controller.handleArchiveBranch,
    toggle: controller.handleToggleBranches,
  }

  return (
    <div
      aria-hidden={sidebarHidden ? true : undefined}
      inert={sidebarHidden ? true : undefined}
      className={cn(
        'shrink-0 overflow-hidden transition-[width] duration-200 ease-out',
        sidebarHidden
          ? 'w-0 pointer-events-none'
          : railed
            ? SIDEBAR_LAYOUT.RAIL_WIDTH_CLASS
            : SIDEBAR_LAYOUT.WIDTH_CLASS,
      )}
    >
      <nav
        aria-label="Sidebar"
        className={cn(
          'home-panel-frame flex h-full shrink-0 flex-col justify-between rounded-[16px] bg-bg-sidebar text-text-primary shadow-sm',
          railed ? SIDEBAR_LAYOUT.RAIL_WIDTH_CLASS : SIDEBAR_LAYOUT.WIDTH_CLASS,
        )}
      >
        {railed ? (
          <SidebarRail
            activeView={controller.activeView}
            isFullscreen={controller.isFullscreen}
            onExpand={controller.handleToggleSidebar}
            onNewSession={controller.handleNewSession}
            onOpenMcp={controller.handleOpenMcp}
            onOpenProject={() => {
              void controller.handleOpenProject()
            }}
            onOpenSettings={controller.handleOpenSettings}
            onOpenSkills={controller.handleOpenSkills}
          />
        ) : (
          <>
            <div className="flex flex-1 flex-col overflow-hidden">
              <SidebarBrandArea
                isFullscreen={controller.isFullscreen}
                onCollapse={controller.handleToggleSidebar}
              />
              <SidebarPrimaryActions
                activeView={controller.activeView}
                onNewSession={controller.handleNewSession}
                onOpenMcp={controller.handleOpenMcp}
                onOpenSkills={controller.handleOpenSkills}
              />
              <SidebarProjectsHeader
                sortMenuOpen={controller.sortMenuOpen}
                sortMode={controller.sortMode}
                onOpenProject={() => {
                  void controller.handleOpenProject()
                }}
                onSetSortMenuOpen={controller.setSortMenuOpen}
                onSetSortMode={controller.setSortMode}
              />
              <div className="no-drag sidebar-scroll flex-1 overflow-y-auto pb-4">
                <SidebarProjectList
                  sessionGroups={controller.sessionGroups}
                  renderState={renderState}
                  displayProjectName={controller.displayProjectName}
                  projectActions={projectActions}
                  sessionActions={sessionActions}
                  branchActions={branchActions}
                />
              </div>
            </div>
            <SidebarSettingsButton onOpenSettings={controller.handleOpenSettings} />
          </>
        )}
      </nav>
    </div>
  )
}
