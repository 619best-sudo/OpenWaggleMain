import { loadMcpConfig } from 'pi-mcp-adapter/config.ts'
import {
  computeServerHash,
  isServerCacheValid,
  loadMetadataCache,
  saveMetadataCache,
  serializeResources,
  serializeTools,
} from 'pi-mcp-adapter/metadata-cache.ts'
import { McpServerManager } from 'pi-mcp-adapter/server-manager.ts'
import { logger } from './constants'

function formatErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export async function warmMcpMetadataCache(configPath: string) {
  const config = loadMcpConfig(configPath)
  const cache = loadMetadataCache()
  const serversToWarm = Object.entries(config.mcpServers).filter(([name, definition]) => {
    const existing = cache?.servers?.[name]
    return !existing || !isServerCacheValid(existing, definition)
  })

  if (serversToWarm.length === 0) {
    return
  }

  const manager = new McpServerManager()

  try {
    await Promise.allSettled(
      serversToWarm.map(async ([name, definition]) => {
        try {
          const connection = await manager.connect(name, definition)
          if (connection.status !== 'connected') {
            logger.info('Skipped warming MCP metadata cache for server that needs auth', {
              serverName: name,
            })
            return
          }

          saveMetadataCache({
            version: 1,
            servers: {
              [name]: {
                configHash: computeServerHash(definition),
                tools: serializeTools(connection.tools),
                resources:
                  definition.exposeResources === false
                    ? []
                    : serializeResources(connection.resources),
                cachedAt: Date.now(),
              },
            },
          })
        } catch (error) {
          logger.warn('Failed to warm MCP metadata cache', {
            serverName: name,
            error: formatErrorMessage(error),
          })
        } finally {
          await manager.close(name).catch(() => {})
        }
      }),
    )
  } finally {
    await manager.closeAll().catch(() => {})
  }
}
