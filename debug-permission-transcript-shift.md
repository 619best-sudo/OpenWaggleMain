[OPEN] Permission Transcript Shift

## Session
- Session ID: `permission-transcript-shift`
- Date: 2026-07-15
- Symptom: while a tool permission request is pending, transcript movement/repositioning causes the permission strip to disappear and the run stops.

## Falsifiable Hypotheses
1. The per-second reasoning timer triggers transcript resize events that auto-scroll the transcript and push the pending permission strip out of view.
2. The pending tool permission request is being recomputed from transcript messages and is temporarily lost during streaming updates, which unmounts the permission strip.
3. A route/session identity check in `ChatPanel` briefly fails during transcript updates, so the permission strip stops rendering even though the request still exists.
4. The permission request is not dismissed visually only; a close/dismiss path is firing in state when transcript rows re-render.
5. The run stops because approving/denying never reaches the active pending request after a transcript update changes which request is considered "latest".

## Plan
- Add instrumentation only.
- Reproduce the issue and collect pre-fix evidence.
- Identify which hypothesis is supported by logs.
- Apply the minimal fix only after evidence is collected.

## Evidence
- Confirmed Hypothesis 2.
- Pre-fix logs showed a valid pending permission request for `chatcmpl-tool-bd430f13a321ab11` in message `9d79e611-7b23-4776-99d8-34548dcdec30`.
- Immediately after a newer message `10e3a43a-8cc4-4b07-aa80-c9c21ba5fc49` became the latest transcript entry, permission discovery returned no request, the panel render gate closed, and controller state cleared the pending request.
- This means the request was dropped from state because discovery only inspected the latest message, not the latest unresolved permission request anywhere in the transcript.
- Post-fix logs exposed a second root cause for mutation-tool cases.
- `tool-permission-request.ts` logged repeated non-matching permission envelopes where `normalizedType` was `record` with top-level keys `content/details`, but either `hasDetails: false` or `detailKind/detailToolName: null`.
- Static inspection confirmed two matching code paths:
  - `src/main/utils/stream-buffer.ts` rebuilt background reconnect snapshots without preserving `toolResult.details`, which explains the `hasDetails: false` branch.
  - Some permission results preserve only nested approval metadata (`request.permission.kind === "user-approval"`) instead of the full `details.kind === "tool_permission_request"` wrapper, which explains the `detailKind/detailToolName: null` branch.

## Fix
- Updated `findLatestPendingToolPermissionRequest()` to scan backward across transcript messages and return the latest unresolved permission request instead of only searching the most recent message.
- Updated the focused unit test to preserve an older unresolved permission request when newer non-permission transcript content exists.
- Updated `src/main/utils/stream-buffer.ts` to preserve structured `toolResult.details` when building background reconnect snapshots.
- Broadened `src/renderer/src/features/chat/lib/tool-permission-request.ts` to recognize nested approval payloads in addition to the original `tool_permission_request` wrapper.
- Broadened `src/shared/utils/tool-result-state.ts` so nested approval payloads are still treated as non-concrete permission results during rendering.
- Added focused tests for stream-buffer preservation and nested-approval parsing.

## Verification
- `pnpm vitest run src/renderer/src/features/chat/lib/__tests__/tool-permission-request.unit.test.ts src/renderer/src/features/chat/lib/__tests__/reasoning-summary.unit.test.ts`
- Result: passing.
- `pnpm vitest run src/main/utils/__tests__/stream-buffer.unit.test.ts src/renderer/src/features/chat/lib/__tests__/tool-permission-request.unit.test.ts src/shared/utils/__tests__/tool-result-state.unit.test.ts`
- Result: passing.

## Next Step
- Collect one fresh reproduction to confirm:
  - the permission strip stays anchored and visible during active runs, and
  - mutation-tool permission prompts (`edit`, `write`) still surface after reconnect/stream transitions.
