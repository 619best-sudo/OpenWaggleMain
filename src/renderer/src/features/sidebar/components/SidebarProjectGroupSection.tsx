import type { SessionSummary } from '@shared/types/session'
import { Edit3 } from 'lucide-react'
import { Button } from '@/shared/ui/Button'
import { buildSidebarBranchRows, resolveActiveBranchIdForSession } from '../lib/sidebar-branches'
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
      className="group mx-2 flex h-[34px] w-[calc(100%-16px)] items-center gap-2 rounded-md bg-bg-active pl-3 pr-2 text-left transition-colors hover:bg-bg-hover"
    >
      <Edit3 className="size-3.5 shrink-0 text-text-primary" />
      {/* The row is already visually selected and says "New session" — a framed
          pill reading DRAFT on top of that was a third emphasis on one row. */}
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-text-primary">
        New session
      </span>
      <span className="shrink-0 text-[10px] text-text-muted">Draft</span>
    </Button>
  )
}

function EmptyProjectSessionsRow({
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
      aria-label={`Start first session in ${projectLabel}`}
      onClick={onSelect}
      className="group mx-2 flex h-[34px] w-[calc(100%-16px)] items-center pl-7 pr-2 text-left transition-colors"
    >
      {/* One line, not two: an empty project should take a row, not a card. */}
      <span className="min-w-0 flex-1 truncate text-[12px] text-text-muted group-hover:text-text-tertiary">
        No sessions yet — start one
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
    return (
      <EmptyProjectSessionsRow
        projectLabel={projectLabel}
        onSelect={() => onNewSession(group.projectPath)}
      />
    )
  }

  // Cap the active project's thread list so a project with many threads can't
  // push the other project headers out of view. The list scrolls internally;
  // every project header stays reachable. Inactive projects are collapsed
  // (render no rows), so this only ever binds the one expanded group.
  const isActiveProject = group.projectPath === state.projectPath
  // Rows sit flush. A gap between every thread turned the list into stripes;
  // the hover/active background is what separates one row from the next.
  const listClassName = isActiveProject
    ? 'mt-0.5 max-h-[50vh] overflow-y-auto sidebar-scroll pr-1'
    : 'mt-0.5'

  return (
    <div className={listClassName}>
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
    activeBranchId: resolveActiveBranchIdForSession({
      sessionId: session.id,
      activeSessionId: state.activeSessionId,
      activeBranchId: state.activeBranchId,
    }),
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
    <section className="mb-1.5">
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
