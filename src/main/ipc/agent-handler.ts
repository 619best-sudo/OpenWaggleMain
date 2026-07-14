/**
 * Agent IPC handlers — transport layer.
 *
 * Responsibilities: abort controller lifecycle, active run tracking,
 * stream buffer management, IPC event emission, cleanup.
 *
 * Business logic (model validation, session fetching, run execution,
 * message persistence, error classification) lives in AgentRunService.
 */
import { randomUUID } from 'node:crypto'
import { matchBy } from '@diegogbrisa/ts-match'
import { decodeUnknownOrThrow } from '@shared/schema'
import { agentSendPayloadSchema, toolPermissionResolutionSchema } from '@shared/schemas/validation'
import type { AgentSendPayload } from '@shared/types/agent'
import type { SessionId } from '@shared/types/brand'
import type { SupportedModelId } from '@shared/types/llm'
import { TOOL_PERMISSION_CUSTOM_TYPE, type ToolPermissionResolution } from '@shared/types/tool-permission'
import type { AgentTransportEvent } from '@shared/types/stream'
import * as Effect from 'effect/Effect'
import { registerApprovedToolPermission } from '../adapters/pi/tool-permission-request-extension'
import { registerApprovedToolExecutionModel } from '../adapters/pi/tool-execution-model-state'
import { getPhaseForSession } from '../agent/phase-tracker'
import { cleanupSessionRun } from '../agent/session-cleanup'
import { type AgentRunResult, executeAgentRun } from '../application/agent-run-service'
import { compactAgentSession, getAgentContextUsage } from '../application/agent-session-service'
import { broadcastToWindows } from '../utils/broadcast'
import {
  clearAgentPhase,
  clearStreamBuffer,
  emitRunCompleted,
  emitTransportEvent,
  getStreamBuffer,
  listStreamBuffers,
  startStreamBuffer,
} from '../utils/stream-bridge'
import {
  activeCompactions,
  activeRuns,
  cancelAllSessionRuns,
  cancelSessionRuns,
  hasAnyActiveRun,
} from './active-agent-runs'
import { emitErrorAndFinish } from './run-handler-utils'
import { typedHandle } from './typed-ipc'

function clearSessionTransportState(sessionId: SessionId) {
  clearAgentPhase(sessionId)
  clearStreamBuffer(sessionId)
  cleanupSessionRun(sessionId)
}

function emitCancelledCompletion(sessionId: SessionId) {
  clearSessionTransportState(sessionId)
  emitRunCompleted(sessionId)
}

function handleRunResult(sessionId: SessionId, result: AgentRunResult) {
  if (result.outcome === 'error' && result.transportEmitted) {
    return
  }

  matchBy(result, 'outcome')
    .with('success', 'aborted', () => undefined)
    .with('invalid-model', 'not-found', 'error', (value) =>
      emitErrorAndFinish(sessionId, value.message, value.code),
    )
    .exhaustive()
}

function buildToolPermissionResolutionPrompt(resolution: ToolPermissionResolution) {
  const requestJson = JSON.stringify(
    {
      toolCallId: resolution.request.toolCallId,
      toolName: resolution.request.toolName,
      input: resolution.request.input,
      ...(resolution.request.model
        ? {
            model: resolution.request.model,
            requestedToolModel: resolution.request.model,
          }
        : {}),
    },
    null,
    2,
  )

  if (resolution.decision === 'approved') {
    return [
      'Resume the run from the suspended tool decision.',
      'Do not mention the permission approval to the user.',
      'If the exact same tool call is still required, run it now using the same arguments without re-explaining the approval.',
      'Do not ask for permission again for this exact request.',
      '',
      requestJson,
    ].join('\n')
  }

  return [
    'The user denied a pending tool permission request.',
    'Do not run the denied tool call.',
    'Briefly acknowledge the denial and continue with a safe alternative if possible.',
    '',
    requestJson,
  ].join('\n')
}

function toolPermissionPromptDelivery(resolution: ToolPermissionResolution) {
  return {
    mode: 'hidden-custom-message' as const,
    customType: TOOL_PERMISSION_CUSTOM_TYPE,
    details: {
      source: 'openwaggle',
      kind: 'tool-permission-resolution',
      decision: resolution.decision,
      toolCallId: resolution.request.toolCallId,
      toolName: resolution.request.toolName,
      input: resolution.request.input,
      ...(resolution.request.model
        ? {
            model: resolution.request.model,
            requestedToolModel: resolution.request.model,
          }
        : {}),
    },
  }
}

