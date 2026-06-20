import fs from 'node:fs/promises'
import path from 'node:path'
import { MCP_CONFIG } from '@shared/constants/mcp'
import type { McpConfigFile, McpConfigSourceId, McpSettingsView } from '@shared/types/mcp'
import type {
  WaggleAppInstallResult,
  WaggleAppInstallStatus,
  WaggleAppManifest,
} from '@shared/types/waggle'
import {
  buildWaggleAppInstallStatus,
  getWaggleAppMcpInstallRecipe,
  getWaggleAppSkillInstallRecipe,
  type WaggleAppMcpInstallRecipe,
} from '@shared/utils/waggle-app-dependencies'
import * as Effect from 'effect/Effect'
import { loadSkillCatalog } from '../skills/skill-catalog'

const MCP_INSTALL_SOURCE_PREFERENCE: readonly McpConfigSourceId[] = [
  'project-openwaggle',
  'project-standard',
  'project-agents',
  'project-pi',
] as const

interface WaggleAppInstallerSettingsService {
  readonly get: () => Effect.Effect<import('@shared/types/settings').Settings>
  readonly update: (
    partial: Partial<import('@shared/types/settings').Settings>,
  ) => Effect.Effect<void>
}

interface WaggleAppInstallerMcpConfigService {
  readonly getView: (projectPath?: string | null) => Effect.Effect<McpSettingsView>
  readonly setAdapterEnabled: (input: {
    readonly enabled: boolean
    readonly projectPath?: string | null
  }) => Effect.Effect<McpSettingsView>
  readonly setServerEnabled: (input: {
    readonly projectPath?: string | null
    readonly sourceId: McpConfigSourceId
    readonly serverName: string
    readonly enabled: boolean
  }) => Effect.Effect<McpSettingsView>
  readonly writeSourceConfig: (input: {
    readonly projectPath?: string | null
    readonly sourceId: McpConfigSourceId
    readonly rawJson: string
  }) => Effect.Effect<McpSettingsView>
}

export async function getWaggleAppInstallStatus(input: {
  readonly projectPath: string
  readonly app: WaggleAppManifest
  readonly settingsService: WaggleAppInstallerSettingsService
  readonly mcpConfigService: WaggleAppInstallerMcpConfigService
}): Promise<WaggleAppInstallStatus> {
  const settings = await Effect.runPromise(input.settingsService.get())
  const skillToggles = settings.skillTogglesByProject[input.projectPath] ?? {}
  const [catalog, mcpSettings] = await Promise.all([
    loadSkillCatalog(input.projectPath, skillToggles),
    Effect.runPromise(input.mcpConfigService.getView(input.projectPath)),
  ])

  return buildWaggleAppInstallStatus({
    app: input.app,
    catalog,
    mcpSettings,
  })
}

