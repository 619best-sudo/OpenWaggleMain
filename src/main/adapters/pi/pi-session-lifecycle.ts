import type {
  AgentSession,
  CreateAgentSessionFromServicesOptions,
  CreateAgentSessionResult,
  SessionShutdownEvent,
} from '@mariozechner/pi-coding-agent'
import { createAgentSessionFromServices } from '@mariozechner/pi-coding-agent'
import { createLogger } from '../../logger'
import {
  getOpenWaggleMcpRuntimeContextForServices,
  type OpenWaggleMcpRuntimeContext,
  withOpenWaggleMcpAdapterProcessContext,
} from './pi-mcp-config-service'

const logger = createLogger('pi-session-lifecycle')
const mcpRuntimeContextsBySession = new WeakMap<AgentSession, OpenWaggleMcpRuntimeContext>()

async function bindSessionExtensions(session: AgentSession) {
  await session.bindExtensions({})
}

export async function createOpenWaggleAgentSessionFromServices(
  options: CreateAgentSessionFromServicesOptions,
): Promise<CreateAgentSessionResult> {
  const context = getOpenWaggleMcpRuntimeContextForServices(options.services)
  return withOpenWaggleMcpAdapterProcessContext(context, async () => {
    const result = await createAgentSessionFromServices(options)
    if (context) {
      mcpRuntimeContextsBySession.set(result.session, context)
    }
    try {
      await bindSessionExtensions(result.session)
      // #region debug-point B:session-tools
      await (async () => {
        let debugServerUrl = 'http://127.0.0.1:7777/event'
        let debugSessionId = 'pi-mcp-browser'
        try {
          const { readFileSync } = await import('node:fs')
          const envFile = readFileSync('.dbg/pi-mcp-browser.env', 'utf8')
          debugServerUrl = envFile.match(/DEBUG_SERVER_URL=(.+)/)?.[1] ?? debugServerUrl
          debugSessionId = envFile.match(/DEBUG_SESSION_ID=(.+)/)?.[1] ?? debugSessionId
        } catch {}
        void fetch(debugServerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: debugSessionId,
            runId: 'pre-fix',
            hypothesisId: 'B',
            location: 'src/main/adapters/pi/pi-session-lifecycle.ts:createOpenWaggleAgentSessionFromServices',
            msg: '[DEBUG] Bound Pi session extensions',
            data: {
              sessionId: result.session.sessionId,
              toolNames: result.session.agent.state.tools.map((tool) => tool.name),
              toolCount: result.session.agent.state.tools.length,
            },
            ts: Date.now(),
          }),
        }).catch(() => {})
      })()
      // #endregion
      return result
    } catch (error) {
      await disposeOpenWagglePiSession(result.session)
      throw error
    }
  })
}

export async function disposeOpenWagglePiSession(
  session: AgentSession,
  reason: SessionShutdownEvent['reason'] = 'quit',
): Promise<void> {
  const event: SessionShutdownEvent = { type: 'session_shutdown', reason }
  const context = mcpRuntimeContextsBySession.get(session) ?? null
  try {
    await withOpenWaggleMcpAdapterProcessContext(context, () => session.extensionRunner.emit(event))
  } catch (error) {
    logger.warn('Pi session shutdown hook failed during disposal', {
      error: error instanceof Error ? error.message : String(error),
    })
  } finally {
    mcpRuntimeContextsBySession.delete(session)
    session.dispose()
  }
}

export async function withOpenWagglePiSessionLifecycleContext<T>(
  session: AgentSession,
  operation: () => Promise<T>,
): Promise<T> {
  const context = mcpRuntimeContextsBySession.get(session) ?? null
  return withOpenWaggleMcpAdapterProcessContext(context, operation)
}
