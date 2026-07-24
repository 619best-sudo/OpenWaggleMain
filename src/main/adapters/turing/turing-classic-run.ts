import { randomUUID } from 'node:crypto'
import type { Message } from '@shared/types/agent'
import type { AgentTransportEvent } from '@shared/types/stream'
import {
  PERSISTED_PHASE_TRANSCRIPT_CUSTOM_TYPE,
  type PersistedPhaseTranscript,
  type PersistedPhaseTranscriptPhase,
} from '@shared/types/phase'
import { getAgentPhaseTitle } from '@shared/types/phase-titles'
import { TURING_BRIDGE_STATUS_CUSTOM_TYPE } from '@shared/types/structural-nodes'
import type { JsonObject, JsonValue } from '@shared/types/json'
import type { ToolPermissionMode } from '@shared/types/settings'
import type { PendingUserQuestionRequest } from '@shared/types/user-question'
import {
  type PendingToolPermissionRequest,
} from '@shared/types/tool-permission'
import type { ProjectedSessionNodeInput } from '../../ports/session-repository'
import { HarnessAgent, type HarnessAgentState, type Message as TuringMessage } from 'turing-harness'
import { env } from '../../env'
import type { AgentKernelRunInput, AgentKernelRunResult } from '../../ports/agent-kernel-service'
import { beginToolPermissionRequest, beginUserQuestionRequest } from '../../ipc/active-agent-runs'
import {
  attachOpenWaggleRuntime,
  buildOpenWaggleRuntimeDebugValue,
  buildOpenWaggleRuntimePrompt,
} from './turing-openwaggle-bridge'
import { createTuringEventMapper } from './turing-event-mapper'
import { resolveTuringLlmConfig } from './turing-llm-config'
import {
  buildCustomSessionNode,
  reparentProjectedNodesToTail,
  buildSessionSnapshotFromTimeline,
  buildTuringRunNewMessages,
  turingAppendedToProjectedMessages,
} from './turing-message-projection'
import {
  checkoutWarmProjectSession,
  getSharedMcpPool
} from './turing-memory-prewarm'
import {
  buildThreadSnapshotNode,
  createThreadSnapshotAgentHost,
  extractPersistedThreadSnapshot,
} from './turing-thread-snapshot'
import {
  phaseResultToStatus,
  resolveAgentEndReason,
  resolveTerminalError,
} from './turing-run-classification'

/**
 * The 4P execution mode used for a classic (single-agent) run.
 *
 * turing-harness's native operation is the full Prepare→Plan→Perform→Perfect
 * chain, but a chat turn can also be run as a single phase. Controlled by
 * `OPENWAGGLE_TURING_MODE` (`chain` | `prepare` | `plan` | `perform` | `perfect`),
 * defaulting to the full chain.
 */
function resolveRunMode() {
  return env.OPENWAGGLE_TURING_MODE ?? 'chain'
}

function resolveProjectPath(session: AgentKernelRunInput['session']) {
  const projectPath = session.projectPath
  if (!projectPath) {
    throw new Error('No project path set on the session - cannot run turing-harness agent')
  }
  return projectPath
}

function mapToolPermissionMode(mode: ToolPermissionMode): 'ask-all' | 'ask-mutations' | 'bypass' {
  switch (mode) {
    case 'allow-all':
      return 'bypass'
    case 'ask-edit':
      return 'ask-mutations'
    case 'ask':
    default:
      return 'ask-all'
  }
}

function toJsonObject(value: unknown): Readonly<JsonObject> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {}
}

function buildToolPermissionSummary(request: PendingToolPermissionRequest) {
  return request.description ?? `Permission required to run \`${request.toolName}\`.`
}

export function resolveSnapshotActiveNodeId(
  baseActiveNodeId: string | null,
  reparentedTranscriptNodes: readonly ProjectedSessionNodeInput[],
) {
  return reparentedTranscriptNodes[reparentedTranscriptNodes.length - 1]?.id ?? baseActiveNodeId
}

/**
 * Custom event name for in-flight `ask_user_question` requests emitted by the
 * harness callback. The renderer listens for this, renders the
 * `UserQuestionCard`, and submits the answer via `agent:resolve-user-question`
 * (which the main process routes back to the in-flight tool via
 * `resolvePendingUserQuestion`).
 */
