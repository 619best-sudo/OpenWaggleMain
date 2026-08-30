import type { ReactNode } from 'react'

export interface CommandPaletteCallbacks {
  readonly onSelectSkill: (skillId: string, skillName?: string) => void
  readonly onSelectMcp: (serverName: string) => void
}

export interface CommandPaletteItem {
  readonly id: string
  readonly label: string
  readonly description?: string
  readonly icon: ReactNode
  readonly section?: string
  readonly trailing?: string
  readonly trailingBadge?: string
  readonly action: () => void
}

export interface CommandPaletteActionHandlers {
  readonly closeCommandPalette: () => void
  readonly selectSkill: (skillId: string, skillName?: string) => void
  readonly selectMcp: (serverName: string) => void
}
