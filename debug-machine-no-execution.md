# Debug Session: machine-no-execution

Status: OPEN

## Symptom

- Machine mode shows planning activity, then the chat content vanishes.
- The remaining timeline says all planned tasks finished successfully.
- No expected repository/file changes were actually made.

## Expected

- Approved machine tasks should execute concrete repo changes.
- The transcript should retain the visible user request plus assistant-side timeline.
- Success should only be shown when actual task execution completes meaningfully.

## Hypotheses

1. The approved machine task loop is running, but the underlying agent result is being interpreted as success even when it only returns text/thinking without any real tool-backed change.
2. The machine task prompt is reaching the agent, but hidden custom-message delivery or transcript projection is causing the visible run content to disappear, making execution look blank even when the run is active.
3. Machine run completion is being marked from transport lifecycle events or persisted state transitions before the branch/session snapshot actually reflects task-side changes.
4. The approved plan path is loading stale or mismatched machine state from branch UI state, so the run ends against an old plan while the current requested task never actually executes.
5. A renderer refresh/workspace reconciliation step is dropping the visible task transcript and leaving only the persisted plan card, masking a task failure or no-op execution.

## Evidence Log

- Confirmed from runtime logs that approved machine task execution does run.
- Main-process evidence:
  - The approved task dispatched normally.
  - The task returned `outcome: success`.
  - The latest assistant text at task return time was a tool handoff payload, not a normal natural-language completion.
- Renderer evidence:
  - Hidden planner prompt + planner JSON response are filtered as intended.
  - Remaining visible assistant task messages stayed in the transcript.
  - The synthetic original-request row was inserted too late, after assistant task rows, which caused task transcript to appear above the user prompt and left the timeline card below it.

## Current Conclusion

- Hypothesis 1: Partially confirmed. Machine mode can still mark a task successful while the latest assistant text is a tool-handoff payload.
- Hypothesis 2: Reframed and confirmed. Transcript projection was the immediate cause of the “everything moved above my prompt” symptom.
- Hypothesis 3: Not currently supported by evidence.
- Hypothesis 4: Not currently supported by evidence.
- Hypothesis 5: Confirmed for transcript composition.

## Additional Evidence

- New renderer evidence from debug points `G/H/I/J` confirms the ordering bug starts before row insertion:
  - `resolveTranscriptMessages(...)` produced assistant task rows first and the matching original user request last.
  - The matching request arrived as a live optimistic user message id like `optimistic-user-...`.
  - Because that user row already existed, `buildChatRows(...)` correctly set `hasVisibleOriginalRequest = true` and did not synthesize a replacement.
  - `buildChatRows(...)` then placed the machine timeline after that late user row, so the final rendered order remained assistant task transcript -> user request -> machine card.
- Representative pre-fix evidence:
  - Debug point `G` showed `transcriptMessages` ordered as assistant task rows followed by `optimistic-user-1783076487021-1`.
  - Debug point `H` showed `hasVisibleOriginalRequest: true` and `lastUserRowIndex: 8`.
  - Debug point `J` showed the final grouped rows still ordered with assistant rows at indexes `0..7`, the user request at `8`, and the machine timeline at `9`.

## Fix Applied

- Added transcript normalization in `session-workspace-transcript.ts` to move a late machine original-request user message before the first visible assistant message when it arrives out of order.
- Added a focused regression test covering the exact machine-mode shape where the original request survives only as a late optimistic user message after assistant task rows.

## Verification

- `pnpm vitest run src/renderer/src/features/chat/lib/__tests__/session-workspace-transcript.unit.test.ts src/renderer/src/features/chat/hooks/__tests__/useBuildChatRows.summaries.unit.test.ts`
  - Passed: `2` files, `18` tests.

## Follow-up Symptom

- After the ordering fix, the user confirmed the request/timeline order was corrected.
- A second transcript leak remained: a raw assistant payload like `[TOOL_HANDOFF] {"type":"tool_handoff", ...}` was still visible in the machine transcript/card area.
- Existing main-process debug evidence already showed this payload as the latest assistant text at machine task completion.

## Follow-up Fix

- Added assistant-text detection for internal tool-handoff payloads in `chat-message-text.ts`.
- Updated transcript filtering to remove assistant messages that are machine-only `[TOOL_HANDOFF]` payloads when a machine plan is active.
- Added a focused regression test proving the tool-handoff payload is hidden while normal assistant task text remains visible.

## Verification Update

- `pnpm vitest run src/renderer/src/features/chat/lib/__tests__/session-workspace-transcript.unit.test.ts src/renderer/src/features/chat/hooks/__tests__/useBuildChatRows.summaries.unit.test.ts`
  - Passed: `2` files, `19` tests.

## Next Step

- Verify the transcript-ordering fix and tool-handoff filtering together in a live reproduction and compare post-fix `G/H/I/J` logs.
- If success-with-tool-handoff still causes false positives after ordering is stable, add a second fix to tighten machine task completion criteria.
