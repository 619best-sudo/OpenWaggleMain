import { GitBranch } from 'lucide-react'
import { Button } from '@/shared/ui/Button'

interface BranchPickerTriggerProps {
  readonly currentBranch: string | null
  readonly isOpen: boolean
  readonly onToggle: (open: boolean) => void
}

export function BranchPickerTrigger({ currentBranch, isOpen, onToggle }: BranchPickerTriggerProps) {
  const branchLabel = currentBranch ?? 'branch'

  return (
    <Button
      variant="unstyled"
      type="button"
      onClick={() => onToggle(!isOpen)}
      className="home-panel-frame-soft flex h-6 min-w-0 max-w-[220px] shrink items-center gap-1 rounded-[5px] px-2 text-[11px] text-text-secondary transition-colors hover:bg-bg-hover @max-[720px]:max-w-[140px] @max-[560px]:max-w-[96px]"
      title={currentBranch ? `Manage branches (${currentBranch})` : 'Manage branches'}
    >
      <GitBranch className="size-[13px] shrink-0 text-text-tertiary" />
      <span className="min-w-0 truncate whitespace-nowrap">{branchLabel}</span>
      <span className="shrink-0 text-[9px] text-text-tertiary">&#x2228;</span>
    </Button>
  )
}
