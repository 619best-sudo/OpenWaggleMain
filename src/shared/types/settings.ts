import { SupportedModelId } from './brand'

export type Provider = string
export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const
export type ThinkingLevel = (typeof THINKING_LEVELS)[number]

export const THEME_MODES = ['light', 'dark', 'cocoa', 'metallic-gold', 'cream', 'velvet-obsidian', 'platinum', 'bulgarian-rose'] as const
export type ThemeMode = (typeof THEME_MODES)[number]

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && THEME_MODES.includes(value as ThemeMode)
}

export function isLightThemeMode(mode: ThemeMode): boolean {
  return mode === 'light' || mode === 'cream' || mode === 'platinum'
}

export const DEFAULT_MODEL_REF = SupportedModelId('')

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
}