const USER_QUESTION_REQUEST_EVENT = 'openwaggle:user-question:request'
const USER_QUESTION_RESOLVED_EVENT = 'openwaggle:user-question:resolved'
const TOOL_PERMISSION_REQUEST_EVENT = 'openwaggle:tool-permission:request'
const TOOL_PERMISSION_RESOLVED_EVENT = 'openwaggle:tool-permission:resolved'

function emitCustomEvent(
  onEvent: (event: AgentTransportEvent) => void,
  model: string,
  name: string,
  value: JsonValue,
) {
  onEvent({
    type: 'custom',
    name,
    value,
    timestamp: Date.now(),
    model,
  })
}

function turingStopReasonToAgentEndReason(messages: readonly TuringMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === 'assistant') {
      return message.stopReason
    }
  }
  return null
}

function firstNonEmpty(values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return undefined
}

function stripVerdictOnlyPrefix(summary: string | undefined) {
  const trimmed = summary?.trim()
  if (!trimmed) return undefined
  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length <= 1) return trimmed
  if (!/^VERDICT:\s*(PASS|FAIL)\b/i.test(lines[0] ?? '')) return trimmed
  const remainder = lines.slice(1).join('\n').trim()
  return remainder || trimmed
}

function resolvePersistedPhaseSummary(
  phase: PersistedPhaseTranscriptPhase['id'],
  result: NonNullable<
    NonNullable<HarnessAgentState['lastPhaseResults']>[keyof NonNullable<HarnessAgentState['lastPhaseResults']>]
  >,
) {
  // `uiSummary` is the harness's styled, user-facing short status (it replaced
  // the old `CHAT SUMMARY` / `artifacts.chatSummary`). Prefer it for the chip.
  const uiSummary = typeof result.uiSummary === 'string' ? result.uiSummary : undefined
  const artifactChatSummary =
    typeof result.artifacts?.chatSummary === 'string' ? result.artifacts.chatSummary : undefined
  const artifactSummary =
    typeof result.artifacts?.summary === 'string' ? result.artifacts.summary : undefined
  const artifactFix =
    typeof result.artifacts?.fix === 'string' ? result.artifacts.fix : undefined
  const displaySummary = result.display?.summary?.trim()
  if (uiSummary?.trim()) return uiSummary.trim()
  if (displaySummary) return displaySummary
  if (phase !== 'perfect') {
    return firstNonEmpty([artifactChatSummary, artifactSummary, result.summary])
  }
  return firstNonEmpty([
    artifactChatSummary,
    stripVerdictOnlyPrefix(artifactSummary),
    stripVerdictOnlyPrefix(result.summary),
    artifactFix,
    result.summary,
  ])
}