/**
 * Pi persists runtime progress into its session file as the run proceeds, so
 * graceful shutdown no longer reconstructs partial assistant messages from
 * stream chunks.
 */
export function persistAllActiveRuns() {
  return Effect.void
}

function registerAgentRunHandlers() {
  typedHandle(
    'agent:send-message',
    (_event, sessionId: SessionId, payload: AgentSendPayload, model: SupportedModelId) =>
      Effect.gen(function* () {
        const validatedPayload = decodeUnknownOrThrow(agentSendPayloadSchema, payload)
        // ─── Transport: cancel existing same-session work, register new ────
        if (cancelSessionRuns(sessionId)) {
          clearSessionTransportState(sessionId)
        }

        const abortController = new AbortController()
        const runId = randomUUID()
        activeRuns.register(sessionId, abortController, {
          model,
        })

        startStreamBuffer(sessionId, model, 'classic')

        function onEventWithUsageCapture(event: AgentTransportEvent) {
          emitTransportEvent(sessionId, event)
        }

        // ─── Application: delegate to service ────────────
        const result = yield* executeAgentRun({
          sessionId,
          runId,
          payload: validatedPayload,
          model,
          signal: abortController.signal,
          onEvent: onEventWithUsageCapture,
          onTitleAssigned: (title) => {
            broadcastToWindows('sessions:title-updated', { sessionId, title })
          },
        })

        // ─── Transport: respond based on outcome ─────────
        handleRunResult(sessionId, result)

        // ─── Transport: cleanup ──────────────────────────
        if (activeRuns.deleteIfCurrent(sessionId, abortController)) {
          clearAgentPhase(sessionId)
          clearStreamBuffer(sessionId)
          emitRunCompleted(sessionId)
        }
      }),
  )

  typedHandle('agent:cancel', (_event, sessionId?: SessionId) =>
    Effect.sync(() => {
      if (sessionId) {
        if (cancelSessionRuns(sessionId)) {
          emitCancelledCompletion(sessionId)
        }
      } else {
        const cancelledSessionIds = cancelAllSessionRuns()
        for (const id of cancelledSessionIds) {
          emitCancelledCompletion(id)
        }
      }
    }),
  )

  typedHandle(
    'agent:resolve-tool-permission',
    (_event, sessionId: SessionId, resolution: ToolPermissionResolution, model: SupportedModelId) =>
      Effect.gen(function* () {
        // #region debug-point A:ipc-handler-entry
        ;(() => {
          const fallbackUrl = 'http://127.0.0.1:7779/event'
          const fallbackSession = 'tool-model-routing'
          let debugServerUrl = fallbackUrl
          let debugSessionId = fallbackSession
          try {
            const fs = require('node:fs')
            const env = fs.readFileSync('.dbg/tool-model-routing.env', 'utf8') as string
            debugServerUrl = env.match(/DEBUG_SERVER_URL=(.+)/)?.[1] ?? fallbackUrl
            debugSessionId = env.match(/DEBUG_SESSION_ID=(.+)/)?.[1] ?? fallbackSession
          } catch {}
          void fetch(debugServerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: debugSessionId,
              runId: 'pre-fix',
              hypothesisId: 'A',
              location: 'agent-handler.ts:resolve-tool-permission',
              msg: '[DEBUG] Main process entered resolve-tool-permission handler',
              data: {
                sessionId,
                resolutionModel: resolution.request?.model ?? null,
                decision: resolution.decision,
                activeModel: model,
              },
              ts: Date.now(),
            }),
          }).catch(() => {})
        })()
        // #endregion
        const validatedResolution = decodeUnknownOrThrow(toolPermissionResolutionSchema, resolution)

        if (cancelSessionRuns(sessionId)) {
          clearSessionTransportState(sessionId)
        }

        if (validatedResolution.decision === 'approved') {
          registerApprovedToolPermission(validatedResolution.request)
          if (validatedResolution.request.model) {
            registerApprovedToolExecutionModel(validatedResolution.request.model)
          }
        }
        // #region debug-point A:permission-resolution-resume
        ;(() => {
          const fallbackUrl = 'http://127.0.0.1:7779/event'
          const fallbackSession = 'tool-model-routing'
          let debugServerUrl = fallbackUrl
          let debugSessionId = fallbackSession
          try {
            const fs = require('node:fs')
            const env = fs.readFileSync('.dbg/tool-model-routing.env', 'utf8') as string
            debugServerUrl = env.match(/DEBUG_SERVER_URL=(.+)/)?.[1] ?? fallbackUrl
            debugSessionId = env.match(/DEBUG_SESSION_ID=(.+)/)?.[1] ?? fallbackSession
          } catch {}
          void fetch(debugServerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: debugSessionId,
              runId: 'pre-fix',
              hypothesisId: 'A',
              location: 'agent-handler.ts',
              msg: '[DEBUG] Tool permission resolution resumed agent run',
              data: {
                sessionId,
                decision: validatedResolution.decision,
                requestedToolName: validatedResolution.request.toolName,
                requestedModel: validatedResolution.request.model ?? null,
                activeRunModel: model,
              },
              ts: Date.now(),
            }),
          }).catch(() => {})
        })()
        // #endregion

        const abortController = new AbortController()
        const runId = randomUUID()
        activeRuns.register(sessionId, abortController, {
          model,
        })

        startStreamBuffer(sessionId, model, 'classic')

        const result = yield* executeAgentRun({
          sessionId,
          runId,
          payload: {
            text: buildToolPermissionResolutionPrompt(validatedResolution),
            thinkingLevel: 'medium',
            attachments: [],
          },
          model,
          promptDelivery: toolPermissionPromptDelivery(validatedResolution),
          signal: abortController.signal,
          onEvent: (event: AgentTransportEvent) => {
            emitTransportEvent(sessionId, event)
          },
          onTitleAssigned: (title) => {
            broadcastToWindows('sessions:title-updated', { sessionId, title })
          },
        })

        handleRunResult(sessionId, result)

        if (activeRuns.deleteIfCurrent(sessionId, abortController)) {
          clearAgentPhase(sessionId)
          clearStreamBuffer(sessionId)
          emitRunCompleted(sessionId)
        }
      }),
  )
}

