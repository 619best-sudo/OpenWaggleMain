import {
  ArrowDownAZ,
  Calendar,
  Check,
  Clock,
  Command,
  Edit3,
  FolderPlus,
  LayoutList,
  Network,
  Settings,
  Sparkles,
  Users,
} from 'lucide-react'
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
          <div className="flex size-9 items-center justify-center rounded-md bg-[#8ba57b] text-[#09110a]">
            <Command className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="no-drag truncate text-[14px] font-bold tracking-tight text-[#f1f4ee]">
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
        active ? 'bg-white/10 text-white' : 'text-[#a1a1aa] hover:bg-white/5 hover:text-white',
      )}
      title={`Open ${label}`}
    >
      <Icon className={cn('size-4 shrink-0', active ? 'text-[#dce5d6]' : 'text-[#a0a0a0]')} />
      <span
        className={cn(
          'text-[12px]',
          active ? 'font-medium' : 'font-medium',
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
  onOpenWaggle,
}: {
  readonly activeView: SidebarView
  readonly onNewSession: () => void
  readonly onOpenMcp: () => void
  readonly onOpenSkills: () => void
  readonly onOpenWaggle: () => void
}) {
  return (
    <div className="shrink-0 px-6 mt-12">
      <Button
        variant="unstyled"
        aria-label="New thread"
        onClick={onNewSession}
        className="no-drag flex h-11 w-full items-center gap-3 rounded-md bg-[#8ba57b] px-4 text-left text-[#09110a] transition-colors hover:bg-[#9cb88c]"
      >
        <Edit3 className="size-4.5 shrink-0" />
        <span className="text-[12px] font-bold tracking-[-0.01em]">New thread</span>
      </Button>

      <div className="mt-10 space-y-1">
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
      <span className="text-[10px] font-bold tracking-[0.25em] text-[#71717a]">THREADS</span>
      <div className="flex items-center gap-2">
        <Button
          variant="unstyled"
          aria-label="Open project folder"
          onClick={onOpenProject}
          className="flex size-7 items-center justify-center rounded-md text-[#71717a] transition-colors hover:bg-white/5 hover:text-white"
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
                'flex size-7 items-center justify-center rounded-md text-[#71717a] transition-colors hover:bg-white/5 hover:text-white',
                sortMenuOpen && 'bg-white/5 text-white',
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
        className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-[#a1a1aa] transition-colors hover:bg-white/5 hover:text-white"
      >
        <Settings className="size-4.5 shrink-0 text-[#a1a1aa]" />
        <span className="text-[12px] font-medium">Settings</span>
      </Button>
    </div>
  )
}
