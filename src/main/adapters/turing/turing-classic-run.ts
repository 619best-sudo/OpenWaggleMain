import { randomUUID } from 'node:crypto'
import type { Message } from '@shared/types/agent'
import type { JsonObject, JsonValue } from '@shared/types/json'
import {
  PERSISTED_PHASE_TRANSCRIPT_CUSTOM_TYPE,
  type PersistedPhaseTranscript,
  type PersistedPhaseTranscriptPhase,
} from '@shared/types/phase'
import { getAgentPhaseTitle } from '@shared/types/phase-titles'
import {
  type PendingPlanReviewRequest,
  PLAN_REVIEW_REQUEST_EVENT,
  PLAN_REVIEW_RESOLVED_EVENT,
} from '@shared/types/plan-review'
import type { ToolPermissionMode } from '@shared/types/settings'
import type { AgentTransportEvent } from '@shared/types/stream'
import { TURING_BRIDGE_STATUS_CUSTOM_TYPE } from '@shared/types/structural-nodes'
import type { PendingToolPermissionRequest } from '@shared/types/tool-permission'
import type { PendingUserQuestionRequest } from '@shared/types/user-question'
import {
  HarnessAgent,
  type HarnessAgentState,
  type ThinkingLevel,
  type AskUserQuestionRequest as TuringAskUserQuestionRequest,
  type Message as TuringMessage,
} from 'turing-harness'
import {
  beginPlanReviewRequest,
  beginToolPermissionRequest,
  beginUserQuestionRequest,
} from '../../ipc/active-agent-runs'
import { createLogger } from '../../logger'
import type { AgentKernelRunInput, AgentKernelRunResult } from '../../ports/agent-kernel-service'
import type { ProjectedSessionNodeInput } from '../../ports/session-repository'

const logger = createLogger('turing-classic-run')

import {
  buildAttachmentIntentSection,
  detectAttachmentIntent,
  toTuringAttachments,
} from './turing-attachments'
import {
  isBackendAuthError,
  refreshBackendTokenAfterAuthFailure,
  resolveAuthRecoveryContinuation,
} from './turing-auth-recovery'
import { createTuringEventMapper } from './turing-event-mapper'
import { resolveTuringLlmConfig, toolModelCandidatesFor } from './turing-llm-config'
import { checkoutWarmProjectSession, getSharedMcpPool } from './turing-memory-prewarm'
import {
  buildCustomSessionNode,
  buildSessionSnapshotFromTimeline,
  buildTuringRunNewMessagesFromProjected,
  reparentProjectedNodesToTail,
  turingAppendedToProjectedMessages,
} from './turing-message-projection'
import { routeModel } from './turing-model-routing'
import {
  type BridgeResult,
  buildOpenWaggleRuntimeDebugValue,
  buildOpenWaggleRuntimePrompt,
  connectMcpBackground,
} from './turing-openwaggle-bridge'
import {
  resolveAgentEndReason,
  resolveTerminalError,
  runDispositionToStatus,
} from './turing-run-classification'
import {
  buildThreadSnapshotNode,
  createThreadSnapshotAgentHost,
  extractPersistedThreadSnapshot,
} from './turing-thread-snapshot'
import { auditVisualVerification, describesRuntimeSymptom } from './turing-visual-verification'

/**
 * The 4P execution mode used for a classic (single-agent) run.
 *
 * turing-harness's native operation is the full Prepare→Plan→Perform→Perfect
 * categorizer chain (v2): router → focused categorizer hops → one final summary.
 */
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