function buildRunResult(input: {
  readonly runInput: AgentKernelRunInput
  readonly sessionId: string
  readonly appended: readonly TuringMessage[]
  readonly bridgeDebugValue: ReturnType<typeof buildOpenWaggleRuntimeDebugValue>
  readonly bridgeDebugTimestamp: number
  readonly aborted: boolean
  readonly terminalError?: string
  readonly pendingUserQuestion?: import('@shared/types/user-question').PendingUserQuestionRequest
  readonly phaseTranscriptNode?: ProjectedSessionNodeInput
  readonly threadSnapshotNode?: ProjectedSessionNodeInput
}) {
  const hidden = input.runInput.promptDelivery?.mode === 'hidden-custom-message'
  const appendedMessages = turingAppendedToProjectedMessages(input.appended)
  const newMessages: Message[] = hidden
    ? appendedMessages
    : buildTuringRunNewMessages(input.runInput.payload, input.appended)
  const bridgeDebugNode = buildCustomSessionNode({
    customType: TURING_BRIDGE_STATUS_CUSTOM_TYPE,
    data: input.bridgeDebugValue,
    timestampMs: input.bridgeDebugTimestamp,
  })

  // The snapshot must carry the WHOLE conversation (prior turns + this run's new
  // messages), because persistSnapshot replaces the entire node tree. Reusing the
  // messages' own ids keeps node identity stable across runs.
  const snapshotTimeline = [
    ...input.runInput.session.messages.map((message) => ({
      type: 'message' as const,
      message,
    })),
    ...(!hidden && newMessages[0]
      ? [{ type: 'message' as const, message: newMessages[0] }]
      : []),
    { type: 'node' as const, node: bridgeDebugNode },
    ...appendedMessages.map((message) => ({
      type: 'message' as const,
      message,
    })),
  ]

  const baseSnapshot = buildSessionSnapshotFromTimeline(snapshotTimeline)
  const transcriptNodes = input.runInput.persistedTranscriptNodes ?? []
  const reparentedTranscriptNodes = reparentProjectedNodesToTail(
    [
      ...transcriptNodes,
      ...(input.phaseTranscriptNode ? [input.phaseTranscriptNode] : []),
      ...(input.threadSnapshotNode ? [input.threadSnapshotNode] : []),
    ],
    baseSnapshot.activeNodeId,
    baseSnapshot.nodes.length,
  )
  const snapshotActiveNodeId = resolveSnapshotActiveNodeId(
    baseSnapshot.activeNodeId,
    reparentedTranscriptNodes,
  )

  // #region debug-point C:snapshot-assembly
  void fetch('http://127.0.0.1:7777/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'phase-flow-missing',
      runId: 'pre-fix',
      hypothesisId: 'C',
      location: 'turing-classic-run.ts:buildRunResult',
      msg: '[DEBUG] Built Turing session snapshot',
      data: {
        hidden,
        priorMessageCount: input.runInput.session.messages.length,
        appendedAssistantMessageCount: appendedMessages.length,
        baseSnapshotNodeCount: baseSnapshot.nodes.length,
        baseActiveNodeId: baseSnapshot.activeNodeId,
        transcriptNodeCount: transcriptNodes.length,
        appendedTranscriptNodeIds: reparentedTranscriptNodes.map((node) => node.id),
        phaseTranscriptNodeId: input.phaseTranscriptNode?.id ?? null,
        threadSnapshotNodeId: input.threadSnapshotNode?.id ?? null,
        returnedActiveNodeId: snapshotActiveNodeId,
      },
      ts: Date.now(),
    }),
  }).catch(() => {})
  // #endregion

  return {
    newMessages,
    piSessionId: input.sessionId,
    sessionSnapshot: {
      nodes: [...baseSnapshot.nodes, ...reparentedTranscriptNodes],
      activeNodeId: snapshotActiveNodeId,
    },
    ...(input.aborted ? { aborted: true } : {}),
    ...(input.terminalError ? { terminalError: input.terminalError } : {}),
    ...(input.pendingUserQuestion ? { pendingUserQuestion: input.pendingUserQuestion } : {}),
  }
}

function buildToolNameLookup(messages: readonly TuringMessage[]) {
  const lookup = new Map<string, string>()
  for (const message of messages) {
    if (message.role === 'assistant') {
      for (const block of message.content) {
        if (block.type === 'toolCall') {
          lookup.set(block.id, block.name)
        }
      }
      continue
    }
    if (message.role === 'toolResult') {
      lookup.set(message.toolCallId, message.toolName)
    }
  }
  return lookup
}

function shouldPersistPhaseResult(
  result: NonNullable<
    NonNullable<HarnessAgentState['lastPhaseResults']>[keyof NonNullable<HarnessAgentState['lastPhaseResults']>]
  >,
) {
  return Boolean(
    result.display ||
      result.pendingUserQuestion ||
      resolvePersistedPhaseSummary(result.phase, result) ||
      result.artifacts?.planJson !== undefined ||
      result.planSet !== undefined ||
      result.qaPlan !== undefined ||
      result.display?.toolCallIds?.length,
  )
}

