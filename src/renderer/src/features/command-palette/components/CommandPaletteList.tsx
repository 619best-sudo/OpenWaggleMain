import type { RefObject } from 'react'
import { buildCommandPaletteEntries } from '../lib/command-palette-entries'
import type { CommandPaletteItem } from '../model'
import { CommandPaletteItemButton } from './CommandPaletteItemButton'

interface CommandPaletteListProps {
  readonly items: readonly CommandPaletteItem[]
  readonly highlightIndex: number
  readonly onHighlightIndexChange: (index: number) => void
  readonly listRef: RefObject<HTMLDivElement | null>
}

export function CommandPaletteList({
  items,
  highlightIndex,
  onHighlightIndexChange,
  listRef,
}: CommandPaletteListProps) {
  const entries = buildCommandPaletteEntries(items)

  return (
    <div ref={listRef} className="max-h-[400px] overflow-y-auto px-1 pb-1.5 pt-1">
      {items.length === 0 ? <CommandPaletteEmptyState /> : null}
      {entries.map((entry) => {
        if (entry.type === 'section')
          return <CommandPaletteSectionHeader key={entry.key} label={entry.label} />
        if (entry.type === 'separator')
          return <div key={entry.key} className="mx-2 my-1 border-t border-border/40" />
        return (
          <CommandPaletteItemButton
            key={entry.key}
            item={entry.item}
            highlighted={entry.index === highlightIndex}
            index={entry.index}
            onHighlightIndexChange={onHighlightIndexChange}
          />
        )
      })}
    </div>
  )
}

function CommandPaletteEmptyState() {
  return (
    <div className="mx-1.5 my-2 flex h-14 items-center justify-center border border-dashed border-border/45 bg-bg-secondary/40 text-[11px] text-text-muted">
      No matching commands
    </div>
  )
}

interface CommandPaletteSectionHeaderProps {
  readonly label: string
}

function CommandPaletteSectionHeader({ label }: CommandPaletteSectionHeaderProps) {
  return (
    <div className="px-2 pb-0.5 pt-1.5">
      <span className="inline-flex items-center text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
        {label}
      </span>
    </div>
  )
}
