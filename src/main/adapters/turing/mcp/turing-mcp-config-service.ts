/**
 * Turing-backed {@link McpConfigService}.
 *
 * The MCP config-merging logic (`createPiMcpConfigService`) is Pi-neutral — it only
 * reads/writes JSON config files across the OpenWaggle/`.openwaggle` sources and the
 * Pi agent dir. turing-harness consumes MCP servers natively via
 * `turing-openwaggle-bridge.ts`, so this layer's sole job is to produce the
 * `McpSettingsView` the renderer reads and persist user edits.
 *
 * It delegates to the existing config factory until the `pi/` adapter directory is
 * removed (M4), at which point the `mcp-config/` subfolder is relocated to a neutral
 * location and the Pi agent-dir sources are dropped.
 */
import { homedir } from 'node:os'
import { getAgentDir } from '@mariozechner/pi-coding-agent'
import type { McpSettingsView } from '@shared/types/mcp'
import { Effect, Layer } from 'effect'
import { createLogger } from '../../../logger'
import { McpConfigService } from '../../../ports/mcp-config-service'
import { installMcpAdapterPackage } from '../../pi/mcp-config/adapter-package'
import { createPiMcpConfigService } from '../../pi/mcp-config/service-factory'
import { reconcileMcpPool } from '../turing-memory-prewarm'

const logger = createLogger('turing-mcp-config')

/**
 * Warm the project's shared MCP pool to match the config the user just saved.
 *
 * This is the whole reason MCP tools are available at turn 1 without the prompt
 * path paying for a spawn: the user is already sitting on the MCP settings page
 * when they flip a toggle, so that's where the seconds-long `npx` cold start
 * belongs. By the time they switch back to a thread the servers are connected
 * and `borrow()` is a Map lookup.
 *
 * Fire-and-forget — the settings IPC returns the new view immediately.
 *
 * Note this replaces the pi-era `warmMcpMetadataCache`, which spawned every
 * changed server, listed its tools, wrote a disk cache, and then KILLED the
 * process — all while blocking the toggle response. That cache is read only by
 * `pi-mcp-adapter`'s own runtime, so on the turing path it was pure cost: the
 * spawn got paid twice, once discarded here and once for real on the next run.
 */
function warmTuringMcpPool(view: McpSettingsView, projectPath?: string | null) {
  if (!projectPath) return
  void reconcileMcpPool(projectPath, view).catch((error: unknown) => {
    logger.warn('MCP pool warm-up after settings change failed (non-fatal)', {
      projectPath,
      error: error instanceof Error ? error.message : String(error),
    })
  })
}

function createLiveMcpConfigService() {
  return createPiMcpConfigService({
    homeDir: homedir(),
    agentDir: getAgentDir(),
    installAdapterPackage: installMcpAdapterPackage,
    onConfigChanged: warmTuringMcpPool,
  })
}

export const TuringMcpConfigServiceLive = Layer.succeed(McpConfigService, {
  getView: (projectPath) => Effect.promise(() => createLiveMcpConfigService().getView(projectPath)),
  setAdapterEnabled: (input) =>
    Effect.promise(() =>
      createLiveMcpConfigService().setAdapterEnabled(input.enabled, input.projectPath),
    ),
  setServerEnabled: (input) =>
    Effect.promise(() => createLiveMcpConfigService().setServerEnabled(input)),
  writeSourceConfig: (input) =>
    Effect.promise(() => createLiveMcpConfigService().writeSourceConfig(input)),
})