export function buildPhaseTranscriptNode(
  phaseResults: HarnessAgentState['lastPhaseResults'],
  messages: readonly TuringMessage[],
  timestampMs: number,
) {
  if (!phaseResults) return undefined
  const toolNameLookup = buildToolNameLookup(messages)
  const order = ['prepare', 'plan', 'perform', 'perfect'] as const
  const phases: PersistedPhaseTranscriptPhase[] = []
  for (const phaseId of order) {
    const result = phaseResults[phaseId]
    if (!result || !shouldPersistPhaseResult(result)) continue
    const summary = resolvePersistedPhaseSummary(result.phase, result)
    phases.push({
        id: result.phase,
        label: getAgentPhaseTitle(result.phase),
        activityText:
          result.phase === 'prepare'
            ? 'Analyzing project scope and dependencies'
            : result.phase === 'plan'
              ? 'Drafting execution strategy'
              : result.phase === 'perform'
                ? 'Applying code modifications'
                : 'Verifying application state',
        status: phaseResultToStatus(result),
        elapsedMs: 0,
        ...(summary ? { summary } : {}),
        ...(result.artifacts?.planJson !== undefined
          ? { planJson: result.artifacts.planJson as JsonValue }
          : {}),
        ...(result.planSet !== undefined ? { planSet: result.planSet as unknown as JsonValue } : {}),
        ...(result.qaPlan !== undefined ? { qaPlan: result.qaPlan as unknown as JsonValue } : {}),
        ...(result.pendingUserQuestion ? { pendingUserQuestion: result.pendingUserQuestion } : {}),
        tools: (result.display?.toolCallIds ?? []).map((toolCallId: string) => ({
          toolCallId,
          toolName: toolNameLookup.get(toolCallId) ?? toolCallId,
          status: 'completed' as const,
        })),
      } satisfies PersistedPhaseTranscriptPhase)
  }

  if (phases.length === 0) return undefined
  const transcript: PersistedPhaseTranscript = {
    version: 1,
    phases,
  }
  return buildCustomSessionNode({
    customType: PERSISTED_PHASE_TRANSCRIPT_CUSTOM_TYPE,
    data: transcript as unknown as JsonValue,
    timestampMs,
  })
}

function buildThreadSnapshotPersistedNode(
  snapshot: HarnessAgentState['lastThreadSnapshot'],
  timestampMs: number,
) {
  if (!snapshot) return undefined
  return buildThreadSnapshotNode(snapshot, timestampMs)
}

