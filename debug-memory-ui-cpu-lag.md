# [RESOLVED] Debug Session: memory-ui-cpu-lag

## Summary

- Symptom: Expanding `file_memory` / `project_memory` tool strips makes the whole UI laggy and choppy.
- Symptom: While memory search/tools run, the app feels generally sluggish.
- Symptom: Mouse cursor frequently shows a loader around `file_memory` search.
- Goal: Identify the actual CPU / main-thread pressure source with runtime evidence before changing business logic.

## Hypotheses

1. Expanded memory tool results mount a heavy renderer subtree that blocks the UI thread.
2. Transcript rows rerender too broadly during memory-tool streaming and expansion.
3. A global busy/loading state is toggled during memory tool search, causing the loader cursor.
4. Memory tool event/update frequency is too high through main/preload/renderer boundaries.
5. Large result normalization/highlighting is still occurring eagerly for memory results.

## Instrumentation Plan

- Add renderer-side timing/reporting around:
  - `ToolCallBlock` expansion
  - `ToolResult` rendering for `file_memory` / `project_memory`
  - `AssistantMessageBubble` / transcript row rerenders
- Add visibility into any global busy/loading cursor state if present.
- Collect pre-fix logs while reproducing:
  - run memory search
  - expand a memory tool strip
  - observe lag + loader cursor

## Evidence Log

- Debug Server running at `http://127.0.0.1:7778`.
- Env file: `.dbg/memory-ui-cpu-lag.env`
- Log file: `.dbg/trae-debug-log-memory-ui-cpu-lag.ndjson`
- Instrumentation added:
  - `src/renderer/src/features/chat/hooks/useAgentChat.stream-events.ts`
  - `src/renderer/src/features/chat/components/ToolCallBlock.tsx`
  - `src/renderer/src/features/chat/components/ToolCallBlockParts.tsx`
  - `src/renderer/src/features/chat/components/ChatTranscript.tsx`
  - `src/renderer/src/features/memory/hooks/useProjectMemory.ts`
- Waiting for pre-fix reproduction logs.

### Pre-fix Findings

- `file_memory` tool lifecycle is short and low-frequency at the transport layer:
  - `tool_execution_start` / `tool_execution_end` for `file_memory`
  - sample result size around `8830` chars
- `ToolCallBlock` / `ToolResult` normalization work for memory tool results is very small:
  - compute durations mostly `0.0ms` to `0.2ms`
  - expanded result lengths observed around `7788` to `11149`
- Renderer long tasks are real and significant:
  - observed `52ms`, `67ms`, `91ms`, `102ms`, `116ms`, `149ms`, `153ms`
- Body cursor remained `"auto"` in captured UI logs, so the visible loader is likely the OS/Electron busy cursor caused by renderer stalls, not an app-managed CSS wait cursor.
- Transcript rerender pressure is very high during streaming:
  - `streamSignalVersion` climbed rapidly while `rowsLength` and `messagesLength` barely changed
  - once a memory strip is expanded, repeated transcript rerenders keep re-entering the expanded tool block even when its own visible state is unchanged

### Hypothesis Status

1. Expanded memory tool results mount a heavy renderer subtree that blocks the UI thread.
   - Partially true.
   - Initial normalization is cheap, but keeping an expanded memory strip mounted during repeated transcript rerenders amplifies renderer cost.
2. Transcript rows rerender too broadly during memory-tool streaming and expansion.
   - Confirmed.
3. A global busy/loading state is toggled during memory tool search, causing the loader cursor.
   - Rejected as the primary cause.
   - Cursor logs stayed `auto`; this looks like busy/unresponsive cursor behavior from renderer stalls.
4. Memory tool event/update frequency is too high through main/preload/renderer boundaries.
   - Partially true.
   - Tool lifecycle events are not numerous, but transcript update cadence is still very high while the run is active.
5. Large result normalization/highlighting is still occurring eagerly for memory results.
   - Rejected as the primary cause for the measured memory tool blocks.
   - Result normalization itself is cheap in current logs.

## Conclusion

- Most likely root cause: generic transcript streaming still causes repeated rerenders while an expanded memory result subtree is mounted; the cursor loader symptom is secondary to renderer long tasks.
- Next minimal fix should target transcript row isolation / memoization boundaries for expanded tool rows, not the memory engine itself.

## Resolution

