/**
 * First-run seeding of the default MCP servers.
 *
 * Out of the box the app ships with no MCP servers at all — every server has to
 * be added by hand on the MCP page or pulled in by installing a waggle preset's
 * dependencies. Playwright (browser automation) is the one the agent reaches
 * for constantly, so it's written into the GLOBAL MCP config once, on first
 * launch, and applies to every project. Device automation needs no server — the
 * agent harness drives devices through its built-in mobilecli-backed toolkit.
 * Everything else stays opt-in.
 *
 * Three properties this must hold:
 *
 *   - **Once, ever.** Guarded by `settings.defaultMcpServersSeeded`, not by
 *     "are these servers present". A user who deletes or disables Playwright
 *     must not find it back after a restart.
 *   - **Never clobber.** A server name already present in the global config —
 *     enabled or disabled, whoever put it there — is left exactly as-is.
 *   - **Never fatal.** This runs during boot. A malformed config file or an
 *     unwritable home directory logs and moves on; the app still starts.
 */

import { MCP_CONFIG } from '@shared/constants/mcp'
import type { McpConfigFile, McpSettingsView } from '@shared/types/mcp'
import { getWaggleAppMcpInstallRecipe } from '@shared/utils/waggle-app-dependencies'
import * as Effect from 'effect/Effect'
import { createLogger } from '../logger'
import { McpConfigService } from '../ports/mcp-config-service'
import { SettingsService } from '../services/settings-service'

const logger = createLogger('seed-default-mcp')

/**
 * Recipe ids seeded on first run. These resolve through the same
 * `WAGGLE_APP_MCP_RECIPES` table the waggle dependency installer uses, so the
 * spawn command lives in exactly one place — change the recipe and both paths
 * follow.
 */
const DEFAULT_MCP_RECIPE_IDS = ['playwright'] as const

/** The global config file every project inherits: `~/.config/mcp/mcp.json`. */
const SEED_SOURCE_ID = 'global-standard'

export function seedDefaultMcpServers() {
  return Effect.gen(function* () {
    const settingsService = yield* SettingsService
    const settings = yield* settingsService.get()
    if (settings.defaultMcpServersSeeded) return

    const mcpConfig = yield* McpConfigService
    const viewResult = yield* Effect.either(mcpConfig.getView(null))
    if (viewResult._tag === 'Left') {
      // Can't read the config — leave the flag unset so the next launch retries
      // rather than silently skipping the seed forever.
      logger.warn('Skipped default MCP seeding — could not read MCP settings', {
        error: String(viewResult.left),
      })
      return
    }

    const planResult = yield* Effect.either(Effect.try(() => planDefaultMcpSeed(viewResult.right)))
    if (planResult._tag === 'Left') {
      // Almost certainly a hand-edited config with a JSON syntax error. Bail
      // without setting the flag; the user fixes the file, we seed next launch.
      logger.warn('Skipped default MCP seeding — global config could not be parsed', {
        error: String(planResult.left),
      })
      return
    }
    const plan = planResult.right
    if (plan.skipped.length > 0) {
      logger.info('Default MCP servers already present — leaving them untouched', {
        skipped: plan.skipped,
      })
    }

    if (plan.rawJson) {
      const writeResult = yield* Effect.either(
        mcpConfig.writeSourceConfig({
          projectPath: null,
          sourceId: SEED_SOURCE_ID,
          rawJson: plan.rawJson,
        }),
      )
      if (writeResult._tag === 'Left') {
        logger.warn('Failed to write default MCP servers — will retry next launch', {
          error: String(writeResult.left),
        })
        return
      }
      logger.info('Seeded default MCP servers into the global config', {
        seeded: plan.seeded,
      })
    }

    // Mark seeded even when nothing was written (all names already taken) —
    // the one-time decision has been made either way.
    yield* settingsService.update({ defaultMcpServersSeeded: true })
  })
}

interface DefaultMcpSeedPlan {
  /** Full file contents to write, or null when there is nothing to add. */
  readonly rawJson: string | null
  /** Server names newly added. */
  readonly seeded: readonly string[]
  /** Server names left alone because the config already had them. */
  readonly skipped: readonly string[]
}

/**
 * Pure planner — exported for tests. Decides what (if anything) to write into
 * the global MCP source given the current merged view.
 */
export function planDefaultMcpSeed(view: McpSettingsView): DefaultMcpSeedPlan {
  const source = view.sources.find((entry) => entry.id === SEED_SOURCE_ID)
  if (!source) {
    return { rawJson: null, seeded: [], skipped: [] }
  }

  const parsed = parseConfig(source.rawJson)
  const servers = isRecord(parsed.mcpServers) ? { ...parsed.mcpServers } : {}
  const disabled = isRecord(parsed.openwaggle?.disabledMcpServers)
    ? parsed.openwaggle.disabledMcpServers
    : {}

  const seeded: string[] = []
  const skipped: string[] = []
  for (const recipeId of DEFAULT_MCP_RECIPE_IDS) {
    const recipe = getWaggleAppMcpInstallRecipe(recipeId)
    if (!recipe) continue
    // Check the whole merged view, not just this file: a server the user
    // already configured in a project source must not be duplicated globally.
    // Also check the disabled map — a deliberately-off server stays off.
    const names = [recipe.serverName, ...(recipe.alternateServerNames ?? [])]
    const alreadyKnown =
      names.some((name) => name in servers || name in disabled) ||
      view.servers.some((server) => names.includes(server.name))
    if (alreadyKnown) {
      skipped.push(recipe.serverName)
      continue
    }
    servers[recipe.serverName] = recipe.definition
    seeded.push(recipe.serverName)
  }

  if (seeded.length === 0) {
    return { rawJson: null, seeded, skipped }
  }

  const next: McpConfigFile = { ...parsed, mcpServers: servers }
  const json = JSON.stringify(next, null, MCP_CONFIG.JSON_INDENT_SPACES)
  return { rawJson: json.endsWith('\n') ? json : `${json}\n`, seeded, skipped }
}

function parseConfig(rawJson: string): McpConfigFile {
  const raw = rawJson.trim().length > 0 ? rawJson : MCP_CONFIG.EMPTY_CONFIG_RAW_JSON
  try {
    const parsed: unknown = JSON.parse(raw)
    return isRecord(parsed) ? (parsed as McpConfigFile) : { mcpServers: {} }
  } catch {
    // A hand-edited config with a syntax error must NOT be overwritten —
    // treating it as empty here would rewrite the file and destroy the user's
    // content. Throw so the caller skips seeding entirely this launch.
    throw new Error('Global MCP config is not valid JSON')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