export async function runTuringSession(input: AgentKernelRunInput): Promise<AgentKernelRunResult> {
  const projectPath = resolveProjectPath(input.session)
  const llmConfig = resolveTuringLlmConfig(input.model)
  const sessionId = input.session.piSessionId ?? randomUUID()
  // Pass the runtime so the prewarm path can attach MCP clients + skill
  // providers ahead of time; on a hit, `attachOpenWaggleRuntime` below hits
  // the WeakMap fast-path and returns in microseconds.
  const warmProject = await checkoutWarmProjectSession(sessionId, projectPath, {
    modelRef: input.model,
    mcpSettings: input.mcpSettings,
    standardsContext: input.standardsContext,
  })
  const runMode = resolveRunMode()
  const turingSession = warmProject.session
  const persistedThreadSnapshot = extractPersistedThreadSnapshot(input.persistedTranscriptNodes)
  const mcpPool = getSharedMcpPool(projectPath)
  const bridge = await attachOpenWaggleRuntime(turingSession, {
    mcpSettings: input.mcpSettings,
    standardsContext: input.standardsContext,
  }, {
    projectPath,
    mcpPool,
  })
  const agentHost = createThreadSnapshotAgentHost(turingSession, persistedThreadSnapshot)
  const agent: HarnessAgent = new HarnessAgent(agentHost, {
    model: llmConfig.modelSlug,
    thinkingLevel: input.payload.thinkingLevel,
    mode: runMode,
    transcriptMode: 'compact',
  })
  agent.setPhaseModel('prepare', llmConfig.modelSlug)
  agent.setPhaseModel('plan', llmConfig.modelSlug)
  agent.setPhaseModel('perform', llmConfig.modelSlug)
  agent.setPhaseModel('perfect', llmConfig.modelSlug)
  const runtimePrompt = buildOpenWaggleRuntimePrompt(input.payload.text, {
    standardsContext: input.standardsContext,
    bridge,
    pendingUserQuestionResolution: input.pendingUserQuestionResolution,
  })

  const onEvent = (event: AgentTransportEvent) => input.onEvent(event)
  // #region debug-point T:permission-mode
  void fetch('http://127.0.0.1:7777/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'permission-flow',
      runId: 'pre-fix',
      hypothesisId: '1',
      location: 'turing-classic-run.ts:runTuringSession',
      msg: '[DEBUG] Turing session received permission mode',
      data: {
        sessionId: String(input.session.id),
        model: input.model,
        toolPermissionMode: input.toolPermissionMode ?? null,
        mappedPermissionMode: mapToolPermissionMode(input.toolPermissionMode ?? 'ask'),
      },
      ts: Date.now(),
    }),
  }).catch(() => {})
  // #endregion
  turingSession.setPermissionMode(mapToolPermissionMode(input.toolPermissionMode ?? 'ask'))
  turingSession.setPermissionCallback(
    input.toolPermissionMode === 'allow-all'
      ? undefined
      : async (request) => {
          if (request.kind !== 'tool') {
            return { allowed: true }
          }

          const pendingRequest: PendingToolPermissionRequest = {
            toolCallId: `turing-permission-${randomUUID()}`,
            toolName: request.name,
            input: toJsonObject(request.args),
            description: request.mutates
              ? 'This action may modify files, state, or external systems.'
              : 'This action needs approval before it can continue.',
            // Complexity now flows from the harness (Prepare per-file / Plan
            // per-task ratings inherited down the chain). Surface it so the UI can
            // show how heavy this call is and where the rating came from.
            ...(typeof request.complexity?.score === 'number'
              ? { complexityScore: request.complexity.score }
              : {}),
            ...(request.complexityRating ? { complexityRating: request.complexityRating } : {}),
            ...(request.complexitySource ? { complexitySource: request.complexitySource } : {}),
            ...(request.options?.length
              ? { options: request.options.map((o) => ({ id: o.id, label: o.label, allow: o.allow })) }
              : {}),
            summary: '',
          }
          const summary = buildToolPermissionSummary(pendingRequest)
          const requestForUi: PendingToolPermissionRequest = {
            ...pendingRequest,
            summary,
          }

          // #region debug-point T:permission-request
          void fetch('http://127.0.0.1:7777/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: 'permission-flow',
              runId: 'pre-fix',
              hypothesisId: '2',
              location: 'turing-classic-run.ts:permissionCallback',
              msg: '[DEBUG] Turing emitted tool permission request',
              data: {
                sessionId: String(input.session.id),
                toolCallId: requestForUi.toolCallId,
                toolName: requestForUi.toolName,
                mutates: request.mutates,
                optionCount: request.options?.length ?? 0,
              },
              ts: Date.now(),
            }),
          }).catch(() => {})
          // #endregion
          emitCustomEvent(
            onEvent,
            input.model,
            TOOL_PERMISSION_REQUEST_EVENT,
            requestForUi as unknown as JsonValue,
          )

          try {
            const resolution = await beginToolPermissionRequest(
              input.session.id,
              requestForUi,
              input.signal,
            )

            emitCustomEvent(onEvent, input.model, TOOL_PERMISSION_RESOLVED_EVENT, {
              toolCallId: requestForUi.toolCallId,
              decision: resolution.decision,
            })

            return {
              allowed: resolution.decision === 'approved',
              ...(resolution.decision === 'approved' && resolution.request.model
                ? { model: resolution.request.model }
                : {}),
              ...(resolution.decision === 'approved' && resolution.request.option
                ? { option: resolution.request.option }
                : {}),
            }
          } catch (error) {
            emitCustomEvent(onEvent, input.model, TOOL_PERMISSION_RESOLVED_EVENT, {
              toolCallId: requestForUi.toolCallId,
              decision: 'denied',
            })
            throw error
          }
        },
  )

  // Install the `ask_user_question` callback on the session. The harness's
  // built-in `ask_user_question` tool will await this when the LLM needs a
  // clarification, so the LLM continues in the SAME conversation context with
  // the user's answer as the tool result. No new run is required, so all prior
  // tool calls, file changes, and assistant messages are preserved.
  turingSession.setAskUserQuestionCallback(
    async (questionRequest) => {
      emitCustomEvent(
        onEvent,
        input.model,
        USER_QUESTION_REQUEST_EVENT,
        questionRequest as unknown as JsonValue,
      )

      try {
        const resolution = await beginUserQuestionRequest(
          input.session.id,
          questionRequest,
          input.signal,
        )
        emitCustomEvent(
          onEvent,
          input.model,
          USER_QUESTION_RESOLVED_EVENT,
          {
            phase: resolution.request.phase,
            question: resolution.request.question,
            answer: resolution.answer,
          } as unknown as JsonValue,
        )
        return resolution.answer
      } catch (error) {
        emitCustomEvent(
          onEvent,
          input.model,
          USER_QUESTION_RESOLVED_EVENT,
          {
            phase: questionRequest.phase,
            question: questionRequest.question,
            aborted: true,
          } as unknown as JsonValue,
        )
        throw error
      }
    },
  )
  const mapEvent = createTuringEventMapper({
    runId: input.runId,
    model: input.model,
    emit: onEvent,
  })
  const unsubscribe = agent.subscribe(mapEvent)

  const abortListener = () => agent.abort()
  if (input.signal.aborted) {
    agent.abort()
  } else {
    input.signal.addEventListener('abort', abortListener, { once: true })
  }

  onEvent({
    type: 'agent_start',
    runId: input.runId,
    timestamp: Date.now(),
    model: input.model,
  })
  const bridgeDebugTimestamp = Date.now()
  const bridgeDebugValue = buildOpenWaggleRuntimeDebugValue(turingSession, {
    mcpSettings: input.mcpSettings,
    standardsContext: input.standardsContext,
    bridge,
  })
  onEvent({
    type: 'custom',
    name: 'turing_bridge_status',
    value: bridgeDebugValue,
    timestamp: bridgeDebugTimestamp,
    model: input.model,
  })

  let terminalError: string | undefined
  try {
    await agent.prompt(runtimePrompt)
    terminalError = agent.state.error
  } catch (error) {
    terminalError = error instanceof Error ? error.message : String(error)
  } finally {
    input.signal.removeEventListener('abort', abortListener)
    unsubscribe()
    agent.dispose()
  }

  const appended: readonly TuringMessage[] = agent.state.messages
  const phaseTranscriptNode = buildPhaseTranscriptNode(
    agent.state.lastPhaseResults,
    appended,
    Date.now(),
  )
  const threadSnapshotNode = buildThreadSnapshotPersistedNode(
    agent.state.lastThreadSnapshot,
    Date.now(),
  )
  const stopReason = turingStopReasonToAgentEndReason(appended)
  const aborted = input.signal.aborted || stopReason === 'aborted'
  terminalError = resolveTerminalError({
    terminalError,
    agentState: agent.state,
  })
  const reason = resolveAgentEndReason({
    aborted,
    stopReason,
    terminalError,
    agentState: agent.state,
  })

  onEvent({
    type: 'agent_end',
    runId: input.runId,
    reason,
    ...(terminalError && !aborted ? { error: { message: terminalError } } : {}),
    timestamp: Date.now(),
    model: input.model,
  })

  return buildRunResult({
    runInput: input,
    sessionId,
    appended,
    bridgeDebugValue,
    bridgeDebugTimestamp,
    aborted,
    ...(agent.state.pendingUserQuestion
      ? { pendingUserQuestion: agent.state.pendingUserQuestion }
      : {}),
    ...(phaseTranscriptNode
      ? {
          phaseTranscriptNode: {
            id: phaseTranscriptNode.id,
            parentId: null,
            piEntryType: phaseTranscriptNode.piEntryType,
            kind: phaseTranscriptNode.kind,
            role: phaseTranscriptNode.role,
            timestampMs: phaseTranscriptNode.timestampMs,
            contentJson: phaseTranscriptNode.contentJson,
            metadataJson: phaseTranscriptNode.metadataJson,
            pathDepth: 0,
            createdOrder: 0,
          } satisfies ProjectedSessionNodeInput,
        }
      : {}),
    ...(threadSnapshotNode
      ? {
          threadSnapshotNode: {
            id: threadSnapshotNode.id,
            parentId: null,
            piEntryType: threadSnapshotNode.piEntryType,
            kind: threadSnapshotNode.kind,
            role: threadSnapshotNode.role,
            timestampMs: threadSnapshotNode.timestampMs,
            contentJson: threadSnapshotNode.contentJson,
            metadataJson: threadSnapshotNode.metadataJson,
            pathDepth: 0,
            createdOrder: 0,
          } satisfies ProjectedSessionNodeInput,
        }
      : {}),
    ...(terminalError && !aborted ? { terminalError } : {}),
  })
}
