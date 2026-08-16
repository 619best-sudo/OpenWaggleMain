/**
 * Turing-backed {@link SessionTreePreferencesService}.
 *
 * Replaces Pi's `SettingsManager`-backed preferences. Reads/writes the two tree
 * preference keys (`treeFilterMode`, `branchSummarySkipPrompt`) from the same
 * project-local file the Pi manager used (`<project>/.turing-machine/settings.json`),
 * so existing user preferences survive the migration.
 *
 * Only these two keys are touched; the rest of the settings file (if any) is
 * preserved verbatim. Reads never throw — a missing file yields the defaults.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { PROJECT_CONFIG_DIR } from '@shared/constants/project-config'
import type { SessionTreeFilterMode } from '@shared/types/session'
import { Effect, Layer } from 'effect'
import { SessionTreePreferencesService } from '../../ports/session-tree-preferences-service'

const SETTINGS_FILE_NAME = 'settings.json'
const TREE_FILTER_MODE_KEY = 'treeFilterMode'
const BRANCH_SUMMARY_SKIP_PROMPT_KEY = 'branchSummarySkipPrompt'
const DEFAULT_PROJECT_PATH = process.cwd()

const DEFAULT_TREE_FILTER_MODE: SessionTreeFilterMode = 'default'

function resolveSettingsPath(projectPath?: string | null): string {
  return join(
    projectPath?.trim() || DEFAULT_PROJECT_PATH,
    PROJECT_CONFIG_DIR,
    SETTINGS_FILE_NAME,
  )
}

function readSettingsObject(filePath: string): Record<string, unknown> {
  try {
    if (!existsSync(filePath)) {
      return {}
    }
    const raw = readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // Missing or corrupt file — treat as empty.
  }
  return {}
}

function writeSettingsObject(filePath: string, value: Record<string, unknown>): void {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8')
}

function readTreeFilterMode(projectPath?: string | null): SessionTreeFilterMode {
  const raw = readSettingsObject(resolveSettingsPath(projectPath))[TREE_FILTER_MODE_KEY]
  if (
    raw === 'default' ||
    raw === 'no-tools' ||
    raw === 'user-only' ||
    raw === 'labeled-only' ||
    raw === 'all'
  ) {
    return raw
  }
  return DEFAULT_TREE_FILTER_MODE
}

function readBranchSummarySkipPrompt(projectPath?: string | null): boolean {
  const raw = readSettingsObject(resolveSettingsPath(projectPath))[BRANCH_SUMMARY_SKIP_PROMPT_KEY]
  return raw === true
}

function writeTreeFilterModeValue(mode: SessionTreeFilterMode, projectPath?: string | null): void {
  const filePath = resolveSettingsPath(projectPath)
  const settings = readSettingsObject(filePath)
  settings[TREE_FILTER_MODE_KEY] = mode
  writeSettingsObject(filePath, settings)
}

export const TuringSessionTreePreferencesLive = Layer.succeed(SessionTreePreferencesService, {
  getTreeFilterMode: (projectPath) =>
    Effect.try({
      try: () => readTreeFilterMode(projectPath),
      catch: (error) => (error instanceof Error ? error : new Error(String(error))),
    }),
  setTreeFilterMode: (mode, projectPath) =>
    Effect.try({
      try: () => writeTreeFilterModeValue(mode, projectPath),
      catch: (error) => (error instanceof Error ? error : new Error(String(error))),
    }),
  getBranchSummarySkipPrompt: (projectPath) =>
    Effect.try({
      try: () => readBranchSummarySkipPrompt(projectPath),
      catch: (error) => (error instanceof Error ? error : new Error(String(error))),
    }),
})
