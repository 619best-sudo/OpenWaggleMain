import type { McpSettingsView } from '@shared/types/mcp'
import type { SessionDetail } from '@shared/types/session'
import type { Settings, ToolPermissionMode } from '@shared/types/settings'
import * as Effect from 'effect/Effect'
import { makeErrorInfo } from '../../agent/error-classifier'
import { buildTuringStandardsContext } from '../../agent/standards-context-projection'
import type { AgentKernelStandardsContext } from '../../ports/agent-kernel-service'
import { McpConfigService } from '../../ports/mcp-config-service'
import { ProviderService } from '../../ports/provider-service'
import { SessionProjectionRepository } from '../../ports/session-projection-repository'
import { SettingsService } from '../../services/settings-service'
import { assignSessionTitleFromUserText } from '../run-handler-utils'
import type { AgentRunInput, AgentRunResult } from './types'

interface AgentRunPreflightSuccess {
  readonly ok: true
  readonly session: SessionDetail
  readonly assignedTitle?: string
  readonly skillToggles?: Record<string, boolean>
  readonly toolPermissionMode: ToolPermissionMode
  /**
   * MCP settings view for the session's project. Resolved here (cheap: a JSON
   * file read + merge) so the turing kernel can attach MCP servers without a
   * per-run config re-scan on the critical path.
   */
  readonly mcpSettings?: McpSettingsView
  /**
   * Standards context (AGENTS.md + scoped instructions + all toggle-enabled
   * skills) for the turing kernel. Built here so prewarm and the run path share
   * the same stable runtime signature, letting the bridge WeakMap fast-path hit.
   */
  readonly standardsContext?: AgentKernelStandardsContext
}

interface AgentRunPreflightFailure {
  readonly ok: false
  readonly result: AgentRunResult
}

export function loadAgentRunPreflight(input: AgentRunInput) {
  return Effect.gen(function* () {
    const sessionProjectionRepo = yield* SessionProjectionRepository
    const session = yield* sessionProjectionRepo.getOptional(input.sessionId)
    if (!session) return sessionNotFound()

    const providerService = yield* ProviderService
    const isKnown = yield* providerService.isKnownModel(input.model, session.projectPath)
    if (!isKnown) return invalidModel(input.model)

    const settingsService = yield* SettingsService
    const settings = yield* settingsService.get()
    const assignedTitle = yield* assignSessionTitleFromUserText(
      input.sessionId,
      session,
      input.payload.text,
    )
    if (assignedTitle) {
      yield* Effect.sync(() => input.onTitleAssigned?.(assignedTitle))
    }

    // Resolve MCP settings + turing standards context. Both are best-effort: a
    // resolution failure must not block the run — the kernel proceeds without
    // extensions and the warnings land in the run result. This runs on the
    // pre-run path but is cheap (JSON read + directory scan), and the bridge
    // fast-path skips the expensive MCP re-spawn when prewarm already attached.
    const projectPath = session.projectPath ?? undefined
    const [mcpSettingsResult, standardsResult] = yield* Effect.all(
      [resolveMcpSettings(projectPath), resolveTuringStandards(projectPath, settings)],
      { concurrency: 'unbounded' },
    )

    return {
      ok: true,
      session,
      toolPermissionMode: settings.toolPermissionMode,
      ...(assignedTitle ? { assignedTitle } : {}),
      ...(session.projectPath && settings.skillTogglesByProject[session.projectPath]
        ? { skillToggles: settings.skillTogglesByProject[session.projectPath] }
        : {}),
      ...(mcpSettingsResult ? { mcpSettings: mcpSettingsResult } : {}),
      ...(standardsResult ? { standardsContext: standardsResult } : {}),
    } satisfies AgentRunPreflightSuccess
  })
}

/**
 * Resolve the merged MCP settings view for a project. Failures are swallowed
 * (returns `undefined`) — the run proceeds without MCP servers and the failure
 * shows up in logs, not as a hard error to the user.
 */
function resolveMcpSettings(projectPath: string | undefined) {
  return Effect.gen(function* () {
    if (!projectPath) return undefined
    const mcpConfig = yield* McpConfigService
    const result = yield* Effect.either(mcpConfig.getView(projectPath))
    return result._tag === 'Right' ? result.right : undefined
  })
}

/**
 * Resolve the turing-path standards context (AGENTS.md + scoped instructions +
 * all toggle-enabled skills). Failures are swallowed — the run proceeds without
 * skills/standards injected into the runtime prompt.
 */
function resolveTuringStandards(projectPath: string | undefined, settings: Settings) {
  return Effect.gen(function* () {
    if (!projectPath) return undefined
    const result = yield* Effect.either(
      Effect.promise(() => buildTuringStandardsContext(projectPath, settings)),
    )
    return result._tag === 'Right' ? result.right : undefined
  })
}

function sessionNotFound(): AgentRunPreflightFailure {
  const errorInfo = makeErrorInfo('session-not-found', 'Session not found')
  return {
    ok: false,
    result: { outcome: 'not-found', message: errorInfo.userMessage, code: errorInfo.code },
  }
}

function invalidModel(model: string): AgentRunPreflightFailure {
  return {
    ok: false,
    result: {
      outcome: 'invalid-model',
      message: `Unknown model: ${model}`,
      code: 'invalid-model',
    },
  }
}
