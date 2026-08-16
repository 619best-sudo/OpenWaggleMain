# Debug Session: phase-flow-missing
- **Status**: [OPEN]
- **Issue**: Turing-harness responses are appearing as plain completed assistant messages instead of triggering the 4-phase transcript flow in the OpenWaggle UI.
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-phase-flow-missing.ndjson

## Reproduction Steps
1. Open the OpenWaggleMain chat UI with turing-harness enabled.
2. Send a prompt such as `change header name`.
3. Observe that the reply renders as a plain assistant message with a completed footer instead of phase cards / pending clarification flow.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | The user prompt is not entering the turing-harness classic run path at all. | High | Low | Pending |
| B | The classic run executes, but no `phase_start` / `phase_end` or custom question events reach the renderer stream. | High | Low | Pending |
| C | The events reach the renderer, but transcript hydration/build logic suppresses or bypasses phase rows and falls back to plain assistant text. | High | Medium | Pending |
| D | Background-run or completion refresh overwrites the live phase transcript state before render. | Medium | Medium | Pending |
| E | The main process persists only plain messages for this turn, so the renderer never has a phase transcript node to render after refresh. | Medium | Medium | Pending |

## Log Evidence
Instrumentation added at:
- `useAgentChat.run-controls.ts` for renderer send dispatch
- `agent-handler.ts` for main-process transport forwarding and run completion
- `turing-classic-run.ts` for snapshot assembly and transcript node placement
- `session-workspace-transcript.ts` for active workspace transcript resolution
- `useBuildChatRows.ts` for final row construction

Evidence from repro:
- Renderer phase summary advanced to `Writing` and finished with `completedPhaseCount: 2`, so the live phase tracker was active.
- `session-workspace-transcript.ts` repeatedly resolved `workspaceMessageCount: 0` and no `phaseTranscript` messages for the reproduced session.
- The persisted SQLite snapshot for session `019f9210-847f-7070-9715-13fcc2e1393f` contained only four nodes: model change, thinking level change, user message, assistant message.
- No structural Turing nodes were present in the database for that turn (`turing_bridge_status` and persisted phase transcript were both absent).
- Main runtime wiring currently binds `AgentKernelService` to `PiAgentKernelLive` in `src/main/runtime.ts`.

## Verification Conclusion
| ID | Hypothesis | Status | Evidence Summary |
|----|------------|--------|------------------|
| A | The user prompt is not entering the turing-harness classic run path at all. | ✅ Confirmed | Runtime binds `AgentKernelService` to `PiAgentKernelLive`, and the persisted session contains only Pi-style plain message nodes. |
| B | The classic run executes, but no `phase_start` / `phase_end` or custom question events reach the renderer stream. | ❌ Rejected as primary cause | The renderer phase summary advanced and completed; the run path is alive, but it is not the Turing snapshot path. |
| C | The events reach the renderer, but transcript hydration/build logic suppresses or bypasses phase rows and falls back to plain assistant text. | ❌ Rejected as primary cause | The renderer never received any `phaseTranscript` messages to render. |
| D | Background-run or completion refresh overwrites the live phase transcript state before render. | ❌ Rejected as primary cause | There were no structural transcript nodes in persisted storage to overwrite or recover. |
| E | The main process persists only plain messages for this turn, so the renderer never has a phase transcript node to render after refresh. | ✅ Confirmed | SQLite snapshot inspection showed only plain message nodes for the repro session. |

## Follow-up Evidence
- After routing `turing-machine/turing-machine` into `runTuringSession`, the main process began emitting `phase_start` / `phase_end` events and persisting structural nodes (`turing_bridge_status`, `openwaggle.phase-transcript`, `openwaggle.turing-thread-snapshot`).
- The active dev database (`.openwaggle-user-data-dev/openwaggle.db`) still persisted the reproduced session with:
  - `last_active_node_id = df3a53e7-1369-4fcb-a3ac-69079e813555` (bridge custom node)
  - `last_active_branch_id = 019f921e-ca71-75fe-b24c-2d3ae10a6f9e:branch:df3a53e7-1369-4fcb-a3ac-69079e813555`
  - `branch_hint_id = NULL` for the phase-transcript and thread-snapshot nodes
- This proved a second persistence bug: branch derivation was treating structural Turing nodes as selectable branch heads and was not inheriting branch hints down the structural artifact chain.
- Result: the renderer could stream live phase state transiently, but rehydrated session messages often lacked the persisted `phaseTranscript` message, so the UI fell back to plain assistant rows plus the completion footer.

## Fix Summary
- Routed `turing-machine/turing-machine` classic runs from `PiAgentKernelLive` into `runTuringSession`.
- Added a regression test to lock the kernel routing behavior.
- Retained instrumentation for post-fix verification.
- Fixed a Turing-harness TDZ crash where `failChain()` could read `planJson` before the variable was initialized during early prepare-phase failures.
- Updated session snapshot branch derivation so a structural active node resolves to its nearest conversational ancestor for branch selection, while preserving the actual structural `activeNodeId`.
- Updated branch hint derivation to inherit the active branch through structural descendants, so phase-transcript and thread-snapshot nodes rehydrate on the correct branch.
- Added regression coverage for structural active nodes and inherited branch hints in `session-queries.unit.test.ts`.
