import type { McpServerSummary } from '@shared/types/mcp'
import type { SkillDiscoveryItem } from '@shared/types/standards'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { usePreferencesStore } from '@/features/settings/state'
import { useWaggleStore } from '@/features/waggle/state'
import { wagglePresetsQueryOptions } from '@/queries/waggle-presets'
import { api } from '@/shared/lib/ipc'
import { useUIStore } from '@/shell/ui-store'
import {
  createOptionalCommandPaletteAction,
  insertCompactCommand,
} from '../lib/command-palette-actions'
import {
  createBaseCommands,
  createConfigureMcpItem,
  createConfigureWaggleItem,
  createMcpItems,
  createPresetItems,
  createSkillItems,
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
  onOpenSessionTree,
  onForkToNewSession,
  onCloneToNewSession,
}: UseCommandPaletteItemsInput) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const closeCommandPalette = useUIStore((s) => s.closeCommandPalette)
  const showToast = useUIStore((s) => s.showToast)
  const projectPath = usePreferencesStore((state) => state.settings.projectPath)
  const wagglePresetsQuery = useQuery(wagglePresetsQueryOptions(projectPath))
  const mcpSettingsQuery = useQuery({
    queryKey: ['mcp-settings', projectPath],
    queryFn: () => api.getMcpSettings(projectPath),
  })
  const lowerQuery = normalizeCommandQuery(query)
  const configureMcp = () => {
    closeCommandPalette()
    void navigate({ to: '/mcp' })
  }
  const configureWaggle = () => {
    closeCommandPalette()
    void navigate({ to: '/waggle' })
  }
  const toggleMcpServer = (server: McpServerSummary) => {
    closeCommandPalette()
    void api
      .setMcpServerEnabled({
        projectPath,
        sourceId: server.sourceId,
        serverName: server.name,
        enabled: !server.enabled,
      })
      .then((nextView) => {
        void queryClient.setQueryData(['mcp-settings', projectPath], nextView)
        showToast(`MCP "${server.name}" ${server.enabled ? 'disabled' : 'enabled'}.`, 'success')
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        showToast(`Failed to update MCP "${server.name}": ${message}`, 'error')
      })
  }
  const actions: CommandPaletteActionHandlers = {
    closeCommandPalette,
    configureMcp,
    configureWaggle,
    toggleMcpServer,
    selectPreset: (preset) => {
      onStartWaggle(preset.config)
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
    ...createMcpItems(mcpSettingsQuery.data?.servers ?? [], lowerQuery, actions.toggleMcpServer),
    ...createPresetItems(wagglePresetsQuery.data ?? [], lowerQuery, actions.selectPreset),
    ...createConfigureMcpItem(lowerQuery, actions.configureMcp),
    ...createConfigureWaggleItem(lowerQuery, actions.configureWaggle),
  ]
}
