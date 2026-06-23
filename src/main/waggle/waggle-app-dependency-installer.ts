import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
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

const execFileAsync = promisify(execFile)
const TOOL_PROBE_TIMEOUT_MS = 2_000

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

interface DetectedRepoProfile {
  readonly detectedSurfaces: readonly ('web' | 'mobile' | 'backend')[]
  readonly detectedFrameworks: readonly string[]
  readonly hasPackageJson: boolean
  readonly availableScripts: readonly string[]
  readonly webEntryCandidates: readonly string[]
  readonly mobileEntryCandidates: readonly string[]
  readonly webCommandCandidates: readonly string[]
  readonly mobileCommandCandidates: readonly string[]
  readonly hasLikelyWebRuntime: boolean
  readonly hasLikelyMobileRuntime: boolean
  readonly hasInstalledNodeModules: boolean
  readonly availableLocalTools: readonly string[]
  readonly webBootProbe: ProbeResult | null
  readonly mobileBootProbe: ProbeResult | null
}

interface ProbeResult {
  readonly status: 'pass' | 'warn'
  readonly detail: string
  readonly command?: string
}

export async function getWaggleAppInstallStatus(input: {
  readonly projectPath: string
  readonly presetId?: string
  readonly app: WaggleAppManifest
  readonly settingsService: WaggleAppInstallerSettingsService
  readonly mcpConfigService: WaggleAppInstallerMcpConfigService
}): Promise<WaggleAppInstallStatus> {
  const settings = await Effect.runPromise(input.settingsService.get())
  const skillToggles = settings.skillTogglesByProject[input.projectPath] ?? {}
  const [catalog, mcpSettings, repoProfile] = await Promise.all([
    loadSkillCatalog(input.projectPath, skillToggles),
    Effect.runPromise(input.mcpConfigService.getView(input.projectPath)),
    detectRepoProfile(input.projectPath, input.presetId),
  ])

  return buildWaggleAppInstallStatus({
    presetId: input.presetId,
    app: input.app,
    catalog,
    mcpSettings,
    repoProfile,
  })
}

