import type { AgentSendPayload, HydratedAgentSendPayload } from '@shared/types/agent'
import type { McpSettingsView } from '@shared/types/mcp'
import type { SessionDetail, SessionNode } from '@shared/types/session'
import type { ToolPermissionMode } from '@shared/types/settings'
import * as Effect from 'effect/Effect'
import { pipe } from 'effect/Function'
import { createLogger } from '../../logger'
import {
  AgentKernelService,
  type AgentKernelStandardsContext,
} from '../../ports/agent-kernel-service'
import type { ProjectedSessionNodeInput } from '../../ports/session-repository'
import { SessionRepository } from '../../ports/session-repository'
import { hydratePayloadAttachments } from '../run-handler-utils'
import type { AgentRunInput } from './types'

const logger = createLogger('agent-run-kernel')

export function hydrateAgentRunPayload(payload: AgentSendPayload) {
  return Effect.gen(function* () {
    return {
      ...payload,
      attachments: yield* Effect.promise(() => hydratePayloadAttachments(payload.attachments)),
    } satisfies HydratedAgentSendPayload
  })
}

/**
 * Map a persisted {@link SessionNode} (read back from the repository) into the
 * {@link ProjectedSessionNodeInput} shape `extractPersistedThreadSnapshot` expects.
 *
 * `SessionNode` is a strict superset of `ProjectedSessionNodeInput`, so this is a
 * field pick — no synthesis. Only the fields the snapshot extractor reads are
 * carried; the rest (sessionId, branchId, message) are irrelevant to continuity.
 */
export function toProjectedNode(node: SessionNode): ProjectedSessionNodeInput {
  return {
    id: node.id,
    parentId: node.parentId,
    piEntryType: node.piEntryType,
    kind: node.kind,
    role: node.role ?? null,
    timestampMs: node.timestampMs,
    contentJson: node.contentJson,
    metadataJson: node.metadataJson,
    pathDepth: node.pathDepth,
    createdOrder: node.createdOrder,
  }
}

export function runAgentKernel(
  input: AgentRunInput,
  payload: HydratedAgentSendPayload,
  preflight: {
    readonly session: SessionDetail
    readonly skillToggles?: Record<string, boolean>
    readonly toolPermissionMode: ToolPermissionMode
    readonly mcpSettings?: McpSettingsView
    readonly standardsContext?: AgentKernelStandardsContext
  },
) {
  return Effect.gen(function* () {
    const agentKernel = yield* AgentKernelService

    // Load the session's persisted transcript nodes so the next run on this thread
    // can continue from where the previous one left off. The previous run's
    // ThreadRunSnapshot (task + summary + written/read paths + verdict) is stored
    // among these nodes as a custom node; `runTuringSession` re-extracts it via
    // `extractPersistedThreadSnapshot` and renders it into the new run's opening
    // message as "THREAD CONTEXT FROM THE PREVIOUS RUN". Without this hop the
    // snapshot was write-only: persisted to SQLite but never read back, so a
    // follow-up prompt on the same thread started with no memory of the prior run
    // whenever the live session had been disposed (app restart, eviction).
    //
    // Non-fatal: a missing or unreadable snapshot must never block a new prompt —
    // it just means this run gets no continuity handoff, exactly like before. The
    // load is wrapped in `Effect.either` (not a try/catch) because `getTree` fails
    // through the Effect channel, not by throwing, so a synchronous catch would not
    // see a repository error and the run would abort instead of degrading.
    const sessionRepo = yield* SessionRepository
    const loadResult = yield* pipe(
      sessionRepo.getTree(input.sessionId),
      Effect.map((tree) =>
        tree?.nodes?.length
          ? (tree.nodes.map(toProjectedNode) as readonly ProjectedSessionNodeInput[])
          : undefined,
      ),
      Effect.catchAll((error) => {
        logger.warn(
          'Failed to load persisted transcript nodes for thread continuity; proceeding without handoff',
          {
            sessionId: input.sessionId,
            runId: input.runId,
            error: error instanceof Error ? error.message : String(error),
          },
        )
        return Effect.succeed(undefined)
      }),
      Effect.either,
    )
    const persistedTranscriptNodes = loadResult._tag === 'Right' ? loadResult.right : undefined

    return yield* agentKernel.run({
      session: preflight.session,
      runId: input.runId,
      payload,
      model: input.model,
      toolPermissionMode: preflight.toolPermissionMode,
      ...(input.promptDelivery ? { promptDelivery: input.promptDelivery } : {}),
      ...(input.noTools ? { noTools: input.noTools } : {}),
      signal: input.signal,
      onEvent: input.onEvent,
      ...(preflight.skillToggles ? { skillToggles: preflight.skillToggles } : {}),
      ...(preflight.mcpSettings ? { mcpSettings: preflight.mcpSettings } : {}),
      ...(preflight.standardsContext ? { standardsContext: preflight.standardsContext } : {}),
      ...(persistedTranscriptNodes ? { persistedTranscriptNodes } : {}),
      ...(input.resumeRun ? { resumeRun: input.resumeRun } : {}),
    })
  })
}
