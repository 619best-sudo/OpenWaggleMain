import type { McpServerSummary } from '@shared/types/mcp'
import type { SkillDiscoveryItem } from '@shared/types/standards'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { usePreferencesStore } from '@/features/settings/state'
import { api } from '@/shared/lib/ipc'
import { useUIStore } from '@/shell/ui-store'
import { createMcpItems, createSkillItems } from '../lib/command-palette-items'
import { normalizeCommandQuery } from '../lib/command-palette-text'
import type {
  CommandPaletteActionHandlers,
  CommandPaletteCallbacks,
} from '../model/command-palette-item'

interface UseCommandPaletteItemsInput extends CommandPaletteCallbacks {
  readonly query: string
  readonly slashSkills: readonly SkillDiscoveryItem[]
  readonly trigger?: '/' | '#' | null
}

/**
 * Assemble the mention palette items. The trigger character (`/` or `#`)
 * dictates section ordering: `/` puts MCPs first (their canonical home), `#`
 * puts skills first. The non-trigger section still appears, just second.
 *
 * Default (no trigger) follows `/` (MCPs first) — `null` arrives when the user
 * opens the palette via the global Mod+K hotkey rather than typing.
 */
export function useCommandPaletteItems({
  query,
  slashSkills,
  onSelectSkill,
  onSelectMcp,
  trigger,
}: UseCommandPaletteItemsInput) {
  const queryClient = useQueryClient()
  const closeCommandPalette = useUIStore((s) => s.closeCommandPalette)
  const showToast = useUIStore((s) => s.showToast)
  const projectPath = usePreferencesStore((state) => state.settings.projectPath)
  const mcpSettingsQuery = useQuery({
    queryKey: ['mcp-settings', projectPath],
    queryFn: () => api.getMcpSettings(projectPath),
  })
  const lowerQuery = normalizeCommandQuery(query)

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
    selectSkill: (skillId, skillName) => {
      onSelectSkill(skillId, skillName)
      closeCommandPalette()
    },
    selectMcp: (serverName) => {
      onSelectMcp(serverName)
      closeCommandPalette()
    },
  }

  const skills = createSkillItems(slashSkills, lowerQuery, actions.selectSkill)
  const mcps = createMcpItems(
    mcpSettingsQuery.data?.servers ?? [],
    lowerQuery,
    actions.selectMcp,
    toggleMcpServer,
  )

  // `/` is the MCP trigger → MCPs first. `#` is the skill trigger → skills
  // first. The other section still appears, just second — keeps the palette
  // discoverable when the user wants to look up the other kind while a
  // palette session is open.
  const mcpFirst = trigger !== '#'
  return mcpFirst ? [...mcps, ...skills] : [...skills, ...mcps]
}
