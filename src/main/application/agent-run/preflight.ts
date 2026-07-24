import type { ToolPermissionMode } from '@shared/types/settings'
import type { SessionDetail } from '@shared/types/session'
import * as Effect from 'effect/Effect'
import { makeErrorInfo } from '../../agent/error-classifier'
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
    // #region debug-point P:preflight-settings
    void fetch('http://127.0.0.1:7777/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'permission-flow',
        runId: 'pre-fix',
        hypothesisId: '1',
        location: 'agent-run/preflight.ts:loadAgentRunPreflight',
        msg: '[DEBUG] Loaded settings for agent run preflight',
        data: {
          sessionId: String(input.sessionId),
          model: input.model,
          toolPermissionMode: settings.toolPermissionMode,
          projectPath: session.projectPath,
        },
        ts: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
    const assignedTitle = yield* assignSessionTitleFromUserText(
      input.sessionId,
      session,
      input.payload.text,
    )
    if (assignedTitle) {
      yield* Effect.sync(() => input.onTitleAssigned?.(assignedTitle))
    }

    return {
      ok: true,
      session,
      toolPermissionMode: settings.toolPermissionMode,
      ...(assignedTitle ? { assignedTitle } : {}),
      ...(session.projectPath && settings.skillTogglesByProject[session.projectPath]
        ? { skillToggles: settings.skillTogglesByProject[session.projectPath] }
        : {}),
    } satisfies AgentRunPreflightSuccess
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
