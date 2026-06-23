import { randomUUID } from 'node:crypto'
import type { AgentSession } from '@mariozechner/pi-coding-agent'
import { createPiWaggleExtension } from '@openwaggle/pi-waggle/loop'
import { appendPiWaggleModeState, enabledPiWaggleModeState } from '@openwaggle/pi-waggle/mode-state'
import {
  createPiWaggleStopPolicyState,
  evaluatePiWaggleStopPolicy,
  summarizePiWaggleTurnMessages,
} from '@openwaggle/pi-waggle/stop-policy'
import { SupportedModelId } from '@shared/types/brand'
import type { AgentTransportEvent } from '@shared/types/stream'
import type { WaggleStreamMetadata } from '@shared/types/waggle'
import type {
  AgentKernelRunInput,
  AgentKernelWaggleRunOptions,
} from '../../../ports/agent-kernel-service'
import type { PiModel } from '../pi-provider-catalog'
import { buildPiRunAssistantMessages } from '../pi-run-result'
import { logger } from './constants'
import { createPiRunSessionRuntime, runSubscribedPiOperation } from './run-lifecycle'
import { createSessionListener } from './session-listener'
import { resolveSessionProjectPath } from './session-manager'
import { createStuckTerminalToolWatchdog } from './stuck-terminal-tool-watchdog'
import { createWaggleArtifactRegistry } from './waggle-artifact-registry'
import { resolveWaggleRuntimeConfig } from './waggle-model-resolution'
import {
  buildWaggleTurnCustomMessage,
  buildWaggleTurnMetadata,
  sendInitialWaggleMessages,
} from './waggle-run-messages'
import {
  appendLoopDirective,
  buildWaggleTurnCompactionInstructions,
  collectToolExecutionHandoff,
  collectResponseDirectiveHandoff,
  createWaggleTurnHandoffDraft,
  finalizeWaggleTurnHandoff,
  readKeepOrRevertDecision,
  type WaggleTurnHandoff,
  type WaggleTurnHandoffDraft,
} from './waggle-turn-handoff'
import { createWaggleTurnRollbackTracker } from './waggle-turn-rollback'

type PiWaggleKernelRunInput = AgentKernelRunInput & {
  readonly waggle: AgentKernelWaggleRunOptions
}

function appendEnabledWaggleModeState(input: {
  readonly session: AgentSession
  readonly runInput: PiWaggleKernelRunInput
}) {
  appendPiWaggleModeState(
    input.session.sessionManager,
    enabledPiWaggleModeState({ config: input.runInput.waggle.config }),
  )
}

function withTransportEventModel(
  event: AgentTransportEvent,
  meta: WaggleStreamMetadata,
): AgentTransportEvent {
  return { ...event, model: meta.agentModel }
}

function extractFilePath(input: unknown) {
  if (input == null || typeof input !== 'object') return ''
  const path = 'path' in input ? input.path : 'filePath' in input ? input.filePath : ''
  return typeof path === 'string' ? path : ''
}

function emitWaggleTurnStart(input: PiWaggleKernelRunInput, meta: WaggleStreamMetadata) {
  input.waggle.onTurnEvent({
    type: 'turn-start',
    turnNumber: meta.turnNumber,
    agentIndex: meta.agentIndex,
    agentLabel: meta.agentLabel,
  })
}

function emitWaggleTurnEnd(input: PiWaggleKernelRunInput, meta: WaggleStreamMetadata) {
  input.waggle.onTurnEvent({
    type: 'turn-end',
    turnNumber: meta.turnNumber,
    agentIndex: meta.agentIndex,
    agentLabel: meta.agentLabel,
    agentColor: meta.agentColor,
    agentModel: meta.agentModel,
  })
}