function buildRunResult(input: {
  readonly runInput: AgentKernelRunInput
  readonly sessionId: string
  readonly appended: readonly TuringMessage[]
  /**
   * The messageIds the event mapper assigned to each streamed assistant turn, in
   * stream order. The projection reuses them so the persisted snapshot's message
   * ids agree with the live stream — otherwise the renderer can't dedup the
   * streamed messages against the snapshot and every turn renders twice.
   */
  readonly streamedAssistantIds?: readonly string[]
  readonly bridgeDebugValue: ReturnType<typeof buildOpenWaggleRuntimeDebugValue>
  readonly bridgeDebugTimestamp: number
  readonly aborted: boolean
  readonly terminalError?: string
  readonly pendingUserQuestion?: import('@shared/types/user-question').PendingUserQuestionRequest
  readonly phaseTranscriptNode?: ProjectedSessionNodeInput
  readonly threadSnapshotNode?: ProjectedSessionNodeInput
}) {
  const hidden = input.runInput.promptDelivery?.mode === 'hidden-custom-message'
  // Project the appended turing messages ONCE. The snapshot timeline (below) and
  // the returned `newMessages` MUST share the same projection so their assistant/
  // tool message ids agree — otherwise dedup-by-id fails in the renderer and every
  // turn renders twice (the persisted snapshot copy + the returned-newMessages
  // copy). Re-projecting would mint a second, disjoint id set.
  const appendedMessages = turingAppendedToProjectedMessages(
    input.appended,
    input.streamedAssistantIds,
  )
  const newMessages: Message[] = hidden
    ? appendedMessages
    : buildTuringRunNewMessagesFromProjected(input.runInput.payload, appendedMessages)
  const bridgeDebugNode = buildCustomSessionNode({
    customType: TURING_BRIDGE_STATUS_CUSTOM_TYPE,
    data: input.bridgeDebugValue,
    timestampMs: input.bridgeDebugTimestamp,
  })

  // The snapshot must carry the WHOLE conversation (prior turns + this run's new
  // messages), because persistSnapshot replaces the entire node tree. Reusing the
  // messages' own ids keeps node identity stable across runs.
  //
  // The bridge-status node is a non-conversational run artifact, so it must NOT be
  // interleaved into the conversational chain. Emitting it between the user turn
  // and the appended assistant messages leaves a structural node mid-chain; branch
  // derivation strips structural nodes and would then read the user turn and the
  // final assistant turn as two separate leaves, deriving a phantom extra branch
  // ("main" + "Branch 2") and pushing the phase-transcript node off the active
  // branch head (which un-suppresses the raw phase handoff messages in the UI).
  // Keep it with the other trailing artifacts instead.
  const snapshotTimeline = [
    ...input.runInput.session.messages.map((message) => ({
      type: 'message' as const,
      message,
    })),
    ...(!hidden && newMessages[0] ? [{ type: 'message' as const, message: newMessages[0] }] : []),
    ...appendedMessages.map((message) => ({
      type: 'message' as const,
      message,
    })),
  ]

  const baseSnapshot = buildSessionSnapshotFromTimeline(snapshotTimeline)
  const transcriptNodes = input.runInput.persistedTranscriptNodes ?? []
  const bridgeArtifactNode: ProjectedSessionNodeInput = {
    id: bridgeDebugNode.id,
    parentId: null,
    piEntryType: bridgeDebugNode.piEntryType,
    kind: bridgeDebugNode.kind,
    role: bridgeDebugNode.role,
    timestampMs: bridgeDebugNode.timestampMs,
    contentJson: bridgeDebugNode.contentJson,
    metadataJson: bridgeDebugNode.metadataJson,
    pathDepth: 0,
    createdOrder: 0,
  }
  const reparentedTranscriptNodes = reparentProjectedNodesToTail(
    [
      bridgeArtifactNode,
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

  // ORDER DEBUG: the full snapshot node tree as it will be persisted. This is
  // what the renderer rehydrates from after the run, so its order must match the
  // streamed message order. Prior-session messages come first, then this run's
  // user turn + appended assistant/tool messages, then trailing artifact nodes.
  logger.info('buildRunResult: snapshot node order', {
    hidden,
    priorSessionMessages: input.runInput.session.messages.map((message) => ({
      id: message.id,
      role: message.role,
    })),
    appendedProjected: appendedMessages.map((message) => ({ id: message.id, role: message.role })),
    baseSnapshotNodes: baseSnapshot.nodes.map((node) => ({
      id: node.id,
      parentId: node.parentId,
      role: node.role,
      kind: node.kind,
      depth: node.pathDepth,
    })),
    reparentedTailNodes: reparentedTranscriptNodes.map((node) => ({
      id: node.id,
      parentId: node.parentId,
      kind: node.kind,
      depth: node.pathDepth,
    })),
    activeNodeId: snapshotActiveNodeId,
  })

  // ORDER DEBUG: the newMessages returned to the renderer (what it merges live).
  // Their ids MUST match the appendedProjected ids above, or dedup fails.
  logger.info('buildRunResult: returned newMessages', {
    hidden,
    newMessageIds: newMessages.map((message) => ({ id: message.id, role: message.role })),
    appendedProjectedIds: appendedMessages.map((message) => message.id),
    idsMatchAppended: newMessages
      .slice(hidden ? 0 : 1)
      .every((message, index) => message.id === appendedMessages[index]?.id),
  })

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

/**
 * The shell commands a run executed, in call order.
 *
 * The visual-verification audit needs these because every shell call — a `ls`, a
 * `flutter build`, and a full test run alike — reaches it as the single tool
 * name `bash`. Without the command text it cannot tell a fix proven by the
 * project's own test suite from one proven by nothing.
 */
function extractBashCommands(messages: readonly TuringMessage[]): string[] {
  const commands: string[] = []
  for (const message of messages) {
    if (message.role !== 'assistant') continue
    for (const block of message.content) {
      if (block.type !== 'toolCall' || block.name !== 'bash') continue
      const args = block.arguments as { command?: unknown } | undefined
      if (typeof args?.command === 'string') commands.push(args.command)
    }
  }
  return commands
}

/** The first-party tools whose action lives in an argument, not in the name. */
const DEVICE_ACTION_TOOLS = new Set(['mobile', 'drive'])

/**
 * Action-qualified names for the first-party device and web tools.
 *
 * Exactly the problem {@link extractBashCommands} solves, for exactly the same
 * reason: `mobile` and `drive` take their action as an argument, so the tool name
 * alone cannot tell a screenshot (`look`, `shot`) from a tap or an app launch —
 * every call shows up as the single name `mobile`. The audit classifies by name,
 * so give it names that carry the action. The harness names its own actions this
 * way internally (`mobileActionToolName`) for the same reason.
 */
function extractDeviceActionToolNames(messages: readonly TuringMessage[]): string[] {
  const names: string[] = []
  for (const message of messages) {
    if (message.role !== 'assistant') continue
    for (const block of message.content) {
      if (block.type !== 'toolCall') continue
      const bare = block.name.includes('__')
        ? block.name.slice(block.name.lastIndexOf('__') + 2)
        : block.name
      if (!DEVICE_ACTION_TOOLS.has(bare)) continue
      const args = block.arguments as { action?: unknown } | undefined
      const action = typeof args?.action === 'string' ? args.action.trim() : ''
      // No action means a malformed call the harness refused; the bare name still
      // says the run reached for the device, which is all the runtime trigger asks.
      names.push(action ? `${bare}_${action}` : bare)
    }
  }
  return names
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

/**
 * Build the persisted phase-transcript node for a flat-loop run. The 4P
 * `lastPhaseResults` is gone (the loop leaves it undefined); instead this
 * projects the whole run as ONE synthetic `'working'` phase, carrying the run
 * summary (`lastRunSummary`), the structured plan (`lastPlanSet`) when present,
 * the per-step progress (`lastSteps`), and the tool calls streamed this run.
 * The node keeps the same custom type so the persisted-card renderer is
 * unchanged — it just renders one "Working" entry instead of four phases.
 */
export // v2: the harness labels questions with the driving categorizer and the field
// is optional; the app type keeps a required phase for the renderer. Normalize
// in ONE place so the IPC request and the persisted transcript node agree.
function toAppQuestionRequest(request: TuringAskUserQuestionRequest): PendingUserQuestionRequest {
  return {
    ...request,
    phase: request.phase ?? 'conversation',
  }
}

export function buildRunTranscriptNode(
  state: Pick<
    HarnessAgentState,
    'lastRunSummary' | 'lastSteps' | 'lastPlanSet' | 'lastThreadSnapshot' | 'pendingUserQuestion'
  >,
  messages: readonly TuringMessage[],
  timestampMs: number,
  /**
   * Context the visual-verification audit needs and the run state does not
   * carry: what the user asked for, and which tools were connected. Optional so
   * existing callers and tests keep working — an absent context simply narrows
   * the audit to its file-based trigger.
   */
  auditContext: {
    readonly userText?: string
    readonly availableToolNames?: readonly string[]
  } = {},
) {
  const snapshot = state.lastThreadSnapshot
  const summary = state.lastRunSummary?.trim() || snapshot?.summary?.trim()
  const planSet = state.lastPlanSet
  const steps = state.lastSteps ?? []
  // Persist a node when the run produced any signal worth showing: a summary,
  // a plan, completed steps, or any streamed tool calls.
  const toolNameLookup = buildToolNameLookup(messages)
  const toolCalls = [...toolNameLookup.entries()].map(([toolCallId, toolName]) => ({
    toolCallId,
    toolName,
    status: 'completed' as const,
  }))
  const hasContent = Boolean(
    summary || planSet || steps.length || state.pendingUserQuestion || toolCalls.length,
  )
  if (!hasContent) return undefined

  // Did a run that changed the view layer ever look at the result? Both inputs
  // are already here: the paths the run wrote, and every tool it called. This is
  // the only check in the status computation that reads what the run DID rather
  // than what it reported, which is why an otherwise-clean run can still fail it.
  const visualAudit = auditVisualVerification({
    writtenPaths: snapshot?.writtenPaths ?? [],
    toolNames: [...toolNameLookup.values(), ...extractDeviceActionToolNames(messages)],
    executedCommands: extractBashCommands(messages),
    ...(auditContext.userText ? { userText: auditContext.userText } : {}),
    ...(auditContext.availableToolNames
      ? { availableToolNames: auditContext.availableToolNames }
      : {}),
  })
  if (visualAudit.unverified) {
    logger.warn('Run finished without verifying the change against running software', {
      trigger: visualAudit.trigger,
      viewFiles: visualAudit.viewFiles,
      writtenPaths: snapshot?.writtenPaths?.length ?? 0,
    })
  }

  const status = runDispositionToStatus({
    pendingUserQuestion: state.pendingUserQuestion,
    error: snapshot?.error,
    disposition: snapshot?.disposition,
    success: snapshot?.disposition === 'completed',
    visualAudit,
  })

  // Surface WHY the run is marked unverified. A `failed` card the user cannot
  // account for is its own bug — they would read it as a crash and go looking
  // for an error that does not exist. The model's own summary stays first; the
  // audit is appended so the two are not confused for each other.
  const summaryWithAudit = visualAudit.reason
    ? [summary, `⚠︎ Unverified visual change: ${visualAudit.reason}`].filter(Boolean).join('\n\n')
    : summary

  const phase: PersistedPhaseTranscriptPhase = {
    id: 'working',
    label: getAgentPhaseTitle('working'),
    activityText:
      steps.length > 0
        ? `Working through ${steps.length} step${steps.length === 1 ? '' : 's'}`
        : 'Working on the task',
    status,
    elapsedMs: 0,
    ...(summaryWithAudit ? { summary: summaryWithAudit } : {}),
    ...(planSet ? { planSet: planSet as unknown as JsonValue } : {}),
    ...(state.pendingUserQuestion
      ? { pendingUserQuestion: toAppQuestionRequest(state.pendingUserQuestion) }
      : {}),
    tools: toolCalls,
  }
  const transcript: PersistedPhaseTranscript = {
    version: 1,
    phases: [phase],
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
  // Pass the runtime so the prewarm path can build harness + open memories
  // ahead of time; on a hit, the checked-out session is ready instantly.
  // `connectMcpBackground` below starts MCP servers asynchronously so the
  // LLM begins thinking immediately while tools connect in the background.
  const warmProject = await checkoutWarmProjectSession(sessionId, projectPath, {
    modelRef: input.model,
    mcpSettings: input.mcpSettings,
    standardsContext: input.standardsContext,
  })
  const turingSession = warmProject.session
  const persistedThreadSnapshot = extractPersistedThreadSnapshot(input.persistedTranscriptNodes)
  const mcpPool = getSharedMcpPool(projectPath)

  // Start MCP connection. Skills register synchronously (instant); MCP servers
  // borrow from the PERSISTENT shared pool, which `prewarmProjectMemory`
  // (triggered on project open) prewarmed in the background. On the warm path
  // (the common case — user opened the project before typing) the borrow is a
  // Map lookup (microseconds), so awaiting here puts every MCP tool into the
  // registry BEFORE turn 1 — no race condition. On the cold path (first prompt
  // racing the prewarm), the pool's in-flight dedup means this borrow SHARES
  // the prewarm's in-flight connection rather than spawning a duplicate, so it
  // resolves as soon as that single spawn lands. BRIDGE_WAIT_MS is a safety cap
  // for pathological cases; late arrivals still flow in via the loop's dynamic
  // tool resolution (turn 2+). Kept modest so the first prompt doesn't freeze
  // for the full cold-spawn duration — if MCP isn't ready within this window the
  // model starts with built-in tools and MCP arrives mid-run via resolveTools.
  const BRIDGE_WAIT_MS = 8000
  const { ready: bridgeReady, snapshot: bridgeSnapshot } = await connectMcpBackground(
    turingSession,
    {
      mcpSettings: input.mcpSettings,
      standardsContext: input.standardsContext,
    },
    {
      projectPath,
      mcpPool,
    },
  )
  // Per-run MCP selection (the composer picker): named servers join every
  // categorizer; everything else stays connected-but-out-of-chain. Applied
  // immediately — the session re-applies the selection to servers that attach
  // after this point, and the QA hops' surface gating drops off-surface tools
  // regardless of selection. Before this, merely ENABLING a server in settings
  // put its tools into every QA hop of every project (a Flutter run opening
  // with ~62 tools, two-thirds of them browser tools it could not use).
  const mcpSelection = turingSession.selectMcpServers(input.payload.mcpServers ?? [])
  logger.info('MCP selection applied for run', {
    selected: mcpSelection.selected,
    connectedOnly: mcpSelection.dropped,
  })
  let bridge: BridgeResult | undefined
  try {
    bridge = await new Promise<BridgeResult | undefined>((resolve) => {
      const timer = setTimeout(() => {
        // Proceed with WHATEVER has attached, not with nothing. One slow server
        // (a bad npm spec, or a `github:` spec that clones) takes 15-30s, and
        // resolving `undefined` here meant the runtime prompt listed no MCP tools
        // at all — so the model denied having Playwright while Playwright was
        // connected and sitting in the registry. Stragglers still arrive mid-run
        // via the loop's dynamic tool resolution.
        const partial = bridgeSnapshot()
        logger.warn('Bridge attach timed out — proceeding with the servers already attached', {
          projectPath,
          waitMs: BRIDGE_WAIT_MS,
          connectedMcp: partial.connectedMcpIds.length,
          connectedNames: Object.keys(partial.connectedMcpToolNames),
          stillPending: partial.attemptedMcpNames.filter(
            (name) =>
              !(name in partial.connectedMcpToolNames) && !partial.failedMcpNames.includes(name),
          ),
        })
        resolve(partial)
      }, BRIDGE_WAIT_MS)
      bridgeReady.then(
        (b) => {
          clearTimeout(timer)
          resolve(b)
        },
        () => {
          clearTimeout(timer)
          resolve(undefined)
        },
      )
    })
  } catch {
    bridge = undefined
  }

  const agentHost = createThreadSnapshotAgentHost(turingSession, persistedThreadSnapshot)
  const agent: HarnessAgent = new HarnessAgent(agentHost, {
    model: llmConfig.modelSlug,
    // Reproduce before you edit. `describesRuntimeSymptom` is the same classifier
    // the post-hoc audit already uses to decide a run should have driven the app —
    // reused here so detection and PREVENTION agree on what a bug report is,
    // instead of the run being allowed to edit blind and then told off for it.
    ...(describesRuntimeSymptom(input.payload.text) ? { isBugFix: true } : {}),
    thinkingLevel: input.payload.thinkingLevel,
    transcriptMode: 'compact',
    // `compact` alone seeds BOTH emission axes off, and the only thing that can
    // turn them back on mid-run is a tool call's permission decision (the
    // `emissionFlags` below). That is too late: the first turn has already
    // streamed and been discarded, and a turn that calls no tools — a plain
    // answer, or a final summary — never emits at all. Since the permission
    // callback turns both on unconditionally anyway, seed them on here so turn 1
    // is not silently dropped.
    emitReasoning: true,
    emitText: true,
    // NO TURN CAP. The loop ends when the model stops calling tools — i.e. when
    // the work is done — or when it stops making progress.
    //
    // There used to be a 30-turn budget here. Outside plan mode `skipPlan: true`
    // means ONE work loop covers the whole task, so that number was not "30 turns
    // per step", it was the entire job: a plan with eight real steps spent its
    // budget partway through and the run stopped mid-task, reporting success on
    // work it had not finished. Raising the number only moves where that happens.
    //
    // A count was never the right guard anyway, because it cannot tell a long
    // task from a stuck one. `StallGuard` can: it ends the loop on repeated
    // identical calls or consecutive failures (with bounded graces), which is
    // the actual failure being feared. Abort and the model's own FINISH turn
    // cover the rest. Pass `maxStepsPerStep` again only for a deliberately
    // latency-bounded run.
  })
  // v2 (categorizer chain): model configuration lives in the categorizer
  // setup, and the role-slot keys survive as compat aliases — 'prepare' drives
  // the router + conversation hop, 'perform' drives the work categorizers
  // (read/write_edit/activity_inspect), 'perfect' drives the final
  // summary-of-summaries turn, and the constructor's `model` wrote the
  // 'orchestrator' slot (the clearing_doubt fallback). Pin the three LIVE slots
  // per run so every hop runs on the user's model — sessions are warm-cached,
  // so a slot left unset would fall back to the harness default, not the model
  // the user picked. Per-call escalation still wins via toolModelCandidates +
  // routeModel below.
  for (const slot of ['prepare', 'perform', 'perfect'] as const) {
    agentHost.orchestrator.setModel(slot, llmConfig.modelSlug)
  }

  // Build the runtime prompt WITH the resolved bridge so the model sees the
  // exact "CONNECTED MCP TOOLS" / "UNAVAILABLE MCP SERVERS" sections at turn 1.
  // The MCP section is filtered to the composer's selection — connected is not
  // selected, and advertising tools the chain holds none of is how a write pass
  // stalls itself calling them.
  const runtimePrompt = buildOpenWaggleRuntimePrompt(input.payload.text, {
    standardsContext: input.standardsContext,
    bridge,
    mcpSelection: input.payload.mcpServers ?? [],
    pendingUserQuestionResolution: input.pendingUserQuestionResolution,
  })

  // Attachments were previously dropped on the floor: `agent.prompt` was called
  // with the text alone, so an attached mockup never reached the model and
  // multimodal write/edit authoring could not fire. Map them into the harness
  // shape, and append an explicit steer telling the model whether to ANALYZE the
  // image or BUILD from it — listing the images (which the harness already does)
  // is not enough to get them routed into write/edit's `images` argument.
  const turingAttachments = toTuringAttachments(input.payload.attachments)
  const attachmentIntentSection = buildAttachmentIntentSection(
    input.payload.text,
    input.payload.attachments,
  )
  const promptWithAttachments = attachmentIntentSection
    ? `${runtimePrompt}\n\n${attachmentIntentSection}`
    : runtimePrompt
  if (turingAttachments.length > 0) {
    logger.info('Forwarding attachments to turing-harness', {
      count: turingAttachments.length,
      imageCount: turingAttachments.filter((att) => att.type === 'image').length,
      intent: detectAttachmentIntent(input.payload.text, input.payload.attachments),
    })
  }

  const onEvent = (event: AgentTransportEvent) => input.onEvent(event)
  turingSession.setPermissionMode(mapToolPermissionMode(input.toolPermissionMode ?? 'ask'))
  // The candidate pool the harness selects from per call, ordered cheap → capable.
  // It must be set per RUN, not at session creation: the session is warm-cached per
  // project while the user can change models between runs, so a pool pinned at
  // creation would go stale. This pool is also what lets the staged `read` escalate
  // internally — with a single-entry pool there is no stronger tier to escalate to
  // and the tool stays single-stage.
  const escalationModel = llmConfig.escalationModelSlug
  turingSession.setToolModelCandidates([...toolModelCandidatesFor(llmConfig)])
  // The escalation grid (kind x category x rating x attachment). This was only
  // ever passed at session CREATION — which the memory prewarm does and this run
  // path does not — so a run on a warm session had no router at all: write/edit
  // escalation could not fire, and the driver's own draft was written verbatim
  // however the call was rated. Reads still escalated via `toolModelCandidates`,
  // which is why upstream logs showed a stronger model working while the file on
  // disk was plainly the driver's.
  turingSession.setRouteModel(routeModel)
  // Per-tool reasoning-effort overrides, keyed by exact tool name. A tool listed
  // here runs the NEXT phase-model turn (the one after its result is processed)
  // at this effort instead of the harness-wide `thinkingLevel` (medium). Use it
  // to run a cheap/safe tool at "low"/"minimal", or a reasoning-heavy tool at
  // "high"/"xhigh". Omit a tool to inherit the harness default. "off" disables
  // reasoning for that tool's follow-up turn. Populate as needed.
  const TOOL_THINKING_LEVEL_OVERRIDES: Record<string, ThinkingLevel> = {
    // example: bash: 'low',
    // example: aHeavyReasoningTool: 'high',
  }
  // Per-tool model overrides, keyed by exact tool name. A tool listed here has
  // its RESULT consumed by this model on the NEXT phase-model turn (one turn
  // only; the requesting phase model resumes after). Use it to hand a specific
  // tool's output to a different model (e.g. a stronger reader for `read`). Any
  // model the user picks in the permission UI for a gated call also flows through
  // (see the user-gated return path). Omit a tool to inherit the phase model.
  const TOOL_MODEL_OVERRIDES: Record<string, string> = {
    // example: read: 'anthropic/claude-opus-4.8',
  }
  // The permission callback is ALWAYS installed (even in allow-all/bypass mode).
  // turing-harness now consults it for every phase and tool call, so OpenWaggle
  // owns the whole policy: per tool it decides whether the current permission
  // mode already permits the call (auto-allow, no UI) or whether to surface the
  // approval popup — and every decision carries the UI-emission flags.
  turingSession.setPermissionCallback(async (request) => {
    // Per-tool reasoning effort for the follow-up phase-model turn.
    const thinkingLevel =
      request.kind === 'tool' ? TOOL_THINKING_LEVEL_OVERRIDES[request.name] : undefined
    // Per-tool model that consumes this tool's result (one turn only).
    const model = request.kind === 'tool' ? TOOL_MODEL_OVERRIDES[request.name] : undefined

    // Escalate BYTE AUTHORING for a mutating call the harness rated `high`.
    // By now the run's own model has already emitted its draft args, so this
    // hands the actual write/edit content to the stronger model instead.
    // The rating is evidence, not a guess: it is either inherited from the
    // plan step or MEASURED by the staged `read` that loaded this same file
    // earlier in the run (`complexitySource: 'tool-measured'`) — which is
    // what closes the loop between reading a hard file and editing it.
    //
    // PRECEDENCE: this is now an operator OVERRIDE, not the normal path. It
    // fires only when OPENWAGGLE_TURING_ESCALATION_MODEL is set (otherwise
    // `escalationModel` is undefined). With it unset — the default — returning
    // no `authorModel` lets the harness consult `turing-model-routing.ts`, which
    // routes BOTH medium and high writes. Pinning a slug here suppresses that
    // table for high writes, so set the env var only when you mean to bypass it.
    const authorModel =
      escalationModel &&
      request.kind === 'tool' &&
      request.mutates &&
      (request.name === 'write' || request.name === 'edit') &&
      request.complexityRating === 'high'
        ? escalationModel
        : undefined

    // Stream BOTH the AI's non-reasoning text ("transcript") and its
    // reasoning/thinking blocks for every phase and tool call.
    const emissionFlags = { transcript: true, reasoning: true } as const

    // Phases are never user-gated in OpenWaggle: auto-allow + apply flags.
    if (request.kind !== 'tool') {
      return { allowed: true, ...emissionFlags }
    }

    // Per-tool auto-allow policy from the session's permission mode:
    // `allow-all` permits everything; `ask-edit` permits non-mutating calls
    // and prompts for mutations; `ask` prompts for every tool. An already
    // permitted call returns true WITHOUT any UI.
    const permissionMode = input.toolPermissionMode ?? 'ask'
    const autoAllow =
      permissionMode === 'allow-all' || (permissionMode === 'ask-edit' && !request.mutates)
    if (autoAllow) {
      return {
        allowed: true,
        ...emissionFlags,
        ...(thinkingLevel ? { thinkingLevel } : {}),
        ...(model ? { model } : {}),
        ...(authorModel ? { authorModel } : {}),
      }
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
        // UI-emission axes for the AI's response to this tool's result:
        // stream both the non-reasoning text ("transcript") and the
        // reasoning/thinking blocks. Applied to the phase's subsequent
        // model turns.
        ...emissionFlags,
        // Per-tool reasoning effort for the follow-up phase-model turn.
        ...(thinkingLevel ? { thinkingLevel } : {}),
        // Model that consumes this tool's result: prefer the UI-chosen
        // model (explicit user decision at the gate), else the per-tool
        // override map. One turn only; the phase model resumes after.
        ...(resolution.decision === 'approved' && resolution.request.model
          ? { model: resolution.request.model }
          : model
            ? { model }
            : {}),
        ...(resolution.decision === 'approved' && resolution.request.option
          ? { option: resolution.request.option }
          : {}),
        // Byte authoring for an approved high-complexity write/edit goes to
        // the stronger model. Only on approval — a denied call writes nothing,
        // so pinning an author model for it would be meaningless.
        ...(resolution.decision === 'approved' && authorModel ? { authorModel } : {}),
      }
    } catch (error) {
      emitCustomEvent(onEvent, input.model, TOOL_PERMISSION_RESOLVED_EVENT, {
        toolCallId: requestForUi.toolCallId,
        decision: 'denied',
      })
      throw error
    }
  })

  // Plan review: `create_plan` blocks here while the renderer shows the drafted
  // plan. The user approves it, or sends it back with comments to be re-planned —
  // and either way may attach notes/files to individual steps, which ride on the
  // plan into that step's own execution.
  // Whether the user has already accepted a plan in this run. Read only by the
  // unauthorized-run recovery below, which must not put a second approval card
  // in front of someone who already approved this exact work.
  let planApproved = false

  turingSession.setPlanApprovalCallback(async (request) => {
    const planReviewId = `turing-plan-${randomUUID()}`
    const pending: PendingPlanReviewRequest = {
      planReviewId,
      planSet: request.planSet as unknown as PendingPlanReviewRequest['planSet'],
      revision: request.revision,
      task: request.task,
      revisionsRemaining: request.revisionsRemaining,
      ...(request.priorComments ? { priorComments: request.priorComments } : {}),
    }
    emitCustomEvent(
      onEvent,
      input.model,
      PLAN_REVIEW_REQUEST_EVENT,
      pending as unknown as JsonValue,
    )

    try {
      const resolution = await beginPlanReviewRequest(input.session.id, pending, input.signal)
      emitCustomEvent(onEvent, input.model, PLAN_REVIEW_RESOLVED_EVENT, {
        planReviewId,
        decision: resolution.decision,
      })
      if (resolution.decision === 'approved') planApproved = true
      return {
        approved: resolution.decision === 'approved',
        ...(resolution.decision === 'cancelled' ? { cancelled: true } : {}),
        ...(resolution.comments ? { comments: resolution.comments } : {}),
        ...(resolution.stepEdits?.length
          ? {
              stepEdits: resolution.stepEdits.map((edit) => ({
                taskId: edit.taskId,
                ...(edit.notes ? { notes: edit.notes } : {}),
                ...(edit.attachments?.length
                  ? { attachments: edit.attachments.map((a) => ({ ...a })) }
                  : {}),
              })),
            }
          : {}),
      }
    } catch (error) {
      // An aborted run must not be reported as an approval — that would start
      // executing a plan the user never accepted.
      emitCustomEvent(onEvent, input.model, PLAN_REVIEW_RESOLVED_EVENT, {
        planReviewId,
        decision: 'cancelled',
      })
      logger.warn('Plan review did not resolve; treating as cancelled', {
        error: error instanceof Error ? error.message : String(error),
      })
      return { approved: false, cancelled: true }
    }
  })

  // Install the `ask_user_question` callback on the session. The harness's
  // built-in `ask_user_question` tool will await this when the LLM needs a
  // clarification, so the LLM continues in the SAME conversation context with
  // the user's answer as the tool result. No new run is required, so all prior
  // tool calls, file changes, and assistant messages are preserved.
  turingSession.setAskUserQuestionCallback(async (questionRequest) => {
    emitCustomEvent(
      onEvent,
      input.model,
      USER_QUESTION_REQUEST_EVENT,
      questionRequest as unknown as JsonValue,
    )

    try {
      const resolution = await beginUserQuestionRequest(
        input.session.id,
        toAppQuestionRequest(questionRequest),
        input.signal,
      )
      emitCustomEvent(onEvent, input.model, USER_QUESTION_RESOLVED_EVENT, {
        phase: resolution.request.phase,
        question: resolution.request.question,
        answer: resolution.answer,
        ...(resolution.attachments?.length
          ? { attachments: resolution.attachments.map((a) => ({ ...a })) }
          : {}),
      } as unknown as JsonValue)
      // Return the structured shape whenever the user attached files. The
      // harness threads images from here into the run's live attachment set, so
      // the next write/edit authors from the pixels — a file returned only as a
      // sentence would be named once and never looked at again. A plain string
      // stays the answer when there is nothing attached: same value the harness
      // accepted before attachments existed, and fewer moving parts.
      if (!resolution.attachments?.length) return resolution.answer
      return {
        text: resolution.answer,
        attachments: resolution.attachments.map((a) => ({ ...a })),
      }
    } catch (error) {
      emitCustomEvent(onEvent, input.model, USER_QUESTION_RESOLVED_EVENT, {
        phase: questionRequest.phase,
        question: questionRequest.question,
        aborted: true,
      } as unknown as JsonValue)
      throw error
    }
  })
  const mapEvent = createTuringEventMapper({
    runId: input.runId,
    model: input.model,
    emit: onEvent,
    // v2 has no chain_end; the mapper closes the 'working' phase on agent_end,
    // by which point state.error is final. An abort is an interruption, not a
    // failure.
    resolveEndStatus: () =>
      input.signal.aborted ? 'interrupted' : agent.state.error ? 'failed' : 'completed',
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

  // Emit the bridge status event. We already awaited `bridge` above, so emit
  // synchronously — the renderer gets the connected/failed MCP picture up front.
  // Hoist these into function scope so `buildRunResult` (below) can thread them
  // into the persisted snapshot — referencing a block-scoped const from there
  // was the `bridgeDebugValue is not defined` ReferenceError crashing the run.
  // Always built, even when the bridge attach timed out (`bridge` undefined):
  // `buildRunResult` persists this node unconditionally, and an absent bridge is
  // itself the status worth recording — empty MCP lists say "built-in tools only".
  const bridgeDebugValue: ReturnType<typeof buildOpenWaggleRuntimeDebugValue> =
    buildOpenWaggleRuntimeDebugValue(turingSession, {
      mcpSettings: input.mcpSettings,
      standardsContext: input.standardsContext,
      ...(bridge ? { bridge } : {}),
    })
  const bridgeDebugTimestamp = Date.now()
  if (bridge) {
    onEvent({
      type: 'custom',
      name: 'turing_bridge_status',
      value: bridgeDebugValue,
      timestamp: bridgeDebugTimestamp,
      model: input.model,
    })
  }
  // If `bridge` is undefined (timed out), emit a final status once the
  // background connection does resolve, so the UI still reflects late arrivals.
  else {
    void bridgeReady
      .then((b) => {
        onEvent({
          type: 'custom',
          name: 'turing_bridge_status',
          value: buildOpenWaggleRuntimeDebugValue(turingSession, {
            mcpSettings: input.mcpSettings,
            standardsContext: input.standardsContext,
            bridge: b,
          }),
          timestamp: Date.now(),
          model: input.model,
        })
      })
      .catch(() => undefined)
  }

  // Machine mode => plan mode: decompose, surface the plan for approval via
  // the `planApproval` callback wired above (PLAN_REVIEW_REQUEST_EVENT), then
  // run each approved step as its own sub-loop. Off => one flat work loop.
  const runAgentPrompt = async (
    prompt: string,
    attachments: typeof turingAttachments,
    planMode: boolean = input.payload.planMode === true,
  ): Promise<string | undefined> => {
    try {
      await agent.prompt(prompt, attachments, { planMode })
      return agent.state.error
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  let terminalError: string | undefined
  try {
    terminalError = await runAgentPrompt(promptWithAttachments, turingAttachments)

    // The backend refused our credential rather than the work failing. Renew the
    // session and carry on from where the chain stopped: `agent.prompt` clears
    // the previous error and keeps the session's transcript, so the continuation
    // sees every tool result the dead turn had already gathered instead of
    // redoing an hour of work. Once only — if the second attempt is unauthorized
    // too, the problem is the session, not the token.
    if (isBackendAuthError(terminalError) && !input.signal.aborted) {
      logger.warn('Run ended unauthorized; refreshing the backend token to continue', {
        error: terminalError,
      })
      if (await refreshBackendTokenAfterAuthFailure()) {
        if (!input.signal.aborted) {
          const continuation = resolveAuthRecoveryContinuation({
            planApproved,
            planMode: input.payload.planMode === true,
          })
          // No attachments: they were consumed by the first prompt and are
          // already in the transcript the continuation inherits.
          terminalError = await runAgentPrompt(continuation.prompt, [], continuation.planMode)
          logger.info('Continued the chain after refreshing the backend token', {
            recovered: !terminalError,
            planApproved,
            continuationPlanMode: continuation.planMode,
            ...(terminalError ? { error: terminalError } : {}),
          })
        }
      } else {
        // Say what actually happened. Left alone this surfaces as "Invalid API
        // key", which sends the user hunting for a settings field that does not
        // exist on the backend path.
        terminalError = 'Your session expired and could not be renewed. Please sign in again.'
      }
    }
  } finally {
    input.signal.removeEventListener('abort', abortListener)
    unsubscribe()
    agent.dispose()
  }

  const appended: readonly TuringMessage[] = agent.state.messages
  // ORDER DEBUG: the raw turing messages the harness produced this run, in the
  // order the harness stored them. This is the source of truth for projection.
  logger.info('runTuringSession: raw appended turing messages', {
    count: appended.length,
    messages: appended.map((message) => ({
      role: message.role,
      ...(message.role === 'assistant'
        ? {
            stopReason: message.stopReason,
            textBlocks: message.content
              .filter((part) => part.type === 'text')
              .map((part) => (part as { text: string }).text)
              .map((text) => text.replace(/\s+/g, ' ').slice(0, 50)),
            toolCalls: message.content
              .filter((part) => part.type === 'toolCall')
              .map((part) => (part as { id: string; name: string }).name),
          }
        : {}),
      ...(message.role === 'toolResult'
        ? { toolCallId: message.toolCallId, toolName: message.toolName, isError: message.isError }
        : {}),
    })),
  })
  // The tools the run COULD have reached. The audit uses this so it only faults a
  // run for skipping verification that was genuinely available.
  //
  // MCP tools are the part that varies, so they are looked up. The harness's own
  // `mobile` and `drive` are registered unconditionally — they report their own
  // install hints rather than disappearing when the binary is missing — so they
  // are always reachable and belong here too. Listing only MCP tools meant a
  // first-party setup looked like a machine with no runtime tooling at all, and
  // the runtime-symptom trigger could never fire on it.
  const availableToolNames = [
    ...Object.values(bridge?.connectedMcpToolNames ?? {}).flat(),
    ...DEVICE_ACTION_TOOLS,
  ]
  const phaseTranscriptNode = buildRunTranscriptNode(agent.state, appended, Date.now(), {
    userText: input.payload.text,
    availableToolNames,
  })
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

  // The streamed assistant-turn ids the mapper recorded. Threaded into the
  // projection so the persisted snapshot reuses them — matching the live stream.
  const streamedAssistantIds =
    typeof mapEvent.getStreamedMessageIds === 'function' ? mapEvent.getStreamedMessageIds() : []
  return buildRunResult({
    runInput: input,
    sessionId,
    appended,
    streamedAssistantIds,
    bridgeDebugValue,
    bridgeDebugTimestamp,
    aborted,
    ...(agent.state.pendingUserQuestion
      ? { pendingUserQuestion: toAppQuestionRequest(agent.state.pendingUserQuestion) }
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
