import { SessionId } from '@shared/types/brand'
import type { SessionSummary } from '@shared/types/session'
import { MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { formatRelativeTime, truncate } from '@/shared/lib/format'
import { Button } from '@/shared/ui/Button'
import type { SidebarSessionActions } from '../model'
import { SessionItemContextMenu } from './SessionItemContextMenu'

const TITLE_TRUNCATE_LENGTH = 30

type SessionListItemVariant = 'project' | 'root'

interface SessionBranchDisclosureState {
  readonly visible: boolean
  readonly collapsed: boolean
  readonly onToggle?: (() => void) | undefined
}

interface SessionListItemProps {
  readonly session: SessionSummary
  readonly isActive: boolean
  readonly variant?: SessionListItemVariant
  readonly actions: SidebarSessionActions
  readonly branchDisclosure?: SessionBranchDisclosureState
}

function toSessionId(sessionId: SessionId) {
  return SessionId(String(sessionId))
}

function SessionTitleButton({
  isActive,
  session,
  sessionId,
  onSelect,
}: {
  readonly isActive: boolean
  readonly session: SessionSummary
  readonly sessionId: SessionId
  readonly onSelect: (id: SessionId) => void
}) {
  return (
    <Button
        variant="unstyled"
        type="button"
        onClick={() => onSelect(sessionId)}
        className="group min-w-0 flex-1 truncate text-left"
      >
      <span
        className={cn(
          'truncate text-[12.5px] transition-colors',
          isActive ? 'font-semibold text-text-primary' : 'font-medium text-text-tertiary group-hover:text-text-secondary',
        )}
      >
        {truncate(session.title, TITLE_TRUNCATE_LENGTH)}
      </span>
    </Button>
  )
}

function SessionActionsTrigger({
  menuOpen,
  session,
  isActive,
  onClick,
}: {
  readonly menuOpen: boolean
  readonly session: SessionSummary
  readonly isActive: boolean
  readonly onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <div className="relative ml-2 flex items-center justify-end">
      <span
        className={cn(
          'text-[10.5px] font-medium whitespace-nowrap',
          isActive ? 'text-text-secondary' : 'text-text-tertiary',
        )}
      >
        {formatRelativeTime(session.updatedAt)}
      </span>
      <Button
        variant="unstyled"
        type="button"
        aria-label={`Open session actions for ${session.title}`}
        onClick={onClick}
        className={cn(
          'absolute -right-1 z-10 flex size-6 items-center justify-center rounded-lg text-text-secondary opacity-0 transition-[background-color,color,opacity] hover:bg-bg-hover hover:text-text-primary group-hover:opacity-100 focus:opacity-100',
          menuOpen ? 'opacity-100' : null,
        )}
      >
        <MoreHorizontal className="size-3.5" />
      </Button>
    </div>
  )
}

export function SessionListItem({ session, isActive, actions }: SessionListItemProps) {
  const sessionId = toSessionId(session.id)

  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    setMenuPos({ x: e.clientX, y: e.clientY })
    setMenuOpen(true)
  }

  function handleActionsClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    setMenuPos({ x: rect.left, y: rect.bottom })
    setMenuOpen(true)
  }

  return (
    <li
      aria-current={isActive ? 'true' : undefined}
      className={cn(
        'group mx-4 flex h-9 items-center rounded-md transition-colors pl-8 pr-3',
        isActive ? 'bg-accent/10' : 'hover:bg-bg-hover',
      )}
      onContextMenu={handleContextMenu}
    >
      <SessionTitleButton
        isActive={isActive}
        session={session}
        sessionId={sessionId}
        onSelect={actions.select}
      />
      <SessionActionsTrigger
        menuOpen={menuOpen}
        session={session}
        isActive={isActive}
        onClick={handleActionsClick}
      />

      <SessionItemContextMenu
        open={menuOpen}
        position={menuPos}
        sessionId={sessionId}
        onClose={() => setMenuOpen(false)}
        onMarkUnread={actions.markUnread}
        onClone={actions.clone}
        onArchive={actions.archive}
        onDelete={actions.delete}
      />
    </li>
  )
}
