import type { HydratedAgentSendPayload, Message } from '@shared/types/agent'
import type { ContextCompactionResult, ContextUsageSnapshot } from '@shared/types/context-usage'
import type { SupportedModelId } from '@shared/types/llm'
import type { McpSettingsView } from '@shared/types/mcp'
import type { SessionResumeState } from '@shared/types/resume'
import type { SessionDetail } from '@shared/types/session'
import type { ToolPermissionMode } from '@shared/types/settings'
import type { AgentTransportEvent } from '@shared/types/stream'
import type { WaggleConfig, WaggleStreamMetadata, WaggleTurnEvent } from '@shared/types/waggle'
import { Context, type Effect } from 'effect'
import type { ProjectedSessionNodeInput } from './session-repository'

/**
 * A skill surfaced to the agent runtime as a turing-harness `defineSkill` provider.
 * Describes the OpenWaggle skill body and its on-disk location so the agent can
 * discover and invoke scoped instructions.
 */
export interface AgentKernelActiveSkill {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly body: string
  readonly skillPath: string
  readonly folderPath: string
  readonly hasScripts: boolean
}

/**
 * Agent-instruction context assembled from AGENTS.md, scoped instructions, active
 * skills, and standards warnings. Injected into the runtime prompt so the agent
 * operates with the project's declared standards.
 */
export interface AgentKernelStandardsContext {
  readonly agentsInstruction: string
  readonly agentsScopedInstructions: readonly {
    readonly scopeRelativeDir: string
    readonly filePath: string
    readonly content: string
  }[]
  readonly activeSkills: readonly AgentKernelActiveSkill[]
  readonly warnings: readonly string[]
}

/**
 * The answer to a previously-paused user question, used to resume a run that blocked
 * on `ask_user_question`. When present, the runtime prompt carries the clarification
 * so the model continues from the clarified plan instead of re-asking.
 */
export interface AgentKernelPendingUserQuestionResolution {
  readonly request: {
    /** v2: the categorizer id the question came from (arbitrary string). */
    readonly phase: string
    readonly question: string
    readonly reason?: string
  }
  readonly answer: string
}

export class AgentKernelMissingEntryError extends Error {
  readonly entryId: string

  constructor(entryId: string) {
    super(`Agent session entry is missing: ${entryId}`)
    this.name = 'AgentKernelMissingEntryError'
    this.entryId = entryId
  }
}

export function isAgentKernelMissingEntryError(
  error: unknown,
): error is AgentKernelMissingEntryError {
  return error instanceof AgentKernelMissingEntryError
}

export interface AgentKernelSessionSnapshot {
  readonly nodes: readonly ProjectedSessionNodeInput[]
  readonly activeNodeId: string | null
}

export interface AgentKernelRunInput {
  readonly session: SessionDetail
  readonly runId: string
  readonly payload: HydratedAgentSendPayload
  readonly model: SupportedModelId
  readonly toolPermissionMode?: ToolPermissionMode
  readonly promptDelivery?: AgentKernelPromptDelivery
  readonly skillToggles?: Readonly<Record<string, boolean>>
  /** Restrict the tool set for this run (see `AgentRunInput.noTools`). */
  readonly noTools?: 'all' | 'builtin'
  readonly signal: AbortSignal
  readonly onEvent: (event: AgentTransportEvent) => void
  readonly waggle?: AgentKernelWaggleRunOptions
  /** MCP servers to attach to the run. Optional — absent means no MCP servers. */
  readonly mcpSettings?: McpSettingsView
  /** AGENTS.md / scoped instructions / active skills / warnings. Optional. */
  readonly standardsContext?: AgentKernelStandardsContext
  /** Prior persisted transcript nodes, used to resume/continue a thread. Optional. */
  readonly persistedTranscriptNodes?: readonly ProjectedSessionNodeInput[]
  /** Answer to a previously-paused user question, to resume the run. Optional. */
  readonly pendingUserQuestionResolution?: AgentKernelPendingUserQuestionResolution
  /**
   * Carry a STOPPED run forward instead of starting a fresh one.
   *
   * The token itself is not passed in: it is read out of
   * `persistedTranscriptNodes`, which this input already carries, so a caller
   * cannot hand back a token from a different session. All the caller supplies
   * is the intent — and the user's `answer`, when the run stopped on a question.
   */
  readonly resumeRun?: AgentKernelResumeRun
}

/** See `AgentKernelRunInput.resumeRun`. */
export interface AgentKernelResumeRun {
  /** The user's reply, required when the stopped run was waiting on one. */
  readonly answer?: string
  readonly attachments?: ReadonlyArray<{ readonly path: string; readonly mimeType: string }>
}

