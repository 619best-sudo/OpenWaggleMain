import type { SkillDiscoveryItem } from '@shared/types/standards'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { usePreferencesStore } from '@/features/settings/state'
import { BUILT_IN_TEAMMATES } from '@/features/teammates/lib/team-new-built-ins'
import { useWaggleStore } from '@/features/waggle/state'
import { wagglePresetsQueryOptions } from '@/queries/waggle-presets'
import { useUIStore } from '@/shell/ui-store'
import {
  createOptionalCommandPaletteAction,
  insertCompactCommand,
} from '../lib/command-palette-actions'
import {
  createBaseCommands,
  createConfigureTeamItem,
  createConfigureWaggleItem,
  createPresetItems,
  createSkillItems,
  createTeamItems,
  filterBaseCommands,
} from '../lib/command-palette-items'
import { normalizeCommandQuery } from '../lib/command-palette-text'
import type { CommandPaletteActionHandlers, CommandPaletteCallbacks } from '../model'

interface UseCommandPaletteItemsInput extends CommandPaletteCallbacks {
  readonly query: string
  readonly slashSkills: readonly SkillDiscoveryItem[]
}

export function useCommandPaletteItems({
  query,
  slashSkills,
  onSelectSkill,
  onStartWaggle,
  onStartTeam,
  onOpenSessionTree,
  onForkToNewSession,
  onCloneToNewSession,
}: UseCommandPaletteItemsInput) {
  const navigate = useNavigate()
  const closeCommandPalette = useUIStore((s) => s.closeCommandPalette)
  const projectPath = usePreferencesStore((state) => state.settings.projectPath)
  const wagglePresetsQuery = useQuery(wagglePresetsQueryOptions(projectPath))
  const lowerQuery = normalizeCommandQuery(query)
  const configureWaggle = () => {
    closeCommandPalette()
    void navigate({ to: '/waggle' })
  }
  const configureTeam = () => {
    closeCommandPalette()
    void navigate({ to: '/teammates' })
  }
  const actions: CommandPaletteActionHandlers = {
    closeCommandPalette,
    configureWaggle,
    configureTeam,
    selectPreset: (preset) => {
      onStartWaggle(preset.config)
      closeCommandPalette()
    },
    selectTeam: (teammate) => {
      onStartTeam(teammate)
      closeCommandPalette()
    },
    startWaggle: () => {
      const config = useWaggleStore.getState().activeConfig
      if (!config) {
        configureWaggle()
        return
      }
      onStartWaggle(config)
      closeCommandPalette()
    },
    selectSkill: (skillId, skillName) => {
      onSelectSkill(skillId, skillName)
      closeCommandPalette()
    },
    openSessionTree: createOptionalCommandPaletteAction(closeCommandPalette, onOpenSessionTree),
    forkToNewSession: createOptionalCommandPaletteAction(closeCommandPalette, onForkToNewSession),
    cloneToNewSession: createOptionalCommandPaletteAction(closeCommandPalette, onCloneToNewSession),
    insertCompactCommand: () => {
      insertCompactCommand()
      closeCommandPalette()
    },
  }

  return [
    ...filterBaseCommands(createBaseCommands(actions), lowerQuery),
    ...createSkillItems(slashSkills, lowerQuery, actions.selectSkill),
    ...createPresetItems(wagglePresetsQuery.data ?? [], lowerQuery, actions.selectPreset),
    ...createTeamItems(BUILT_IN_TEAMMATES, lowerQuery, actions.selectTeam),
    ...createConfigureWaggleItem(lowerQuery, actions.configureWaggle),
    ...createConfigureTeamItem(lowerQuery, actions.configureTeam),
  ]
}
