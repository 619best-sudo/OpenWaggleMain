import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Button } from '@/shared/ui/Button'

interface DiffBottomBarProps {
  onRevertAll: () => void
  onStageAll: () => void
  hasChanges: boolean
  isTreeExpanded: boolean
  onToggleTree: () => void
}

export function DiffBottomBar({
  onRevertAll,
  onStageAll,
  hasChanges,
  isTreeExpanded,
  onToggleTree,
}: DiffBottomBarProps) {
  const PanelIcon = isTreeExpanded ? PanelLeftClose : PanelLeftOpen

  return (
    <div className="flex items-center justify-between h-10 px-4 bg-diff-header-bg border-t border-border shrink-0">
      <Button
        variant="unstyled"
        type="button"
        onClick={onToggleTree}
        className="flex items-center justify-center size-[26px] rounded-[5px] text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
        title={isTreeExpanded ? 'Collapse side panel' : 'Expand side panel'}
      >
        <PanelIcon className="size-4" />
      </Button>

      <div className="flex items-center gap-2">
        <Button
          variant="unstyled"
          type="button"
          onClick={onRevertAll}
          disabled={!hasChanges}
          className="flex items-center gap-1 h-[26px] px-3 rounded-[5px] border border-button-border text-[12px] text-text-secondary disabled:opacity-40 transition-opacity hover:bg-bg-hover"
        >
          Revert all
        </Button>
        <Button
          variant="unstyled"
          type="button"
          onClick={onStageAll}
          disabled={!hasChanges}
          className="flex items-center gap-1 h-[26px] px-3 rounded-[5px] bg-diff-stage-bg/10 border border-diff-stage-bg text-[12px] disabled:opacity-40 transition-colors hover:bg-diff-stage-bg hover:text-white group"
        >
          <span className="text-[14px] font-semibold text-diff-stage-bg group-hover:text-white">+</span>
          <span className="font-medium text-diff-stage-bg group-hover:text-white">Stage all</span>
        </Button>
      </div>
    </div>
  )
}