export async function installWaggleAppDependencies(input: {
  readonly projectPath: string
  readonly presetId?: string
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
  const repoProfile = await detectRepoProfile(input.projectPath, input.presetId)

  return {
    status: buildWaggleAppInstallStatus({
      presetId: input.presetId,
      app: input.app,
      catalog,
      mcpSettings,
      repoProfile,
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

async function detectRepoProfile(
  projectPath: string,
  presetId?: string,
): Promise<DetectedRepoProfile> {
  const packageJson = await readPackageJson(projectPath)
  const scripts = Object.keys(packageJson?.scripts ?? {})
  const dependencyNames = new Set([
    ...Object.keys(packageJson?.dependencies ?? {}),
    ...Object.keys(packageJson?.devDependencies ?? {}),
  ])
  const fileSignals = await Promise.all([
    pathExists(path.join(projectPath, 'node_modules')),
    pathExists(path.join(projectPath, 'pnpm-lock.yaml')),
    pathExists(path.join(projectPath, 'package-lock.json')),
    pathExists(path.join(projectPath, 'yarn.lock')),
    pathExists(path.join(projectPath, 'bun.lockb')),
    pathExists(path.join(projectPath, 'bun.lock')),
    pathExists(path.join(projectPath, 'next.config.js')),
    pathExists(path.join(projectPath, 'next.config.mjs')),
    pathExists(path.join(projectPath, 'next.config.ts')),
    pathExists(path.join(projectPath, 'vite.config.js')),
    pathExists(path.join(projectPath, 'vite.config.ts')),
    pathExists(path.join(projectPath, 'vite.config.mjs')),
    pathExists(path.join(projectPath, 'index.html')),
    pathExists(path.join(projectPath, 'src', 'main.ts')),
    pathExists(path.join(projectPath, 'src', 'main.tsx')),
    pathExists(path.join(projectPath, 'src', 'main.js')),
    pathExists(path.join(projectPath, 'src', 'main.jsx')),
    pathExists(path.join(projectPath, 'src', 'App.ts')),
    pathExists(path.join(projectPath, 'src', 'App.tsx')),
    pathExists(path.join(projectPath, 'src', 'App.js')),
    pathExists(path.join(projectPath, 'src', 'App.jsx')),
    pathExists(path.join(projectPath, 'pages')),
    pathExists(path.join(projectPath, 'app')),
    pathExists(path.join(projectPath, 'app.json')),
    pathExists(path.join(projectPath, 'app.config.js')),
    pathExists(path.join(projectPath, 'app.config.ts')),
    pathExists(path.join(projectPath, 'App.tsx')),
    pathExists(path.join(projectPath, 'App.js')),
    pathExists(path.join(projectPath, 'index.ts')),
    pathExists(path.join(projectPath, 'index.js')),
    pathExists(path.join(projectPath, 'android')),
    pathExists(path.join(projectPath, 'ios')),
    pathExists(path.join(projectPath, 'pubspec.yaml')),
    pathExists(path.join(projectPath, 'lib', 'main.dart')),
  ])

  const [
    hasNodeModules,
    hasPnpmLock,
    hasPackageLock,
    hasYarnLock,
    hasBunLockb,
    hasBunLock,
    hasNextConfigJs,
    hasNextConfigMjs,
    hasNextConfigTs,
    hasViteConfigJs,
    hasViteConfigTs,
    hasViteConfigMjs,
    hasIndexHtml,
    hasSrcMainTs,
    hasSrcMainTsx,
    hasSrcMainJs,
    hasSrcMainJsx,
    hasSrcAppTs,
    hasSrcAppTsx,
    hasSrcAppJs,
    hasSrcAppJsx,
    hasPagesDir,
    hasAppDir,
    hasExpoAppJson,
    hasExpoAppConfigJs,
    hasExpoAppConfigTs,
    hasRootAppTsx,
    hasRootAppJs,
    hasRootIndexTs,
    hasRootIndexJs,
    hasAndroidDir,
    hasIosDir,
    hasPubspecYaml,
    hasFlutterMainDart,
  ] = fileSignals
  const packageManager = detectPackageManager({
    hasPnpmLock,
    hasPackageLock,
    hasYarnLock,
    hasBunLockb,
    hasBunLock,
  })
  const detectedFrameworks = new Set<string>()
  const detectedSurfaces = new Set<'web' | 'mobile' | 'backend'>()

  if (
    dependencyNames.has('next') ||
    hasNextConfigJs ||
    hasNextConfigMjs ||
    hasNextConfigTs
  ) {
    detectedFrameworks.add('next')
    detectedSurfaces.add('web')
  }
  if (
    dependencyNames.has('vite') ||
    hasViteConfigJs ||
    hasViteConfigTs ||
    hasViteConfigMjs
  ) {
    detectedFrameworks.add('vite')
    detectedSurfaces.add('web')
  }
  if (hasIndexHtml && detectedSurfaces.size === 0) {
    detectedFrameworks.add('static-web')
    detectedSurfaces.add('web')
  }
  if (dependencyNames.has('expo') || hasExpoAppJson || hasExpoAppConfigJs || hasExpoAppConfigTs) {
    detectedFrameworks.add('expo')
    detectedSurfaces.add('mobile')
  }
  if (dependencyNames.has('react-native')) {
    detectedFrameworks.add('react-native')
    detectedSurfaces.add('mobile')
  }
  if (hasAndroidDir || hasIosDir) {
    detectedFrameworks.add('native-mobile')
    detectedSurfaces.add('mobile')
  }
  if (hasPubspecYaml) {
    detectedFrameworks.add('flutter')
    detectedSurfaces.add('mobile')
  }
  if (
    dependencyNames.has('express') ||
    dependencyNames.has('fastify') ||
    dependencyNames.has('koa') ||
    dependencyNames.has('@nestjs/core')
  ) {
    detectedFrameworks.add('backend')
    detectedSurfaces.add('backend')
  }

  const hasLikelyWebRuntime =
    scripts.some((script) => ['dev', 'start', 'build', 'preview'].includes(script)) &&
    (detectedSurfaces.has('web') || hasIndexHtml)
  const hasLikelyMobileRuntime =
    scripts.some((script) =>
      ['start', 'dev', 'android', 'ios', 'web'].includes(script),
    ) && detectedSurfaces.has('mobile')
  const webEntryCandidates = [
    hasIndexHtml ? 'index.html' : null,
    hasSrcMainTs ? 'src/main.ts' : null,
    hasSrcMainTsx ? 'src/main.tsx' : null,
    hasSrcMainJs ? 'src/main.js' : null,
    hasSrcMainJsx ? 'src/main.jsx' : null,
    hasSrcAppTs ? 'src/App.ts' : null,
    hasSrcAppTsx ? 'src/App.tsx' : null,
    hasSrcAppJs ? 'src/App.js' : null,
    hasSrcAppJsx ? 'src/App.jsx' : null,
    hasPagesDir ? 'pages/' : null,
    hasAppDir && detectedSurfaces.has('web') ? 'app/' : null,
  ].filter((value): value is string => value !== null)
  const mobileEntryCandidates = [
    hasExpoAppJson ? 'app.json' : null,
    hasExpoAppConfigJs ? 'app.config.js' : null,
    hasExpoAppConfigTs ? 'app.config.ts' : null,
    hasRootAppTsx ? 'App.tsx' : null,
    hasRootAppJs ? 'App.js' : null,
    hasRootIndexTs ? 'index.ts' : null,
    hasRootIndexJs ? 'index.js' : null,
    hasAndroidDir ? 'android/' : null,
    hasIosDir ? 'ios/' : null,
    hasFlutterMainDart ? 'lib/main.dart' : null,
    hasAppDir && detectedSurfaces.has('mobile') ? 'app/' : null,
  ].filter((value): value is string => value !== null)
  const webCommandCandidates = buildCommandCandidates(
    packageManager,
    scripts,
    ['dev', 'start', 'build', 'preview'],
  )
  const mobileCommandCandidates = buildCommandCandidates(
    packageManager,
    scripts,
    ['start', 'dev', 'android', 'ios', 'web'],
  )
  const availableLocalTools = await detectAvailableTools(
    buildRelevantToolNames({
      packageManager,
      detectedFrameworks: [...detectedFrameworks],
      detectedSurfaces: [...detectedSurfaces],
      hasIosDir,
      hasAndroidDir,
      hasPubspecYaml,
    }),
  )
  const webBootProbe =
    presetId && isWebPresetId(presetId)
      ? await probeProjectRuntime({
          projectPath,
          target: 'web',
          detectedFrameworks: [...detectedFrameworks],
          entryCandidates: webEntryCandidates,
          hasInstalledNodeModules: hasNodeModules,
        })
      : null
  const mobileBootProbe =
    presetId && isMobilePresetId(presetId)
      ? await probeProjectRuntime({
          projectPath,
          target: 'mobile',
          detectedFrameworks: [...detectedFrameworks],
          entryCandidates: mobileEntryCandidates,
          hasInstalledNodeModules: hasNodeModules,
        })
      : null

  return {
    detectedSurfaces: [...detectedSurfaces],
    detectedFrameworks: [...detectedFrameworks],
    hasPackageJson: packageJson !== null,
    availableScripts: scripts,
    webEntryCandidates,
    mobileEntryCandidates,
    webCommandCandidates,
    mobileCommandCandidates,
    hasLikelyWebRuntime,
    hasLikelyMobileRuntime: hasLikelyMobileRuntime || hasPubspecYaml || hasAndroidDir || hasIosDir,
    hasInstalledNodeModules: hasNodeModules,
    availableLocalTools,
    webBootProbe,
    mobileBootProbe,
  }
}

function detectPackageManager(input: {
  readonly hasPnpmLock: boolean
  readonly hasPackageLock: boolean
  readonly hasYarnLock: boolean
  readonly hasBunLockb: boolean
  readonly hasBunLock: boolean
}) {
  if (input.hasPnpmLock) return 'pnpm'
  if (input.hasPackageLock) return 'npm'
  if (input.hasYarnLock) return 'yarn'
  if (input.hasBunLockb || input.hasBunLock) return 'bun'
  return 'npm'
}

function buildCommandCandidates(
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun',
  scripts: readonly string[],
  scriptNames: readonly string[],
) {
  return scriptNames
    .filter((scriptName) => scripts.includes(scriptName))
    .map((scriptName) => formatPackageManagerCommand(packageManager, scriptName))
}

function formatPackageManagerCommand(
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun',
  scriptName: string,
) {
  if (packageManager === 'npm') return `npm run ${scriptName}`
  return `${packageManager} ${scriptName}`
}

async function detectAvailableTools(toolNames: readonly string[]) {
  const results = await Promise.all(toolNames.map((toolName) => probeToolAvailability(toolName)))
  return toolNames.filter((_toolName, index) => results[index])
}

function buildRelevantToolNames(input: {
  readonly packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun'
  readonly detectedFrameworks: readonly string[]
  readonly detectedSurfaces: readonly ('web' | 'mobile' | 'backend')[]
  readonly hasIosDir: boolean
  readonly hasAndroidDir: boolean
  readonly hasPubspecYaml: boolean
}) {
  const toolNames = new Set<string>(['node', input.packageManager])

  if (input.detectedSurfaces.includes('mobile')) {
    if (
      input.detectedFrameworks.includes('expo') ||
      input.detectedFrameworks.includes('react-native') ||
      input.detectedFrameworks.includes('native-mobile') ||
      input.hasIosDir
    ) {
      toolNames.add('xcodebuild')
    }
    if (
      input.detectedFrameworks.includes('expo') ||
      input.detectedFrameworks.includes('react-native') ||
      input.detectedFrameworks.includes('native-mobile') ||
      input.hasAndroidDir
    ) {
      toolNames.add('adb')
    }
    if (input.detectedFrameworks.includes('flutter') || input.hasPubspecYaml) {
      toolNames.add('flutter')
    }
  }

  return [...toolNames]
}

async function probeToolAvailability(toolName: string) {
  const args = getToolProbeArgs(toolName)
  if (!args) return false

  try {
    await execFileAsync(toolName, args, {
      timeout: TOOL_PROBE_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 64 * 1024,
    })
    return true
  } catch {
    return false
  }
}

function getToolProbeArgs(toolName: string): readonly string[] | null {
  switch (toolName) {
    case 'node':
    case 'pnpm':
    case 'npm':
    case 'yarn':
    case 'bun':
    case 'flutter':
      return ['--version']
    case 'xcodebuild':
      return ['-version']
    case 'adb':
      return ['version']
    default:
      return null
  }
}

async function probeProjectRuntime(input: {
  readonly projectPath: string
  readonly target: 'web' | 'mobile'
  readonly detectedFrameworks: readonly string[]
  readonly entryCandidates: readonly string[]
  readonly hasInstalledNodeModules: boolean
}): Promise<ProbeResult> {
  if (input.entryCandidates.length === 0) {
    return {
      status: 'warn',
      detail: `No obvious ${input.target} app entry files were found yet.`,
    }
  }

  if (!input.hasInstalledNodeModules && input.target === 'web') {
    return {
      status: 'warn',
      detail: `Detected ${input.target} entry files, but project dependencies are not installed yet.`,
    }
  }

  const localBinary = resolveProjectLocalBinary(input.projectPath, input.detectedFrameworks, input.target)
  if (!localBinary) {
    return {
      status: 'warn',
      detail: `Detected ${input.target} entry files: ${input.entryCandidates.slice(0, 4).join(', ')}. No framework-specific local CLI probe is available for this project yet.`,
    }
  }

  try {
    await execFileAsync(localBinary.filePath, localBinary.args, {
      cwd: input.projectPath,
      timeout: TOOL_PROBE_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 64 * 1024,
    })
    return {
      status: 'pass',
      detail: `Verified local ${input.target} runtime entry via ${localBinary.command}.`,
      command: localBinary.command,
    }
  } catch {
    return {
      status: 'warn',
      detail: `Detected ${input.target} entry files, but the local ${localBinary.binaryName} CLI probe did not succeed.`,
      command: localBinary.command,
    }
  }
}

function resolveProjectLocalBinary(
  projectPath: string,
  detectedFrameworks: readonly string[],
  target: 'web' | 'mobile',
) {
  const binaryName = selectProjectBinary(detectedFrameworks, target)
  if (!binaryName) return null

  const binDir = path.join(projectPath, 'node_modules', '.bin')
  const fileName =
    process.platform === 'win32' ? `${binaryName}.cmd` : binaryName
  return {
    binaryName,
    filePath: path.join(binDir, fileName),
    args: ['--version'],
    command: `${binaryName} --version`,
  }
}

function selectProjectBinary(
  detectedFrameworks: readonly string[],
  target: 'web' | 'mobile',
) {
  if (target === 'web') {
    if (detectedFrameworks.includes('next')) return 'next'
    if (detectedFrameworks.includes('vite')) return 'vite'
    return null
  }
  if (detectedFrameworks.includes('expo')) return 'expo'
  if (detectedFrameworks.includes('react-native')) return 'react-native'
  return null
}

function isWebPresetId(presetId: string) {
  return presetId === 'web-engineer' || presetId === 'web-build'
}

function isMobilePresetId(presetId: string) {
  return presetId === 'mobile-engineer' || presetId === 'mobile-build'
}

async function readPackageJson(projectPath: string): Promise<{
  readonly scripts?: Record<string, string>
  readonly dependencies?: Record<string, string>
  readonly devDependencies?: Record<string, string>
} | null> {
  try {
    const raw = await fs.readFile(path.join(projectPath, 'package.json'), 'utf8')
    return JSON.parse(raw) as {
      readonly scripts?: Record<string, string>
      readonly dependencies?: Record<string, string>
      readonly devDependencies?: Record<string, string>
    }
  } catch {
    return null
  }
}

async function pathExists(filePath: string) {
  try {
    await fs.stat(filePath)
    return true
  } catch {
    return false
  }
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
