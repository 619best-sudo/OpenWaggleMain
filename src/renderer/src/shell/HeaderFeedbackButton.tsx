import { Bug } from 'lucide-react'
import { Button } from '@/shared/ui/Button'

export function FeedbackButton({ onOpen }: { readonly onOpen: () => void }) {
  return (
    <Button
      variant="unstyled"
      type="button"
      aria-label="Report a bug"
      onClick={onOpen}
      className="no-drag flex h-7 items-center gap-1 rounded-md border border-[var(--theme-border-overlay-strong)] bg-transparent px-2 transition-colors hover:bg-[var(--theme-header-hover-surface)]"
      title="Report a bug"
    >
      <Bug className="size-3.5 text-[var(--theme-bug-icon)]" />
    </Button>
  )
}
