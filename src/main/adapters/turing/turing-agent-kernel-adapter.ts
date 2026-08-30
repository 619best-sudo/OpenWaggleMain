import { randomUUID } from 'node:crypto'
import { Layer } from 'effect'
import * as Effect from 'effect/Effect'
import { resolveModel } from 'turing-harness'
import {
  type AgentKernelForkSessionResult,
  type AgentKernelNavigateTreeResult,
  AgentKernelService,
  type AgentKernelSessionInput,
  type CompactAgentKernelSessionInput,
  type CreateAgentKernelSessionResult,
  type ForkAgentKernelSessionInput,
  type NavigateAgentKernelSessionInput,
} from '../../ports/agent-kernel-service'
import { runTuringSession } from './turing-classic-run'
import { resolveTuringModelSlug } from './turing-llm-config'
import { buildSessionSnapshotFromMessages } from './turing-message-projection'
import { buildTuringContextUsageSnapshot } from './turing-thread-snapshot'

function toAgentKernelError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error))
}

function sessionId(input: AgentKernelSessionInput) {
  return input.session.piSessionId ?? randomUUID()
}

/**
 * The current conversation projected back to a snapshot. These operations are
 * pi-native no-ops for turing-harness, but their results are persisted (and
 * `persistSnapshot` REPLACES the tree), so they must echo the existing
 * conversation rather than an empty tree — otherwise they would erase history.
 */
function currentSnapshot(input: AgentKernelSessionInput) {
  return buildSessionSnapshotFromMessages(input.session.messages)
}

/**
 * turing-harness implementation of the {@link AgentKernelService} port.
 *
 * Covers the classic (single-agent) run path — the primary prompt→response flow
 * — by driving a turing-harness {@link runTuringSession}. `getContextUsage` is
 * real here: it estimates the context the next run's first hop will carry, from
 * the persisted per-run snapshot nodes. The pi-native session
 * operations that turing-harness has no equivalent for (branching session tree
 * navigation, forking, context compaction) are provided as graceful no-ops so
 * the app stays fully functional; waggle (multi-model) runs are explicitly
 * rejected rather than silently downgraded.
 */
export const TuringHarnessAgentKernelLive = Layer.succeed(
  AgentKernelService,
  AgentKernelService.of({
    createSession: (_input): Effect.Effect<CreateAgentKernelSessionResult, Error> =>
      // Session creation only mints a piSessionId. The expensive harness build
      // (MCP client spawn + skill registration + file-memory index) happens in
      // `checkoutWarmProjectSession` at run time, OR eagerly in the background
      // via the `project-memory:prewarm` IPC — fired from the renderer on
      // project open / model change (see `useWorkspaceLifecycle`). Prewarming
      // here with a guessed model ref would overwrite the correctly-keyed spare
      // with a mismatched one, so we deliberately do NOT prewarm at create time.
      Effect.sync(() => ({ piSessionId: randomUUID() })),

    run: (input) =>
      Effect.tryPromise({
        try: () => {
          if (input.waggle) {
            return Promise.reject(
              new Error(
                'Waggle (multi-model) runs are not supported by the turing-harness kernel yet.',
              ),
            )
          }
          return runTuringSession(input)
        },
        catch: toAgentKernelError,
      }),

    // The composer meter for a turing thread: the size of the context the NEXT
    // run will carry (wrapped envelope + the step ledger's continuity block)
    // against the resolved model's window. Unknown slugs get the harness's
    // permissive default descriptor — the same fallback the chain runs against.
    getContextUsage: (input) =>
      Effect.succeed(
        buildTuringContextUsageSnapshot({
          persistedTranscriptNodes: input.persistedTranscriptNodes,
          contextWindow: resolveModel(resolveTuringModelSlug(input.model)).contextWindow,
        }),
      ),

    getSessionSnapshot: (input) =>
      Effect.succeed({
        piSessionId: sessionId(input),
        sessionSnapshot: currentSnapshot(input),
      }),

    compact: (input: CompactAgentKernelSessionInput) =>
      Effect.succeed({
        summary: '',
        firstKeptEntryId: '',
        tokensBefore: 0,
        piSessionId: sessionId(input),
        sessionSnapshot: currentSnapshot(input),
      }),

    navigateTree: (
      input: NavigateAgentKernelSessionInput,
    ): Effect.Effect<AgentKernelNavigateTreeResult, Error> =>
      Effect.succeed({
        piSessionId: sessionId(input),
        sessionSnapshot: currentSnapshot(input),
        cancelled: true,
      }),

    forkSession: (
      input: ForkAgentKernelSessionInput,
    ): Effect.Effect<AgentKernelForkSessionResult, Error> =>
      Effect.succeed({
        piSessionId: sessionId(input),
        sessionSnapshot: currentSnapshot(input),
        cancelled: true,
      }),
  }),
)
