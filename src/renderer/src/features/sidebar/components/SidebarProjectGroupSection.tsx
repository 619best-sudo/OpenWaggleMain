import type { SessionSummary } from '@shared/types/session'
import { Edit3 } from 'lucide-react'
import { Button } from '@/shared/ui/Button'
import { buildSidebarBranchRows } from '../lib/sidebar-branches'
import type { SidebarProjectGroup } from '../lib/sidebar-project-groups'
import type {
  SidebarBranchActions,
  SidebarProjectActions,
  SidebarProjectRenderState,
  SidebarSessionActions,
} from '../model'
import { SessionListItem } from './SessionListItem'
import { SidebarBranchRows } from './SidebarBranchRows'
import { SidebarProjectHeader } from './SidebarProjectHeader'

interface ProjectGroupSectionProps {
  readonly group: SidebarProjectGroup
  readonly renderState: SidebarProjectRenderState
  readonly displayProjectName: (path: string) => string
  readonly projectActions: SidebarProjectActions
  readonly sessionActions: SidebarSessionActions
  readonly branchActions: SidebarBranchActions
}

function DraftSessionRow({
  projectLabel,
  onSelect,
}: {
  readonly projectLabel: string
  readonly onSelect: () => void
}) {
  return (
    <Button
      variant="unstyled"
      type="button"
      aria-current="true"
      aria-label={`Draft session in ${projectLabel}`}
      onClick={onSelect}
      className="group mx-3 flex h-10 w-[calc(100%-24px)] items-center gap-2 rounded-xl border border-accent/20 bg-accent/5 pl-4 pr-3 text-left transition-colors hover:bg-accent/10"
    >
      <Edit3 className="size-3.5 shrink-0 text-accent" />
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text-primary">
        New session
      </span>
      <span className="shrink-0 rounded-full border border-border bg-bg-secondary px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-text-tertiary">
        Draft
      </span>
    </Button>
  )
}

function sessionBranchDisclosure(session: SessionSummary, state: SidebarProjectRenderState) {
  const sourceBranches =
    state.activeSessionTree?.session.id === session.id
      ? state.activeSessionTree.branches
      : (session.branches ?? [])
  const visibleBranchCount = sourceBranches.filter((branch) => branch.archived !== true).length
  const hasDraftBranch = state.draftBranch?.sessionId === session.id
  const branchesCollapsed = session.treeUiState?.branchesSidebarCollapsed === true

  return {
    hasDisclosure: visibleBranchCount > 1 && !hasDraftBranch,
    rowsCollapsed: branchesCollapsed && !hasDraftBranch,
  }
}

function ProjectSessionRows({
  group,
  projectLabel,
  state,
  sessionActions,
  branchActions,
  onNewSession,
}: {
  readonly group: SidebarProjectGroup
  readonly projectLabel: string
  readonly state: SidebarProjectRenderState
  readonly sessionActions: SidebarSessionActions
  readonly branchActions: SidebarBranchActions
  readonly onNewSession: (path: string) => void
}) {
  const showDraftSession = state.draftSessionProjectPath === group.projectPath

  if (group.sessions.length === 0 && !showDraftSession) {
    return <div className="px-6 py-1.5 text-[12.5px] font-medium text-text-tertiary">No sessions</div>
  }

  return (
    <div className="mt-1.5 space-y-1">
      {showDraftSession ? (
        <DraftSessionRow
          projectLabel={projectLabel}
          onSelect={() => onNewSession(group.projectPath)}
        />
      ) : null}
      {group.sessions.map((session) => (
        <ProjectSessionRow
          key={String(session.id)}
          session={session}
          state={state}
          sessionActions={sessionActions}
          branchActions={branchActions}
        />
      ))}
    </div>
  )
}

function ProjectSessionRow({
  session,
  state,
  sessionActions,
  branchActions,
}: {
  readonly session: SessionSummary
  readonly state: SidebarProjectRenderState
  readonly sessionActions: SidebarSessionActions
  readonly branchActions: SidebarBranchActions
}) {
  const disclosure = sessionBranchDisclosure(session, state)
  const branchRows = buildSidebarBranchRows({
    session,
    activeSessionTree: state.activeSessionTree,
    activeBranchId:
      session.id === state.activeSessionId ? state.activeBranchId : session.lastActiveBranchId,
    branchesCollapsed: disclosure.rowsCollapsed,
    draftBranch: state.draftBranch,
  })

  return (
    <div>
      <SessionListItem
        session={session}
        isActive={session.id === state.activeSessionId}
        variant="project"
        actions={sessionActions}
        branchDisclosure={{
          visible: disclosure.hasDisclosure,
          collapsed: disclosure.rowsCollapsed,
          onToggle: () => branchActions.toggle(session.id, !disclosure.rowsCollapsed),
        }}
      />
      <SidebarBranchRows sessionId={String(session.id)} rows={branchRows} actions={branchActions} />
    </div>
  )
}

export function SidebarProjectGroupSection({
  group,
  renderState,
  displayProjectName,
  projectActions,
  sessionActions,
  branchActions,
}: ProjectGroupSectionProps) {
  const projectLabel = displayProjectName(group.projectPath)
  const collapsed = renderState.collapsedProjectPaths.has(group.projectPath)

  return (
    <section className="mb-3">
      <SidebarProjectHeader
        group={group}
        projectLabel={projectLabel}
        isCurrentProject={group.projectPath === renderState.projectPath}
        collapsed={collapsed}
        actions={projectActions}
      />
      {collapsed ? null : (
        <ProjectSessionRows
          group={group}
          projectLabel={projectLabel}
          state={renderState}
          sessionActions={sessionActions}
          branchActions={branchActions}
          onNewSession={projectActions.newSession}
        />
      )}
    </section>
  )
}
