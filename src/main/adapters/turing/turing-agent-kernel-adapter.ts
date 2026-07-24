import { randomUUID } from 'node:crypto'
import { Layer } from 'effect'
import * as Effect from 'effect/Effect'
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
import { buildSessionSnapshotFromMessages } from './turing-message-projection'

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
 * — by driving a turing-harness {@link runTuringSession}. The pi-native session
 * operations that turing-harness has no equivalent for (branching session tree
 * navigation, forking, context compaction, token-usage accounting) are provided
 * as graceful no-ops so the app stays fully functional; waggle (multi-model)
 * runs are explicitly rejected rather than silently downgraded.
 */
export const TuringHarnessAgentKernelLive = Layer.succeed(
  AgentKernelService,
  AgentKernelService.of({
    createSession: (_input): Effect.Effect<CreateAgentKernelSessionResult, Error> =>
      // Prewarming is driven from the renderer with the SELECTED model (on project
      // open / model change) and replenished after each checkout with the model
      // actually used. Prewarming here with a guessed default model ref would
      // overwrite that correctly-keyed spare with a mismatched one, forcing a
      // synchronous rebuild at run time — the very latency we're avoiding.
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

    getContextUsage: () => Effect.succeed(null),

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