export interface HiddenCustomPromptDelivery {
  readonly mode: 'hidden-custom-message'
  readonly customType: string
  readonly details?: Readonly<Record<string, unknown>>
}

export type AgentKernelPromptDelivery = HiddenCustomPromptDelivery

export interface AgentKernelWaggleRunOptions {
  readonly config: WaggleConfig
  readonly inheritedModel: SupportedModelId
  readonly onWaggleEvent: (event: AgentTransportEvent, meta: WaggleStreamMetadata) => void
  readonly onTurnEvent: (event: WaggleTurnEvent) => void
}

export interface AgentKernelRunResult {
  readonly newMessages: readonly Message[]
  readonly piSessionId: string
  readonly piSessionFile?: string
  readonly sessionSnapshot: AgentKernelSessionSnapshot
  readonly aborted?: boolean
  readonly terminalError?: string
  /**
   * Set when THIS run also stopped short of its plan — the user-facing half of
   * the resume record. Absent means the run settled and there is nothing to
   * continue.
   */
  readonly resumeState?: SessionResumeState
}

export interface AgentKernelSessionSnapshotResult {
  readonly piSessionId: string
  readonly piSessionFile?: string
  readonly sessionSnapshot: AgentKernelSessionSnapshot
}

export interface AgentKernelCompactResult extends ContextCompactionResult {
  readonly piSessionId: string
  readonly piSessionFile?: string
  readonly sessionSnapshot: AgentKernelSessionSnapshot
}

export interface CreateAgentKernelSessionInput {
  readonly projectPath: string
}

export interface CreateAgentKernelSessionResult {
  readonly piSessionId: string
  readonly piSessionFile?: string
}

export interface AgentKernelSessionInput {
  readonly session: SessionDetail
  readonly model: SupportedModelId
  readonly skillToggles?: Readonly<Record<string, boolean>>
  /**
   * The session's persisted custom nodes (thread-snapshot ledger, resume
   * tokens, bridge artifacts). Only the turing kernel reads them — its
   * `getContextUsage` estimates the step ledger the next run's first hop will
   * carry. The Pi kernel rebuilds context from its own JSONL and ignores this.
   */
  readonly persistedTranscriptNodes?: readonly ProjectedSessionNodeInput[]
}

export interface CompactAgentKernelSessionInput extends AgentKernelSessionInput {
  readonly customInstructions?: string
  readonly signal?: AbortSignal
  readonly onEvent?: (event: AgentTransportEvent) => void
}

export interface NavigateAgentKernelSessionInput extends AgentKernelSessionInput {
  readonly targetNodeId: string
  readonly summarize?: boolean
  readonly customInstructions?: string
}

export type AgentKernelForkPosition = 'before' | 'at'

export interface ForkAgentKernelSessionInput extends AgentKernelSessionInput {
  readonly targetNodeId: string
  readonly position: AgentKernelForkPosition
}

export interface AgentKernelNavigateTreeResult {
  readonly piSessionId: string
  readonly piSessionFile?: string
  readonly sessionSnapshot: AgentKernelSessionSnapshot
  readonly editorText?: string
  readonly cancelled: boolean
}

export interface AgentKernelForkSessionResult {
  readonly piSessionId: string
  readonly piSessionFile?: string
  readonly sessionSnapshot: AgentKernelSessionSnapshot
  readonly editorText?: string
  readonly cancelled: boolean
}

export interface AgentKernelServiceShape {
  readonly run: (input: AgentKernelRunInput) => Effect.Effect<AgentKernelRunResult, Error>
  readonly createSession: (
    input: CreateAgentKernelSessionInput,
  ) => Effect.Effect<CreateAgentKernelSessionResult, Error>
  readonly getContextUsage: (
    input: AgentKernelSessionInput,
  ) => Effect.Effect<ContextUsageSnapshot | null, Error>
  readonly compact: (
    input: CompactAgentKernelSessionInput,
  ) => Effect.Effect<AgentKernelCompactResult, Error>
  readonly navigateTree: (
    input: NavigateAgentKernelSessionInput,
  ) => Effect.Effect<AgentKernelNavigateTreeResult, Error>
  readonly forkSession: (
    input: ForkAgentKernelSessionInput,
  ) => Effect.Effect<AgentKernelForkSessionResult, Error>
  readonly getSessionSnapshot: (
    input: AgentKernelSessionInput,
  ) => Effect.Effect<AgentKernelSessionSnapshotResult, Error>
}

export class AgentKernelService extends Context.Tag('@openwaggle/AgentKernelService')<
  AgentKernelService,
  AgentKernelServiceShape
>() {}
