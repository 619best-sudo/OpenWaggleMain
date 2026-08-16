import { SupportedModelId } from './brand'

export type Provider = string
export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const
export type ThinkingLevel = (typeof THINKING_LEVELS)[number]

export const THEME_MODES = ['light', 'dark'] as const
export type ThemeMode = (typeof THEME_MODES)[number]

export const TOOL_PERMISSION_MODES = ['ask', 'ask-edit', 'allow-all'] as const
export type ToolPermissionMode = (typeof TOOL_PERMISSION_MODES)[number]

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && THEME_MODES.includes(value as ThemeMode)
}

export function isLightThemeMode(mode: ThemeMode): boolean {
  return mode === 'light'
}

export const DEFAULT_MODEL_REF = SupportedModelId('')
export const GREATX_BACKEND_MODEL_REF = SupportedModelId('turing-machine/turing-machine')

export interface Settings {
  readonly selectedModel: SupportedModelId
  readonly favoriteModels: readonly SupportedModelId[]
  /** User-curated canonical Pi model refs ("provider/modelId") shown in the composer picker. */
  readonly enabledModels: readonly SupportedModelId[]
  readonly projectPath: string | null
  readonly thinkingLevel: ThinkingLevel
  readonly themeMode: ThemeMode
  readonly recentProjects: readonly string[]
  readonly skillTogglesByProject: Readonly<Record<string, Readonly<Record<string, boolean>>>>
  readonly projectDisplayNames: Readonly<Record<string, string>>
  readonly showCustomExecutionTeam: boolean
  readonly toolPermissionMode: ToolPermissionMode
  /**
   * Whether the first-run default MCP servers (Playwright) have
   * already been written to the global MCP config. Set once, by the main
   * process, so a user who later removes or disables either one doesn't get it
   * silently re-added on the next launch. Deliberately absent from the settings
   * IPC schema — the renderer must not be able to flip it.
   */
  readonly defaultMcpServersSeeded: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  selectedModel: DEFAULT_MODEL_REF,
  favoriteModels: [],
  enabledModels: [],
  projectPath: null,
  thinkingLevel: 'medium',
  themeMode: 'dark',
  recentProjects: [],
  skillTogglesByProject: {},
  projectDisplayNames: {},
  showCustomExecutionTeam: true,
  toolPermissionMode: 'ask',
  defaultMcpServersSeeded: false,
}
