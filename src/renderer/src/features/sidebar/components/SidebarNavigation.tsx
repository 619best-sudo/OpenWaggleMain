import {
  ArrowDownAZ,
  Calendar,
  Check,
  Clock,
  Edit3,
  FolderPlus,
  LayoutList,
  Network,
  Settings,
  Sparkles,
  Users,
} from 'lucide-react'
import appLogo from '../../../../../assets/logo.png'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { Popover } from '@/shared/ui/Popover'
import { SIDEBAR_LAYOUT } from '../constants/sidebar-layout'
import type { SidebarSessionSortMode } from '../lib/sidebar-project-groups'
import type { SidebarView } from '../model/sidebar-types'

const SORT_OPTIONS: { value: SidebarSessionSortMode; label: string; icon: typeof Clock }[] = [
  { value: 'recent', label: 'Recent', icon: Clock },
  { value: 'oldest', label: 'Oldest', icon: Calendar },
  { value: 'name', label: 'Name (A->Z)', icon: ArrowDownAZ },
]

export function SidebarBrandArea({ isFullscreen }: { readonly isFullscreen: boolean }) {
  return (
    <>
      <div
        className="drag-region shrink-0 transition-[height] duration-200 ease-out"
        style={{ height: isFullscreen ? 0 : SIDEBAR_LAYOUT.DRAG_REGION_HEIGHT }}
      />
      <div className="drag-region shrink-0 px-6 pt-6">
        <div className="flex items-center gap-3">
          <div className="home-panel-frame-soft overflow-hidden rounded-2xl bg-white shadow-sm">
            <img
              src={appLogo}
              alt="TuringMachine logo"
              className="size-11 object-cover"
            />
          </div>
          <div className="min-w-0">
            <p className="no-drag truncate text-[15px] font-semibold tracking-[-0.015em] text-text-primary">
              TuringMachine
            </p>
          </div>
        </div>
      </div>
      <div
        className="shrink-0 transition-[height] duration-200 ease-out"
        style={{
          height: isFullscreen
            ? SIDEBAR_LAYOUT.FULLSCREEN_SPACER_HEIGHT
            : SIDEBAR_LAYOUT.WINDOWED_SPACER_HEIGHT,
        }}
      />
    </>
  )
}

function SidebarShortcut({
  active = false,
  icon: Icon,
  label,
  onClick,
  italic = false,
}: {
  readonly active?: boolean
  readonly icon: typeof Sparkles
  readonly label: string
  readonly onClick?: () => void
  readonly italic?: boolean
}) {
  return (
    <Button
      variant="unstyled"
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        'flex h-8 w-full items-center gap-3 rounded-md px-2.5 text-left transition-colors',
        active
          ? 'bg-bg-active text-text-primary'
          : 'text-text-primary/82 hover:bg-bg-hover hover:text-text-primary',
      )}
      title={`Open ${label}`}
    >
      <Icon className={cn('size-4 shrink-0', active ? 'text-accent' : 'text-text-secondary')} />
      <span
        className={cn(
          'text-[12.5px]',
          active ? 'font-semibold' : 'font-medium',
          italic ? 'italic' : '',
        )}
      >
        {label}
      </span>
    </Button>
  )
}

export function SidebarPrimaryActions({
  activeView,
  onNewSession,
  onOpenMcp,
  onOpenSkills,
  onOpenTeammates,
  onOpenWaggle,
}: {
  readonly activeView: SidebarView
  readonly onNewSession: () => void
  readonly onOpenMcp: () => void
  readonly onOpenSkills: () => void
  readonly onOpenTeammates: () => void
  readonly onOpenWaggle: () => void
}) {
  return (
    <div className="shrink-0 px-6 mt-12">
      <Button
        variant="unstyled"
        aria-label="New thread"
        onClick={onNewSession}
        className="no-drag flex h-11 w-full items-center gap-3 rounded-md bg-accent px-4 text-left text-accent-foreground transition-colors hover:bg-accent-dim"
      >
        <Edit3 className="size-4.5 shrink-0" />
        <span className="text-[13px] font-semibold tracking-[-0.01em]">New thread</span>
      </Button>

      <div className="mt-10 space-y-1">
        <SidebarShortcut
          active={activeView === 'teammates'}
          icon={Users}
          label="Team(New)"
          onClick={onOpenTeammates}
        />
        <SidebarShortcut
          active={activeView === 'waggle'}
          icon={Users}
          label="Team"
          onClick={onOpenWaggle}
        />
        <SidebarShortcut
          active={activeView === 'mcp'}
          icon={Network}
          label="MCPs"
          onClick={onOpenMcp}
        />
        <SidebarShortcut
          active={activeView === 'skills'}
          icon={Sparkles}
          label="Skills"
          onClick={onOpenSkills}
        />
      </div>
    </div>
  )
}

export function SidebarProjectsHeader({
  sortMenuOpen,
  sortMode,
  onOpenProject,
  onSetSortMenuOpen,
  onSetSortMode,
}: {
  readonly sortMenuOpen: boolean
  readonly sortMode: SidebarSessionSortMode
  readonly onOpenProject: () => void
  readonly onSetSortMenuOpen: (open: boolean) => void
  readonly onSetSortMode: (mode: SidebarSessionSortMode) => void
}) {
  return (
    <div className="no-drag flex shrink-0 items-center justify-between px-6 pb-4 pt-10">
      <span className="text-[10.5px] font-semibold tracking-[0.22em] text-text-tertiary">
        THREADS
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="unstyled"
          aria-label="Open project folder"
          onClick={onOpenProject}
          className="flex size-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          title="Open project folder"
        >
          <FolderPlus className="size-4" />
        </Button>
        <Popover
          open={sortMenuOpen}
          onOpenChange={onSetSortMenuOpen}
          placement="bottom-end"
          className="min-w-[150px] py-1"
          trigger={
            <Button
              variant="unstyled"
              aria-label="Sort sessions"
              onClick={() => onSetSortMenuOpen(!sortMenuOpen)}
              className={cn(
                'flex size-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary',
                sortMenuOpen && 'bg-bg-hover text-text-primary',
              )}
              title="Sort sessions"
            >
              <LayoutList className="size-4" />
            </Button>
          }
        >
          {SORT_OPTIONS.map((option) => (
            <Button
              variant="row"
              size="xs"
              radius="none"
              key={option.value}
              onClick={() => {
                onSetSortMode(option.value)
                onSetSortMenuOpen(false)
              }}
              className={cn('gap-2', sortMode === option.value && 'text-accent')}
            >
              <option.icon className="size-3 shrink-0" />
              <span className="flex-1">{option.label}</span>
              {sortMode === option.value ? <Check className="size-3 shrink-0" /> : null}
            </Button>
          ))}
        </Popover>
      </div>
    </div>
  )
}

export function SidebarSettingsButton({ onOpenSettings }: { readonly onOpenSettings: () => void }) {
  return (
    <div className="no-drag shrink-0 px-6 pb-6 pt-4">
      <Button
        variant="unstyled"
        aria-label="Settings"
        onClick={onOpenSettings}
        className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-text-primary/82 transition-colors hover:bg-bg-hover hover:text-text-primary"
      >
        <Settings className="size-4.5 shrink-0 text-text-secondary" />
        <span className="text-[12.5px] font-medium">Settings</span>
      </Button>
    </div>
  )
}
