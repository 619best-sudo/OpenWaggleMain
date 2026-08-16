# Chat Transcript Bugs

## Problem

Two related renderer chat transcript bugs were observed in OpenWaggle:

1. Repetitive assistant messages
   - The transcript could show duplicate assistant rows for what was logically the same assistant turn.
   - This happened most often when reconnect snapshots overlapped with a live cached assistant row during or after a reconnect/background-stream scenario.

2. User prompt disappears after send
   - A just-sent user prompt could vanish from the transcript immediately after send.
   - The prompt reappeared only after later assistant streaming updates caused another render.

## Initial Hypotheses Investigated

### 1. Workspace Transcript Projection

Hypothesis:
- The active transcript was being rebuilt from `SessionWorkspace.transcriptPath`.
- If the workspace snapshot lagged or had no stable active node yet, the in-memory unsaved tail might be dropped.
- That would explain the optimistic user row disappearing until later stream activity.

Conclusion:
- Not the primary root cause.
- The transcript projection layer was mostly rendering whatever `messages` it received.
- It could expose stale upstream state, but it was not the layer causing the prompt to disappear.

### 2. Reconnect Merge Too Conservative

Hypothesis:
- Background reconnect/live merge logic was treating a persisted assistant row and a live assistant row as different messages because they had different ids.
- That would explain repeated assistant rows when reconnect snapshots and live render snapshots overlapped.

Conclusion:
- This hypothesis was directionally correct, but the earlier attempted fix was too broad.
- The real problem was not just "different ids"; it was that reconnect merge needed to ignore renderer-local assistant identity noise while still avoiding fuzzy dedupe.

## Actual Root Cause

### Root Cause 1: Optimistic User Prompt Disappearance

Wrong layer:
- `optimistic message cache`

File:
- `src/renderer/src/features/chat/hooks/useAgentChat.message-cache.ts`

What was happening:
- `sendUserPayload(...)` appended the optimistic user message immediately.
- But `setMessagesForSession(...)` had been changed to defer the React state publish with `requestAnimationFrame`.
- That introduced a timing gap where other state updates, especially `status` changes, could rerender the UI before the new `messages` state was visible.
- During that gap, `useTranscriptSection(...)` received stale `messages`, so the optimistic user row temporarily disappeared.

Why it looked like a transcript projection bug:
- `useTranscriptSection(...)` resolves transcript rows from the `messages` array plus workspace state.
- When `messages` was stale, the transcript looked wrong even though the resolver itself was not the source of the bug.

### Root Cause 2: Duplicate Assistant Rows

Wrong layer:
- `reconnect merge`

File:
- `src/renderer/src/features/chat/lib/chat-reconnect-merge.ts`

What was happening:
- The reconnect snapshot and the live cached assistant row could represent the same assistant turn with different ids.
- The live row could also contain renderer-local details that do not exist in persisted snapshots, especially:
  - `thinking.stepId`
  - transient tool states such as `output-available` vs persisted terminal equivalents
  - merged/split assistant tool rows from live vs persisted representations
  - part ordering differences
- If reconnect merge failed to treat those as the same logical turn, it preserved the stale live assistant row alongside the persisted reconnect row.
- The transcript then rendered both rows.

What was not wrong:
- `stream event application` was not the root cause. It correctly built live assistant rows from transport events.
- `chat row rendering` was not the root cause. It correctly rendered the resolved transcript rows.
- `workspace transcript projection` was not the root cause for this symptom either; it simply surfaced an already incorrect merged message list.

## Solution

### Fix 1: Restore Synchronous Message Cache Publication

File:
- `src/renderer/src/features/chat/hooks/useAgentChat.message-cache.ts`

Change:
- Removed `requestAnimationFrame` batching from `setMessagesForSession(...)`.
- Restored immediate calls to:
  - `setMessagesBySessionId(...)`
  - `setRunRenderMessages(...)`

Reason:
- Optimistic chat rows must publish synchronously so the transcript cannot temporarily rerender with stale `messages`.
- This is the smallest safe fix because it corrects the broken layer directly without changing transcript projection semantics.

### Fix 2: Keep Reconnect Merge Strict but Normalize Renderer-Local Noise

File:
- `src/renderer/src/features/chat/lib/chat-reconnect-merge.ts`

Change:
- Treat renderer-local `thinking.stepId` as non-semantic for assistant identity.
- Normalize equivalent terminal tool-result states.
- Support same-turn assistant chain matching for persisted split tool rows versus live merged tool rows.
- Preserve strict same-turn matching rather than broad fuzzy dedupe.

Reason:
- The fix must avoid accidentally collapsing distinct assistant turns.
- Matching is intentionally limited to same logical assistant-turn structure, not approximate text similarity.

## Final Layer Verdict

- `optimistic message cache`: wrong for the disappearing user prompt
- `workspace transcript projection`: not the root cause
- `reconnect merge`: wrong for duplicate assistant rows
- `stream event application`: not the root cause
- `chat row rendering`: not the root cause

## Tests Added Or Updated

1. Production-mode optimistic message publication
   - File: `src/renderer/src/features/chat/hooks/__tests__/useAgentChat.message-cache.unit.test.ts`
   - Covers immediate optimistic row publication without `requestAnimationFrame` deferral.

2. Reconnect duplicate assistant dedupe with live `thinking.stepId`
   - File: `src/renderer/src/features/chat/lib/__tests__/useAgentChat.utils.unit.test.ts`
   - Covers same-turn assistant dedupe where only live renderer-local thinking identity differs.

3. Existing reconnect and transcript tests were kept green
   - Includes reconnect tool-chain and transcript-projection coverage.

## Validation

Command run:

```bash
pnpm vitest src/renderer/src/features/chat/hooks/__tests__/useAgentChat.message-cache.unit.test.ts src/renderer/src/features/chat/lib/__tests__/useAgentChat.utils.unit.test.ts src/renderer/src/features/chat/lib/__tests__/session-workspace-transcript.unit.test.ts src/renderer/src/features/chat/hooks/__tests__/useAgentChat.reconnect.unit.test.ts src/renderer/src/features/chat/hooks/__tests__/useAgentChat.foreground-run.unit.test.ts
```

Result:
- 5 test files passed
- 29 tests passed

## Takeaways

- Optimistic transcript state must publish synchronously at the renderer cache boundary.
- Reconnect merge must normalize renderer-only assistant identity details, but it should stay strict and turn-aware.
- Transcript projection is downstream of message state quality; if upstream state is stale or duplicated, the transcript will faithfully show the wrong thing.