export async function installWaggleAppDependencies(input: {
  readonly projectPath: string
  readonly app: WaggleAppManifest
  readonly settingsService: WaggleAppInstallerSettingsService
  readonly mcpConfigService: WaggleAppInstallerMcpConfigService
}): Promise<WaggleAppInstallResult> {
  const installedDependencyIds: string[] = []
  const enabledDependencyIds: string[] = []
  const skippedDependencyIds: string[] = []
  const unsupportedDependencyIds: string[] = []

  const settings = await Effect.runPromise(input.settingsService.get())
  const projectSkillToggles = { ...(settings.skillTogglesByProject[input.projectPath] ?? {}) }
  let catalog = await loadSkillCatalog(input.projectPath, projectSkillToggles)
  const skillIds = collectSkillDependencyIds(input.app)
  const mcpIds = collectMcpDependencyIds(input.app)

  for (const skillId of skillIds) {
    const recipe = getWaggleAppSkillInstallRecipe(skillId)
    if (!recipe) {
      unsupportedDependencyIds.push(skillId)
      continue
    }

    const existing = catalog.skills.find((skill) => skill.id === skillId) ?? null
    if (existing?.loadStatus === 'ok' && existing.enabled) {
      skippedDependencyIds.push(skillId)
      continue
    }
    if (existing?.loadStatus === 'ok' && !existing.enabled) {
      projectSkillToggles[skillId] = true
      enabledDependencyIds.push(skillId)
      continue
    }
    if (existing?.loadStatus === 'error') {
      skippedDependencyIds.push(skillId)
      continue
    }

    await writeStarterSkill(input.projectPath, skillId, recipe.markdown)
    installedDependencyIds.push(skillId)
  }

  if (enabledDependencyIds.length > 0) {
    await Effect.runPromise(
      input.settingsService.update({
        skillTogglesByProject: {
          ...settings.skillTogglesByProject,
          [input.projectPath]: projectSkillToggles,
        },
      }),
    )
  }

  let mcpSettings = await Effect.runPromise(input.mcpConfigService.getView(input.projectPath))
  const needsMcpInstall = mcpIds.some(
    (mcpId) => getWaggleAppMcpInstallRecipe(mcpId) !== null,
  )
  if (needsMcpInstall && !mcpSettings.adapter.enabled) {
    mcpSettings = await Effect.runPromise(
      input.mcpConfigService.setAdapterEnabled({
        enabled: true,
        projectPath: input.projectPath,
      }),
    )
  }

  const installSource = chooseInstallSourceId(mcpSettings)
  if (installSource) {
    const missingRecipes = mcpIds
      .map((mcpId) => getWaggleAppMcpInstallRecipe(mcpId))
      .filter((recipe): recipe is NonNullable<typeof recipe> => recipe !== null)
      .filter(
        (recipe) =>
          !mcpSettings.servers.some((server) =>
            [recipe.serverName, ...(recipe.alternateServerNames ?? [])].includes(server.name),
          ),
      )

    if (missingRecipes.length > 0) {
      const source = mcpSettings.sources.find((entry) => entry.id === installSource) ?? null
      if (source) {
        const nextRawJson = buildRawMcpConfigWithServers(source.rawJson, missingRecipes)
        mcpSettings = await Effect.runPromise(
          input.mcpConfigService.writeSourceConfig({
            projectPath: input.projectPath,
            sourceId: source.id,
            rawJson: nextRawJson,
          }),
        )
        installedDependencyIds.push(...missingRecipes.map((recipe) => recipe.id))
      }
    }
  } else if (mcpIds.length > 0) {
    unsupportedDependencyIds.push(...mcpIds)
  }

  for (const mcpId of mcpIds) {
    const recipe = getWaggleAppMcpInstallRecipe(mcpId)
    if (!recipe) {
      if (!unsupportedDependencyIds.includes(mcpId)) {
        unsupportedDependencyIds.push(mcpId)
      }
      continue
    }

    const server =
      mcpSettings.servers.find((entry) =>
        [recipe.serverName, ...(recipe.alternateServerNames ?? [])].includes(entry.name),
      ) ?? null
    if (!server) continue
    if (server.enabled) {
      if (!installedDependencyIds.includes(mcpId)) {
        skippedDependencyIds.push(mcpId)
      }
      continue
    }

    mcpSettings = await Effect.runPromise(
      input.mcpConfigService.setServerEnabled({
        projectPath: input.projectPath,
        sourceId: server.sourceId,
        serverName: server.name,
        enabled: true,
      }),
    )
    enabledDependencyIds.push(mcpId)
  }

  catalog = await loadSkillCatalog(input.projectPath, projectSkillToggles)

  return {
    status: buildWaggleAppInstallStatus({
      app: input.app,
      catalog,
      mcpSettings,
    }),
    installedDependencyIds,
    enabledDependencyIds,
    skippedDependencyIds,
    unsupportedDependencyIds,
  }
}

function collectSkillDependencyIds(app: WaggleAppManifest) {
  return dedupeDependencyIds([...app.requiredSkills, ...(app.optionalSkills ?? [])])
}

function collectMcpDependencyIds(app: WaggleAppManifest) {
  return dedupeDependencyIds([...app.requiredMcps, ...(app.optionalMcps ?? [])])
}

function dedupeDependencyIds(values: readonly string[]) {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const value of values) {
    if (!value || seen.has(value)) continue
    seen.add(value)
    normalized.push(value)
  }
  return normalized
}

async function writeStarterSkill(projectPath: string, skillId: string, markdown: string) {
  const skillDir = path.join(projectPath, '.openwaggle', 'skills', skillId)
  await fs.mkdir(skillDir, { recursive: true })
  await fs.writeFile(path.join(skillDir, 'SKILL.md'), markdown, {
    encoding: 'utf8',
    flag: 'wx',
  })
}

function chooseInstallSourceId(mcpSettings: McpSettingsView) {
  const editableSourceIds = new Set(
    mcpSettings.sources.filter((source) => source.editable).map((source) => source.id),
  )

  for (const sourceId of MCP_INSTALL_SOURCE_PREFERENCE) {
    if (editableSourceIds.has(sourceId)) {
      return sourceId
    }
  }

  return mcpSettings.sources.find((source) => source.editable)?.id ?? null
}

function buildRawMcpConfigWithServers(
  rawJson: string,
  recipes: readonly WaggleAppMcpInstallRecipe[],
) {
  const parsed = parseMcpConfig(rawJson)
  const currentServers = isRecord(parsed.mcpServers) ? { ...parsed.mcpServers } : {}

  for (const recipe of recipes) {
    if (!recipe) continue
    currentServers[recipe.serverName] = recipe.definition
  }

  const nextConfig: McpConfigFile = {
    ...parsed,
    mcpServers: currentServers,
  }
  return ensureTrailingNewline(JSON.stringify(nextConfig, null, MCP_CONFIG.JSON_INDENT_SPACES))
}

function parseMcpConfig(rawJson: string): McpConfigFile {
  const raw = rawJson.trim().length > 0 ? rawJson : MCP_CONFIG.EMPTY_CONFIG_RAW_JSON
  return JSON.parse(raw) as McpConfigFile
}

function ensureTrailingNewline(value: string) {
  return value.endsWith('\n') ? value : `${value}\n`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
