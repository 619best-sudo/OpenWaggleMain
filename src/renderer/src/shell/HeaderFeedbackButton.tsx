import { Bug } from 'lucide-react'
import { Button } from '@/shared/ui/Button'

export function FeedbackButton({ onOpen }: { readonly onOpen: () => void }) {
  return (
    <Button
      variant="unstyled"
      type="button"
      aria-label="Report a bug"
      onClick={onOpen}
      className="no-drag flex items-center gap-1 h-7 px-2 rounded-md border border-white/10 bg-transparent transition-colors hover:bg-white/5"
      title="Report a bug"
    >
      <Bug className="size-3.5 text-[#a1a1aa]" />
    </Button>
  )
}
