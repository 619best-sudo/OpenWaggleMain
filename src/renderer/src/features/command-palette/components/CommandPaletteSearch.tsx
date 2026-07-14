import { Search, X } from 'lucide-react'
import type { KeyboardEventHandler, RefObject } from 'react'
import { Button } from '@/shared/ui/Button'
import { TextInput } from '@/shared/ui/TextInput'

interface CommandPaletteSearchProps {
  readonly inputRef: RefObject<HTMLInputElement | null>
  readonly query: string
  readonly onKeyDown: KeyboardEventHandler<HTMLInputElement>
  readonly onQueryChange: (query: string) => void
  readonly onClose: () => void
}

export function CommandPaletteSearch({
  inputRef,
  query,
  onKeyDown,
  onQueryChange,
  onClose,
}: CommandPaletteSearchProps) {
  return (
    <div className="border-b border-border/60 bg-code-card px-3 py-1.5">
      <div className="flex items-center gap-2.5 border-b border-border/45 pb-1.5">
        <Search className="size-3.5 shrink-0 text-text-tertiary" />
        <TextInput
          ref={inputRef}
          type="text"
          value={query}
          onKeyDown={onKeyDown}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search"
          variant="transparent"
          inputSize="sm"
          className="h-8 flex-1 px-0 text-[12px] placeholder:text-text-muted focus-visible:shadow-none"
        />
        <Button
          variant="unstyled"
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-sm p-1 text-text-muted transition-colors hover:bg-bg-hover/60 hover:text-text-primary"
          aria-label="Close command palette"
          title="Close"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