async function compactBeforeNextWaggleTurn(input: {
  readonly session: AgentSession | null
  readonly meta: WaggleStreamMetadata
  readonly handoff: WaggleTurnHandoff | null
  readonly responseText: string
}) {
  if (!input.session || input.session.isCompacting) {
    return
  }

  try {
    await input.session.compact(
      buildWaggleTurnCompactionInstructions({
        handoff: input.handoff,
        responseText: input.responseText,
        meta: input.meta,
      }),
    )
  } catch (error) {
    logger.warn('Failed to compact Pi Waggle session before handoff', {
      error: error instanceof Error ? error.message : String(error),
      turnNumber: input.meta.turnNumber,
      agentLabel: input.meta.agentLabel,
    })
  }
}

async function restoreInitialWaggleModel(input: {
  readonly session: AgentSession
  readonly model: PiModel
}) {
  await input.session.setModel(input.model).catch((error) => {
    logger.warn('Failed to restore initial Pi Waggle model', {
      error: error instanceof Error ? error.message : String(error),
    })
  })
}

export async function runPiWaggle(input: PiWaggleKernelRunInput) {
  const projectPath = resolveSessionProjectPath(input.session)
  const waggleSessionId = randomUUID()
  const runtimeConfig = resolveWaggleRuntimeConfig({
    config: input.waggle.config,
    inheritedModel: input.waggle.inheritedModel,
    userPrompt: input.payload.text,
  })
  const initialRuntimeModel = SupportedModelId(runtimeConfig.agents[0].model)
  let policyState = createPiWaggleStopPolicyState()
  let currentMeta = buildWaggleTurnMetadata({
    config: runtimeConfig,
    turnNumber: 0,
    waggleSessionId,
  })
  const artifactRegistry = createWaggleArtifactRegistry(waggleSessionId)
  const rollbackTracker = createWaggleTurnRollbackTracker(projectPath)
  let nextTurnHandoff: WaggleTurnHandoff | null = null
  let activeTurnHandoff: WaggleTurnHandoffDraft = createWaggleTurnHandoffDraft()
  let liveSession: AgentSession | null = null

  const waggleExtension = createPiWaggleExtension<WaggleStreamMetadata>({
    config: runtimeConfig,
    createTurnMetadata: ({ turnNumber }) =>
      buildWaggleTurnMetadata({ config: runtimeConfig, turnNumber, waggleSessionId }),
    onTurnComplete: async ({ meta, messages, turn }) => {
      const summary = summarizePiWaggleTurnMessages(messages)
      const keepOrRevertDecision = readKeepOrRevertDecision(summary.responseText)
      let restoredPaths: string[] = []

      if (keepOrRevertDecision === 'revert' && rollbackTracker.hasPendingRollback()) {
        restoredPaths = await rollbackTracker.rollbackPendingFix()
      } else if (keepOrRevertDecision === 'keep') {
        rollbackTracker.clearPendingRollback()
      }

      collectResponseDirectiveHandoff(activeTurnHandoff, {
        responseText: summary.responseText,
        includeRollbackDirective: restoredPaths.length === 0,
      })
      if (restoredPaths.length > 0) {
        appendLoopDirective(
          activeTurnHandoff,
          `Rollback completed for failed fix files before the next loop: ${restoredPaths.join(', ')}`,
        )
      }
      const completedTurnHandoff = finalizeWaggleTurnHandoff(activeTurnHandoff)
      activeTurnHandoff = createWaggleTurnHandoffDraft()
      rollbackTracker.promoteCurrentTurnEdits()
      const evaluation = evaluatePiWaggleStopPolicy({
        config: runtimeConfig,
        turnNumber: turn.turnNumber,
        summary,
        state: policyState,
        agentLabel: meta.agentLabel,
      })
      policyState = evaluation.state

      if (evaluation.turnSucceeded) {
        if (evaluation.continue && !input.signal.aborted) {
          await compactBeforeNextWaggleTurn({
            session: liveSession,
            meta,
            handoff: completedTurnHandoff,
            responseText: summary.responseText,
          })
        }
        nextTurnHandoff = completedTurnHandoff
        emitWaggleTurnEnd(input, meta)
      } else {
        nextTurnHandoff = null
      }

      if (evaluation.consensus) {
        input.waggle.onTurnEvent({ type: 'consensus-reached', result: evaluation.consensus })
      }

      if (!evaluation.continue) {
        const stopReason =
          evaluation.stop ??
          ({
            classification: 'complete',
            reason: `Reached maximum turns (${String(policyState.successfulTurnCount)})`,
          } as const)

        if (stopReason.classification === 'complete') {
          input.waggle.onTurnEvent({
            type: 'collaboration-complete',
            reason: stopReason.reason,
            totalTurns: policyState.successfulTurnCount,
          })
        } else {
          input.waggle.onTurnEvent({ type: 'collaboration-stopped', reason: stopReason.reason })
        }
      }

      return { continue: evaluation.continue }
    },
    onActiveTurnChange: (meta) => {
      currentMeta = meta
    },
    onTurnStart: (meta) => {
      activeTurnHandoff = createWaggleTurnHandoffDraft()
      rollbackTracker.resetCurrentTurn()
      emitWaggleTurnStart(input, meta)
    },
    canStartNextTurn: () => !input.signal.aborted,
    buildTurnMessage: ({ model: turnModel, meta }) =>
      buildWaggleTurnCustomMessage({
        model: turnModel,
        payload: input.payload,
        config: runtimeConfig,
        meta,
        runId: input.runId,
        handoff: nextTurnHandoff,
      }),
  })

  const { model, session } = await createPiRunSessionRuntime({
    session: input.session,
    projectPath,
    modelReference: initialRuntimeModel,
    payload: input.payload,
    skillToggles: input.skillToggles,
    extensionFactories: [waggleExtension.factory],
  })
  liveSession = session

  const abortWarning = 'Failed to abort Pi Waggle turn cleanly'
  const watchdog = createStuckTerminalToolWatchdog({
    session,
    runId: input.runId,
    emitErrorEvent: (event) => input.waggle.onWaggleEvent(withTransportEventModel(event, currentMeta), currentMeta),
    abortWarning,
  })
  const unsubscribe = session.subscribe(
    createSessionListener(
      {
        ...input,
        model: initialRuntimeModel,
        onEvent: (event) => {
          const transportEvent = withTransportEventModel(event, currentMeta)
          watchdog.observe(transportEvent)
          if (
            transportEvent.type === 'tool_execution_start' &&
            (transportEvent.toolName === 'write' || transportEvent.toolName === 'edit')
          ) {
            const filePath = extractFilePath(transportEvent.args)
            rollbackTracker.capturePreEditSnapshot(filePath)
          }
          if (transportEvent.type === 'tool_execution_end') {
            if (
              !transportEvent.isError &&
              (transportEvent.toolName === 'write' || transportEvent.toolName === 'edit')
            ) {
              const filePath = extractFilePath(transportEvent.args)
              rollbackTracker.recordSuccessfulEdit(filePath)
            }
            const artifacts = collectToolExecutionHandoff(
              activeTurnHandoff,
              artifactRegistry,
              transportEvent,
              currentMeta,
            )
            for (const artifact of artifacts) {
              input.waggle.onTurnEvent({ type: 'artifact-registered', artifact })
            }
          }
          input.waggle.onWaggleEvent(transportEvent, currentMeta)
        },
      },
      input.runId,
    ),
  )

  try {
    return await runSubscribedPiOperation({
      runInput: input,
      session,
      unsubscribe,
      abortWarning,
      preAbortWarning: 'Failed to abort pre-cancelled Pi Waggle turn cleanly',
      operation: () =>
        watchdog.watch(async () => {
          appendEnabledWaggleModeState({ session, runInput: input })
          emitWaggleTurnStart(input, currentMeta)
          try {
            await sendInitialWaggleMessages({
              session,
              model,
              meta: currentMeta,
              payload: input.payload,
              runId: input.runId,
              runtimeConfig,
            })
            await waggleExtension.done
          } finally {
            await restoreInitialWaggleModel({ session, model })
          }
        }),
      buildErrorMessages: buildPiRunAssistantMessages,
    })
  } finally {
    watchdog.stop()
  }
}
