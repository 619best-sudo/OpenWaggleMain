import { matchBy } from '@diegogbrisa/ts-match'
import { decodeUnknownOrThrow } from '@shared/schema'
import { agentSendPayloadSchema } from '@shared/schemas/validation'
import type { AgentSendPayload } from '@shared/types/agent'
import type { SessionId, SupportedModelId } from '@shared/types/brand'
import * as Effect from 'effect/Effect'
import { classifyAgentError } from '../agent/error-classifier'
import {
  discardMachinePlan,
  executeApprovedMachinePlan,
  executeMachineRun,
  readPersistedMachinePlanModel,
  type MachineRunResult,
} from '../application/machine-run-service'
import { SessionRepository } from '../ports/session-repository'
import { broadcastToWindows } from '../utils/broadcast'
import {
  clearAgentPhase,
  clearStreamBuffer,
  emitRunCompleted,
  emitTransportEvent,
  startStreamBuffer,
} from '../utils/stream-bridge'
import { activeMachineRuns, cancelSessionRuns } from './active-agent-runs'
import { emitErrorAndFinish } from './run-handler-utils'
import { typedHandle, typedOn } from './typed-ipc'

export function registerMachineHandlers() {
  registerSendMachineMessageHandler()
  registerApproveMachinePlanHandler()
  registerDiscardMachinePlanHandler()
  registerCancelMachineHandler()
}

function registerSendMachineMessageHandler() {
  typedHandle(
    'agent:send-machine-message',
    (_event, sessionId: SessionId, payload: AgentSendPayload, model: SupportedModelId) =>
      handleSendMachineMessage(sessionId, payload, model),
  )
}

function registerCancelMachineHandler() {
  typedOn('agent:cancel-machine', (_event, sessionId: SessionId) =>
    Effect.sync(() => {
      const cancelled = activeMachineRuns.cancel(sessionId)
      if (cancelled) finishMachineRun(sessionId)
    }),
  )
}

function registerApproveMachinePlanHandler() {
  typedHandle('agent:approve-machine-plan', (_event, sessionId: SessionId) =>
    handleApproveMachinePlan(sessionId),
  )
}

function registerDiscardMachinePlanHandler() {
  typedHandle('agent:discard-machine-plan', (_event, sessionId: SessionId) =>
    handleDiscardMachinePlan(sessionId),
  )
}

function handleSendMachineMessage(
  sessionId: SessionId,
  payload: AgentSendPayload,
  model: SupportedModelId,
) {
  return Effect.gen(function* () {
    const validatedPayload = decodeUnknownOrThrow(agentSendPayloadSchema, payload)
    cancelExistingMachineWork(sessionId)

    const abortController = new AbortController()
    const runId = `machine-${sessionId}`
    activeMachineRuns.register(sessionId, abortController, { model })
    startStreamBuffer(sessionId, model, 'machine')

    emitTransportEvent(sessionId, {
      type: 'custom',
      name: 'machine:run-start',
      value: { sessionId: String(sessionId) },
      timestamp: Date.now(),
      model,
    })

    yield* Effect.ensuring(
      runRegisteredMachineMessage(sessionId, runId, validatedPayload, model, abortController),
      Effect.sync(() => {
        if (activeMachineRuns.deleteIfCurrent(sessionId, abortController)) finishMachineRun(sessionId)
      }),
    )
  })
}

function handleApproveMachinePlan(sessionId: SessionId) {
  return Effect.gen(function* () {
    cancelExistingMachineWork(sessionId)

    const sessionRepo = yield* SessionRepository
    const workspace = yield* sessionRepo.getWorkspace(sessionId)
    const machinePlanModel = workspace?.activeBranchState?.uiStateJson
      ? readPersistedMachinePlanModel(workspace.activeBranchState.uiStateJson)
      : null
    if (!machinePlanModel) {
      return yield* Effect.fail(new Error('No machine plan is awaiting approval for this session.'))
    }

    const abortController = new AbortController()
    const runId = `machine-${sessionId}:approved`
    activeMachineRuns.register(sessionId, abortController, { model: machinePlanModel })
    startStreamBuffer(sessionId, machinePlanModel, 'machine')

    emitTransportEvent(sessionId, {
      type: 'custom',
      name: 'machine:run-start',
      value: { sessionId: String(sessionId) },
      timestamp: Date.now(),
      model: machinePlanModel,
    })

    yield* Effect.ensuring(
      runApprovedMachinePlan(sessionId, runId, machinePlanModel, abortController),
      Effect.sync(() => {
        if (activeMachineRuns.deleteIfCurrent(sessionId, abortController)) finishMachineRun(sessionId)
      }),
    )
  })
}

function handleDiscardMachinePlan(sessionId: SessionId) {
  return Effect.gen(function* () {
    yield* discardMachinePlan(sessionId)
    emitTransportEvent(sessionId, {
      type: 'custom',
      name: 'machine:plan-discarded',
      value: { sessionId: String(sessionId) },
      timestamp: Date.now(),
    })
  })
}

function runRegisteredMachineMessage(
  sessionId: SessionId,
  runId: string,
  payload: AgentSendPayload,
  model: SupportedModelId,
  abortController: AbortController,
) {
  return Effect.gen(function* () {
    emitTransportEvent(sessionId, { type: 'agent_start', timestamp: Date.now(), runId, model })

    const result = yield* executeMachineRun({
      sessionId,
      runId,
      payload,
      model,
      signal: abortController.signal,
      onEvent: (event) => emitTransportEvent(sessionId, event),
      onTitleAssigned: (title) => {
        broadcastToWindows('sessions:title-updated', { sessionId, title })
      },
    })

    handleMachineResult(sessionId, runId, result)
  })
}

function runApprovedMachinePlan(
  sessionId: SessionId,
  runId: string,
  model: SupportedModelId,
  abortController: AbortController,
) {
  return Effect.gen(function* () {
    emitTransportEvent(sessionId, { type: 'agent_start', timestamp: Date.now(), runId, model })

    const result = yield* executeApprovedMachinePlan({
      sessionId,
      runId,
      signal: abortController.signal,
      onEvent: (event) => emitTransportEvent(sessionId, event),
      onTitleAssigned: (title) => {
        broadcastToWindows('sessions:title-updated', { sessionId, title })
      },
    })

    handleMachineResult(sessionId, runId, result)
  })
}

function cancelExistingMachineWork(sessionId: SessionId) {
  if (!cancelSessionRuns(sessionId)) return
  clearAgentPhase(sessionId)
  clearStreamBuffer(sessionId)
}

function handleMachineResult(sessionId: SessionId, runId: string, result: MachineRunResult) {
  matchBy(result, 'outcome')
    .with('success', () => emitMachineEnd(sessionId, runId, 'stop'))
    .with('aborted', () => emitMachineEnd(sessionId, runId, 'aborted'))
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

function emitMachineEnd(sessionId: SessionId, runId: string, reason: 'aborted' | 'stop') {
  emitTransportEvent(sessionId, { type: 'agent_end', timestamp: Date.now(), runId, reason })
}

function finishMachineRun(sessionId: SessionId) {
  emitTransportEvent(sessionId, {
    type: 'custom',
    name: 'machine:run-end',
    value: { sessionId: String(sessionId) },
    timestamp: Date.now(),
  })
  clearAgentPhase(sessionId)
  clearStreamBuffer(sessionId)
  emitRunCompleted(sessionId)
}
