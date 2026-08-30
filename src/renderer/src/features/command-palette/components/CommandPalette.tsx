import type { SkillDiscoveryItem } from '@shared/types/standards'
import { useEffect, useRef, useState } from 'react'
import { useEscapeHotkey } from '@/shared/hooks/useEscapeHotkey'
import { useUIStore } from '@/shell/ui-store'
import { useCommandPaletteItems } from '../hooks/useCommandPaletteItems'
import { useCommandPaletteKeyboard } from '../hooks/useCommandPaletteKeyboard'
import { CommandPaletteList } from './CommandPaletteList'
import { CommandPaletteSearch } from './CommandPaletteSearch'

interface CommandPaletteProps {
  readonly slashSkills: readonly SkillDiscoveryItem[]
  readonly onSelectSkill: (skillId: string, skillName?: string) => void
  readonly onSelectMcp: (serverName: string) => void
}

export function CommandPalette({ slashSkills, onSelectSkill, onSelectMcp }: CommandPaletteProps) {
  const closeCommandPalette = useUIStore((s) => s.closeCommandPalette)
  const trigger = useUIStore((s) => s.commandPaletteTrigger)
  const [query, setQuery] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const items = useCommandPaletteItems({
    query,
    slashSkills,
    onSelectSkill,
    onSelectMcp,
    trigger,
  })
  const handleKeyDown = useCommandPaletteKeyboard({
    items,
    highlightIndex,
    setHighlightIndex,
    listRef,
  })

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEscapeHotkey(closeCommandPalette)

  function handleQueryChange(nextQuery: string) {
    setQuery(nextQuery)
    setHighlightIndex(0)
  }

  return (
    <div className="w-full overflow-hidden rounded-xl border border-border/70 bg-code-card">
      <CommandPaletteSearch
        inputRef={inputRef}
        query={query}
        onKeyDown={handleKeyDown}
        onQueryChange={handleQueryChange}
        onClose={closeCommandPalette}
      />
      <CommandPaletteList
        items={items}
        highlightIndex={highlightIndex}
        onHighlightIndexChange={setHighlightIndex}
        listRef={listRef}
      />
    </div>
  )
}
