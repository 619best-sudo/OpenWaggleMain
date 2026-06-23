import { matchBy } from '@diegogbrisa/ts-match'
import { decodeUnknownOrThrow, Schema } from '@shared/schema'
import { agentSendPayloadSchema } from '@shared/schemas/validation'
import type { AgentSendPayload } from '@shared/types/agent'
import type { SessionId, SupportedModelId } from '@shared/types/brand'
import type { TeammateAgentGenerationInput, TeammateDefinition } from '@shared/types/teammate'
import * as Effect from 'effect/Effect'
import { classifyAgentError } from '../agent/error-classifier'
import { generateTeamAgent } from '../application/team-agent-generator-service'
import { executeTeamRun, type TeamRunResult } from '../application/team-run-service'
import { broadcastToWindows } from '../utils/broadcast'
import {
  clearAgentPhase,
  clearStreamBuffer,
  emitRunCompleted,
  emitTransportEvent,
  startStreamBuffer,
} from '../utils/stream-bridge'
import { activeTeamRuns, cancelSessionRuns } from './active-agent-runs'
import { validateRequiredProjectPath } from './project-path-validation'
import { emitErrorAndFinish } from './run-handler-utils'
import { typedHandle, typedOn } from './typed-ipc'

const teamAgentGenerationInputSchema = Schema.Struct({
  instructions: Schema.String.pipe(Schema.minLength(1)),
  availableAgentIds: Schema.Array(Schema.String),
  availableAgentLabels: Schema.Array(Schema.String),
})

export function registerTeamHandlers() {
  registerSendTeamMessageHandler()
  registerGenerateTeamAgentHandler()
  registerCancelTeamHandler()
}

function registerSendTeamMessageHandler() {
  typedHandle(
    'agent:send-team-message',
    (
      _event,
      sessionId: SessionId,
      payload: AgentSendPayload,
      model: SupportedModelId,
      teammate: TeammateDefinition,
    ) => handleSendTeamMessage(sessionId, payload, model, teammate),
  )
}

function registerCancelTeamHandler() {
  typedOn('agent:cancel-team', (_event, sessionId: SessionId) =>
    Effect.sync(() => {
      if (activeTeamRuns.cancel(sessionId)) finishTeamRun(sessionId)
    }),
  )
}

function registerGenerateTeamAgentHandler() {
  typedHandle(
    'agent:generate-team-agent',
    (_event, projectPath: string, model: SupportedModelId, rawInput: TeammateAgentGenerationInput) =>
      Effect.gen(function* () {
        const normalizedProjectPath = yield* validateRequiredProjectPath(projectPath)
        const generationInput = decodeUnknownOrThrow(teamAgentGenerationInputSchema, rawInput)

        return yield* generateTeamAgent({
          projectPath: normalizedProjectPath,
          model,
          generationInput,
        })
      }),
  )
}

function handleSendTeamMessage(
  sessionId: SessionId,
  payload: AgentSendPayload,
  model: SupportedModelId,
  teammate: TeammateDefinition,
) {
  return Effect.gen(function* () {
    const validatedPayload = decodeUnknownOrThrow(agentSendPayloadSchema, payload)
    cancelExistingTeamWork(sessionId)

    const abortController = new AbortController()
    const runId = `team-${sessionId}`
    activeTeamRuns.register(sessionId, abortController, { model })

    startStreamBuffer(sessionId, model, 'team')

    yield* Effect.ensuring(
      runRegisteredTeamMessage(
        sessionId,
        runId,
        validatedPayload,
        model,
        teammate,
        abortController,
      ),
      Effect.sync(() => {
        if (activeTeamRuns.deleteIfCurrent(sessionId, abortController)) {
          finishTeamRun(sessionId)
        }
      }),
    )
  })
}

function runRegisteredTeamMessage(
  sessionId: SessionId,
  runId: string,
  payload: AgentSendPayload,
  model: SupportedModelId,
  teammate: TeammateDefinition,
  abortController: AbortController,
) {
  return Effect.gen(function* () {
    emitTransportEvent(sessionId, { type: 'agent_start', timestamp: Date.now(), runId, model })

    const result = yield* executeTeamRun({
      sessionId,
      runId,
      payload,
      model,
      teammate,
      signal: abortController.signal,
      onEvent: (event) => emitTransportEvent(sessionId, event),
      onTitleAssigned: (title) => {
        broadcastToWindows('sessions:title-updated', { sessionId, title })
      },
    })

    handleTeamResult(sessionId, runId, result)
  })
}

function cancelExistingTeamWork(sessionId: SessionId) {
  if (!cancelSessionRuns(sessionId)) return
  clearAgentPhase(sessionId)
  clearStreamBuffer(sessionId)
}

function handleTeamResult(sessionId: SessionId, runId: string, result: TeamRunResult) {
  matchBy(result, 'outcome')
    .with('success', () => emitTeamEnd(sessionId, runId, 'stop'))
    .with('aborted', () => emitTeamEnd(sessionId, runId, 'aborted'))
    .with('invalid-model', 'not-found', (value) =>
      emitErrorAndFinish(sessionId, value.message, value.code, runId),
    )
    .with('error', (value) => {
      if (value.transportEmitted) {
        return
      }
      const classified = classifyAgentError(new Error(value.message))
      emitErrorAndFinish(sessionId, classified.userMessage, classified.code, runId)
    })
    .exhaustive()
}

function emitTeamEnd(sessionId: SessionId, runId: string, reason: 'aborted' | 'stop') {
  emitTransportEvent(sessionId, { type: 'agent_end', timestamp: Date.now(), runId, reason })
}

function finishTeamRun(sessionId: SessionId) {
  clearAgentPhase(sessionId)
  clearStreamBuffer(sessionId)
  emitRunCompleted(sessionId)
}
