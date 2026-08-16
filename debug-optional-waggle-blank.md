# Debug Session: optional-waggle-blank

Status: OPEN

## Symptom
- The optional Waggle preset can reopen as a blank thread from history.
- Other Waggle presets still render correctly.
- The issue appears tied to stopping the run mid-stream.

## Hypotheses
1. The stopped optional Waggle run fails to persist enough transcript state before history reopen, leaving only an empty session snapshot.
2. The renderer does persist a partial snapshot, but the history reopen path does not restore it for this preset because Waggle metadata/session state is missing.
3. The optional-slot preset produces a different run/session state after stop, causing the transcript row builder or metadata lookup to drop all rows.
4. The stop flow clears background run snapshots too early for this preset, so reopening history has neither persisted messages nor cached render messages to hydrate.
5. The filtered-agent/run-condition path changes the active collaboration/session ownership in a way that breaks history restoration after stop.

## Evidence Plan
- Inspect the stop + history restoration flow for Waggle-specific branches.
- Instrument the reopen/hydration path before changing business logic.
- Reproduce with the optional preset and compare pre-stop vs post-stop history-open state.

## Evidence Summary
- The renderer stop path can leave `sessionById` holding the pre-run or mid-run cached `SessionDetail`.
- Reopening from history routes through `useChatRouteEffects`, which previously reused that cached detail and did not force a fresh `refreshSession(...)` when the route already had cached session data.
- The optional preset reproduces this more easily because stopping mid-run can happen before enough transcript state is persisted to the cached session object, so reopening can render an empty thread if the cache is stale.
- Existing `useAgentChat` stop/remount coverage already showed the run snapshot path can preserve partial output; the missing handoff was the route-open refresh path, not the Waggle turn-policy logic itself.
- The stronger confirmed renderer bug is the idle hydration path for remounted sessions: when the persisted session snapshot is still empty, the cached first-send render snapshot was dropped entirely, which makes the transcript fall back to the Welcome/New Thread screen even though the session itself exists.

## Fix
- Updated `useChatRouteEffects` to call `refreshSession(routeSessionId)` whenever a concrete routed session is opened and is not marked missing.
- Added component-test coverage to prove routed sessions refresh even when a cached detail already exists.
- Updated `session-workspace-transcript` so the active-branch workspace view keeps an unsaved snapshot tail even when the workspace path and cached messages have no overlapping message ids yet.
- Added unit coverage for the no-overlap workspace/snapshot merge case.
- Updated idle remount hydration in `useAgentChat.hydration.ts` to merge cached render snapshots with empty/stale persisted sessions instead of dropping the cached first-send user/assistant state.
- Added Waggle stop/remount coverage for the case where the session still has zero persisted messages.

## Validation
- `pnpm exec vitest run -c vitest.component.config.ts src/renderer/src/routes/__tests__/-chat-route-effects.component.test.tsx`
- Result: PASS (`1` file, `4` tests)
- `pnpm exec vitest run -c vitest.unit.config.ts src/renderer/src/features/chat/lib/__tests__/session-workspace-transcript.unit.test.ts`
- Result: PASS (`1` file, `4` tests)
- `pnpm exec vitest run -c vitest.unit.config.ts src/renderer/src/features/chat/hooks/__tests__/useAgentChat.waggle-stop.unit.test.ts src/renderer/src/features/chat/lib/__tests__/session-workspace-transcript.unit.test.ts`
- Result: PASS (`2` files, `7` tests)

## Status
- READY_FOR_USER_VERIFICATION