function registerAgentStateHandlers() {
  typedHandle('agent:get-phase', (_event, sessionId: SessionId) =>
    Effect.sync(() => getPhaseForSession(sessionId)),
  )

  typedHandle('agent:get-background-run', (_event, sessionId: SessionId) =>
    Effect.sync(() => getStreamBuffer(sessionId)),
  )

  typedHandle('agent:list-active-runs', () => Effect.sync(() => listStreamBuffers()))

  typedHandle('agent:get-context-usage', (_event, sessionId: SessionId, model: SupportedModelId) =>
    getAgentContextUsage({ sessionId, model }),
  )
}

function registerAgentCompactionHandlers() {
  typedHandle(
    'agent:compact-session',
    (_event, sessionId: SessionId, model: SupportedModelId, customInstructions?: string) =>
      Effect.gen(function* () {
        if (hasAnyActiveRun(sessionId)) {
          return yield* Effect.fail(
            new Error('Wait for the current run to finish before compacting.'),
          )
        }

        const abortController = new AbortController()
        activeCompactions.register(sessionId, abortController, { model })
        let delayedSuccessfulCompactionEnd: AgentTransportEvent | null = null

        return yield* compactAgentSession({
          sessionId,
          model,
          customInstructions,
          signal: abortController.signal,
          onEvent: (event) => {
            if (event.type === 'compaction_end' && !event.aborted && !event.errorMessage) {
              delayedSuccessfulCompactionEnd = event
              return
            }
            emitTransportEvent(sessionId, event)
          },
        }).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              if (delayedSuccessfulCompactionEnd) {
                emitTransportEvent(sessionId, delayedSuccessfulCompactionEnd)
              }
            }),
          ),
          Effect.ensuring(
            Effect.sync(() => {
              activeCompactions.deleteIfCurrent(sessionId, abortController)
            }),
          ),
        )
      }),
  )
}

function registerAgentSteeringHandlers() {
  typedHandle('agent:steer', (_event, sessionId: SessionId) =>
    Effect.sync(() => {
      if (cancelSessionRuns(sessionId)) {
        emitCancelledCompletion(sessionId)
      }

      return { preserved: false }
    }),
  )
}

export function registerAgentHandlers(): void {
  registerAgentRunHandlers()
  registerAgentStateHandlers()
  registerAgentCompactionHandlers()
  registerAgentSteeringHandlers()
}
