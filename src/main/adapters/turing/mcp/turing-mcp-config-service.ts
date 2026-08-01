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
import { Effect, Layer } from 'effect'
import { McpConfigService } from '../../../ports/mcp-config-service'
import { installMcpAdapterPackage } from '../../pi/mcp-config/adapter-package'
import { warmMcpMetadataCache } from '../../pi/mcp-config/metadata-warmup'
import { createPiMcpConfigService } from '../../pi/mcp-config/service-factory'

function createLiveMcpConfigService() {
  return createPiMcpConfigService({
    homeDir: homedir(),
    agentDir: getAgentDir(),
    installAdapterPackage: installMcpAdapterPackage,
    warmMcpMetadataCache,
  })
}

export const TuringMcpConfigServiceLive = Layer.succeed(McpConfigService, {
  getView: (projectPath) =>
    Effect.promise(() => createLiveMcpConfigService().getView(projectPath)),
  setAdapterEnabled: (input) =>
    Effect.promise(() =>
      createLiveMcpConfigService().setAdapterEnabled(input.enabled, input.projectPath),
    ),
  setServerEnabled: (input) =>
    Effect.promise(() => createLiveMcpConfigService().setServerEnabled(input)),
  writeSourceConfig: (input) =>
    Effect.promise(() => createLiveMcpConfigService().writeSourceConfig(input)),
})
