import {
  ArrowDownAZ,
  Calendar,
  Check,
  Clock,
  Edit3,
  FolderPlus,
  LayoutList,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { Popover } from '@/shared/ui/Popover'
import appLogo from '../../../../../assets/new-logo.png'
import { SIDEBAR_LAYOUT } from '../constants/sidebar-layout'
import type { SidebarSessionSortMode } from '../lib/sidebar-project-groups'
import type { SidebarView } from '../model/sidebar-types'

const SORT_OPTIONS: { value: SidebarSessionSortMode; label: string; icon: typeof Clock }[] = [
  { value: 'recent', label: 'Recent', icon: Clock },
  { value: 'oldest', label: 'Oldest', icon: Calendar },
  { value: 'name', label: 'Name (A->Z)', icon: ArrowDownAZ },
]

export function SidebarBrandArea({
  isFullscreen,
  onCollapse,
}: {
  readonly isFullscreen: boolean
  readonly onCollapse: () => void
}) {
  return (
    <>
      <div
        className="drag-region shrink-0 transition-[height] duration-200 ease-out"
        style={{ height: isFullscreen ? 0 : SIDEBAR_LAYOUT.DRAG_REGION_HEIGHT }}
      />
      <div className="drag-region shrink-0 px-6 pb-2 pt-5">
        <div className="flex items-center gap-3">
          <div className="home-panel-frame-soft overflow-hidden rounded-xl bg-transparent">
            <img src={appLogo} alt="Turing Machine logo" className="size-11 object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="no-drag truncate text-[13.5px] font-semibold tracking-[-0.015em] text-text-primary">
              Turing Machine
            </p>
          </div>
          {/*
           * Collapsing was reachable only through Mod+B; re-opening already had
           * a button in the header, so the control existed in one direction
           * only. This is its counterpart, parked on the brand row where the
           * header's re-open button will reappear once the panel is gone.
           */}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Hide sidebar"
            aria-expanded
            title="Hide sidebar (⌘B)"
            onClick={onCollapse}
            className="no-drag shrink-0 text-text-muted hover:text-text-primary"
          >
            <PanelLeftClose className="size-4" />
          </Button>
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
}: {
  readonly activeView: SidebarView
  readonly onNewSession: () => void
  readonly onOpenMcp: () => void
  readonly onOpenSkills: () => void
}) {
  return (
    <div className="mt-9 shrink-0 px-6">
      <Button
        variant="unstyled"
        aria-label="New thread"
        onClick={onNewSession}
        className="no-drag flex h-11 w-full items-center gap-3 rounded-md bg-accent px-4 text-left text-accent-foreground transition-colors hover:bg-accent-dim"
      >
        <Edit3 className="size-4.5 shrink-0" />
        <span className="text-[12px] font-semibold tracking-[-0.01em]">New thread</span>
      </Button>

      <div className="mt-7 space-y-1">
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

/**
 * One icon button in the collapsed rail.
 *
 * SQUARE, not a full-width row: a `w-full` button drew a wide rectangle of
 * hover/active fill around a 16px icon, which read as a stretched list row
 * rather than a button.
 */
function RailButton({
  active = false,
  accent = false,
  icon: Icon,
  iconClassName = 'size-4',
  label,
  onClick,
  size = 'size-8',
}: {
  readonly active?: boolean
  readonly accent?: boolean
  readonly icon: typeof Sparkles
  readonly iconClassName?: string
  readonly label: string
  readonly onClick: () => void
  readonly size?: string
}) {
  return (
    <Button
      variant="unstyled"
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'no-drag flex shrink-0 items-center justify-center rounded-md transition-colors',
        size,
        accent
          ? 'bg-accent text-accent-foreground hover:bg-accent-dim'
          : active
            ? 'bg-bg-active text-text-primary'
            : 'text-text-primary/82 hover:bg-bg-hover hover:text-text-primary',
      )}
    >
      <Icon
        className={cn(
          'shrink-0',
          iconClassName,
          accent ? '' : active ? 'text-accent' : 'text-text-secondary',
        )}
      />
    </Button>
  )
}

/**
 * The collapsed sidebar.
 *
 * Collapsing used to remove the panel entirely, which took every primary action
 * with it — a new thread, MCPs, Skills, opening a project all became
 * unreachable until the panel came back. The rail keeps each of them at a
 * single click, so collapsing trades away the thread LIST rather than the
 * navigation.
 *
 * The vertical rhythm is copied from the expanded panel — same drag region,
 * same `pt-5` brand block, same `mt-9` before the actions — and the disclosure
 * button stays in the header block where its collapse counterpart lives, rather
 * than moving to the footer where the user would have to hunt for it.
 */
export function SidebarRail({
  activeView,
  isFullscreen,
  onExpand,
  onNewSession,
  onOpenMcp,
  onOpenProject,
  onOpenSettings,
  onOpenSkills,
}: {
  readonly activeView: SidebarView
  readonly isFullscreen: boolean
  readonly onExpand: () => void
  readonly onNewSession: () => void
  readonly onOpenMcp: () => void
  readonly onOpenProject: () => void
  readonly onOpenSettings: () => void
  readonly onOpenSkills: () => void
}) {
  return (
    <>
      <div className="flex flex-1 flex-col overflow-hidden">
        <div
          className="drag-region shrink-0 transition-[height] duration-200 ease-out"
          style={{ height: isFullscreen ? 0 : SIDEBAR_LAYOUT.DRAG_REGION_HEIGHT }}
        />
        {/* The header block, same as expanded: brand, then the disclosure. The
            expand button belongs here — beside the logo is where its collapse
            twin lives, and moving it to the footer on collapse meant the one
            control the user is looking for jumped the height of the panel. */}
        <div className="drag-region flex shrink-0 flex-col items-center gap-1 px-3 pb-2 pt-5">
          <div className="home-panel-frame-soft overflow-hidden rounded-xl bg-transparent">
            <img src={appLogo} alt="Turing Machine logo" className="size-11 object-cover" />
          </div>
          <RailButton icon={PanelLeftOpen} label="Show sidebar" onClick={onExpand} />
        </div>
        <div
          className="shrink-0 transition-[height] duration-200 ease-out"
          style={{
            height: isFullscreen
              ? SIDEBAR_LAYOUT.FULLSCREEN_SPACER_HEIGHT
              : SIDEBAR_LAYOUT.WINDOWED_SPACER_HEIGHT,
          }}
        />
        <div className="mt-9 flex shrink-0 flex-col items-center gap-1 px-3">
          <RailButton
            accent
            icon={Edit3}
            iconClassName="size-4.5"
            label="New thread"
            size="size-11"
            onClick={onNewSession}
          />
          {/* 20px, not 28: the flex `gap-1` already contributes 4px either side
              of this spacer, so the gap to the shortcuts lands on the expanded
              panel's `mt-7` exactly. */}
          <div className="pt-5" />
          <RailButton
            active={activeView === 'mcp'}
            icon={Network}
            label="MCPs"
            onClick={onOpenMcp}
          />
          <RailButton
            active={activeView === 'skills'}
            icon={Sparkles}
            label="Skills"
            onClick={onOpenSkills}
          />
          <RailButton icon={FolderPlus} label="Open project folder" onClick={onOpenProject} />
        </div>
      </div>
      <div className="flex shrink-0 justify-center px-3 pb-6 pt-4">
        <RailButton
          active={activeView === 'settings'}
          icon={Settings}
          iconClassName="size-4.5"
          label="Settings"
          onClick={onOpenSettings}
        />
      </div>
    </>
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
    <div className="no-drag flex shrink-0 items-center justify-between px-6 pb-4 pt-6">
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
    // Same geometry as the project header row: the band sits in the 8px
    // gutter and `pl-4` lands the Settings icon at the 24px column the
    // THREADS label and Folder icons start in.
    <div className="no-drag shrink-0 px-2 pb-6 pt-4">
      <Button
        variant="unstyled"
        aria-label="Settings"
        onClick={onOpenSettings}
        className="flex h-10 w-full items-center gap-3 rounded-md pr-3 pl-4 text-left text-text-primary/82 transition-colors hover:bg-bg-hover hover:text-text-primary"
      >
        <Settings className="size-4.5 shrink-0 text-text-secondary" />
        <span className="text-[12.5px] font-medium">Settings</span>
      </Button>
    </div>
  )
}