- Actual root cause was the **instrumentation itself**, which was left running in the normal (non-debug) app path and generated the long tasks it was measuring:
  - `ChatTranscript.buildTranscriptDebugPayload` ran on **every render** (via a `useMemo` keyed on the per-render `section` object) even when the debug panel was disabled — re-serializing the whole transcript on the main thread on every `streamSignalVersion` bump.
  - Two `ChatTranscript` effects `fetch()`ed to `http://127.0.0.1:7778` on every render/longtask and called `window.getComputedStyle(document.body)`, forcing a synchronous style/layout recalc each stream tick.
  - `ToolCallBlock`, `ToolCallBlockParts`, `useAgentChat.stream-events`, and `useProjectMemory` each posted to the same debug server on state changes; the stream-events one `JSON.stringify`'d full partial results on every `tool_execution_update`.
- Fix: removed all `memory-ui-cpu-lag` (port 7778) instrumentation from the 5 renderer files. Kept the user-facing transcript debug panel but made its payload lazy — only built when `transcriptDebugEnabled` is true.
- Row memoization (`TranscriptRows` + `TranscriptRow`, both deep-compared) was already correct and left unchanged; only the streaming row re-renders per tick now.
- Unrelated `debug-point` regions from other sessions (KeyEditor, provider-store, auth-handler, chat-panel-controller) were intentionally left in place.

### Follow-up: residual streaming choppiness (scroll)

After removing the instrumentation, scrolling during a tool-heavy stream was better but still choppy. Two per-stream-tick main-thread costs remained (the whole assistant bubble re-renders each tick because its `message` object is recreated):

1. **`areToolCallResultsEqual` serialized full result bodies on every tick.** `ToolCallRouter`'s memo comparator called `getToolCallResultSignature` → `JSON.stringify(result.content)` for *every* tool block, twice per comparison, each tick. With several `read`/`file_memory` results (~8–11KB each) this is O(sum of all result bytes) of string work per tick.
   - Fix (`tool-call-block.ts`): added a reference-equality fast path — the reducer (`updateAssistantParts`) preserves `content` identity for unchanged parts, so completed tool results bail out without serializing. Only the actively-streaming tool falls through to the signature compare.
2. **`StreamingText` was not memoized.** Every completed text/thinking part re-rendered each tick and re-ran `useIncrementalMarkdown` (which full-rescans when text length is unchanged).
   - Fix (`StreamingText.tsx`): wrapped in `memo`. Props are all primitives (`text`, `isStreaming`, `className`), so completed parts bail out and only the growing tail re-renders.

Verified: `typecheck:web` clean; StreamingText + ToolCallBlock component tests (30) and tool-call-block unit tests (9) pass.

### Follow-up 2: severe choppiness specifically during `read` on a file

Reported: the whole app gets *very* choppy when the `read` tool runs on a file — cost scales with file size.

- Active kernel is `TuringHarnessAgentKernelLive` (`src/main/runtime.ts`); the turing mapper emits only `tool_execution_start`/`_end` (no `tool_execution_update`), so `read` does **not** stream partial output. The file-size cost is therefore on the render/compare path, not streaming deltas.
- `read`'s result is an **object** (`{ output: "<file text>", details: {...} }`, from turing-harness `src/tools/builtin/coding.ts`), not a string.
- The remaining hot path was `areToolCallResultsEqual` (the `ToolCallRouter` memo comparator): when the fast-path reference check misses, it fell back to `getToolCallResultSignature` → `JSON.stringify(content)` over the whole file body, twice per comparison. Refs stay stable during **foreground** streaming (covered by the earlier reference fast-path), but a **background/reconnect** run re-hydrates from the DB projection on every `session.updatedAt` bump (`hydrateActiveRunSession` → `sessionToUIMessages`), rebuilding parts with value-equal-but-new references → full re-serialization of every read result per hydration.
- Fixes (`tool-call-block.ts`):
  - Restructured `areToolCallResultsEqual`: compare scalar fields first, then content by reference, then (for string content) a direct native string compare that avoids building `string:${huge}` copies.
  - Added a `WeakMap` signature cache in `stringifyComparableContent` keyed on the content object identity, so each distinct (immutable) result body is serialized at most once instead of on every render that reaches the fallback.

Note: `updateToolExecution` in `chat-stream-tool-events.ts` has a latent O(n²) (`areEquivalentPayloads` stringifies growing partial output each update) but is currently dead in prod because turing emits no update events — left as-is; revisit if a streaming kernel (pi) is re-enabled.
