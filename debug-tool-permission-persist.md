# Debug Session: tool-permission-persist
- **Status**: [CLOSED]
- **Issue**: After a tool permission is approved and the tool runs, revisiting the thread still shows the tool as requested instead of completed.
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-tool-permission-persist.ndjson

## Reproduction Steps
1. Trigger a permission-gated tool call in a thread.
2. Approve the permission so the tool continues and completes.
3. Switch to another thread.
4. Return to the original thread.
5. Observe whether the tool row still renders as requested.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | The final approved tool result is not persisted into the session projection after resume. | High | Medium | Rejected: persisted replay includes the resumed concrete tool result. |
| B | The resumed execution persists a tool result, but it uses a different `toolCallId` than the original permission request. | High | Low | Confirmed: persisted transcript stores the approved rerun under a new `toolCallId`, leaving the original request row unresolved. |
| C | Session hydration or UI message conversion drops or reshapes the final tool result on reload. | Medium | Low | Rejected: hydration and UI conversion preserve the resumed concrete result once present. |
| D | Renderer row-building binds the stale permission placeholder instead of the later concrete result after revisit. | Medium | Low | Rejected as primary cause: row-building behaves correctly when the final result is attached to the original `toolCallId`. |

## Log Evidence
- Pre-fix logs show the original permission request persisted under one `toolCallId` and the approved rerun persisted under a second `toolCallId`.
- `session-queries.ts` evidence captured both the permission-request result and the later resumed result in the same active path after reload.
- `chat-message-conversion.ts` confirmed both persisted IDs survive session-to-UI conversion.
- `useBuildChatRows.ts` confirmed the renderer nests correctly when the final result is attached to the original `toolCallId`.
- Fix implemented in hydration:
  - consume approved hidden `openwaggle.tool-permission-resolution` custom nodes
  - suppress internal resume assistant tool-call turns
  - remap resumed concrete tool results back onto the original permission-request `toolCallId`
- Instrumentation added at:
  - `src/main/adapters/pi/agent-kernel/run-lifecycle.ts`
  - `src/main/store/session-details/session-queries.ts`
  - `src/renderer/src/features/chat/lib/chat-message-conversion.ts`
  - `src/renderer/src/features/chat/hooks/useBuildChatRows.ts`
- Runnable regression:
  - `pnpm vitest run src/main/store/session-details/__tests__/message-hydration.unit.test.ts`

## Verification Conclusion
- Root cause fixed in hydration/persistence replay.
- Follow-up fix applied for revisit rendering:
  - hide the internal approved-permission resume assistant tool-call from session tree/workspace hydration so `transcriptPath` cannot reintroduce it
  - remove renderer render-path debug probes from `chat-message-conversion.ts` and `useBuildChatRows.ts`
  - remove temporary transcript debug logging added in `useTranscriptSection.ts` and `session-workspace-transcript.ts`
- Additional follow-up fix applied for revisit scrolling:
  - stop the pending scroll-restore retry loop from repeatedly forcing the transcript back to bottom when the cached scroll target is deeper than the current rendered thread
  - keep the pending restore target for future content growth, but allow manual scrolling immediately
- Renderer-state evidence from debug point `E` confirmed the remaining regression:
  - the initial session-detail render still contained concrete tool results
  - once `activeWorkspace.transcriptPath` took over, `tool_result` nodes in the session tree had no hydrated `message`, so the rerender dropped every tool result and left only tool-call rows
- Follow-up fix applied for workspace replay:
  - hydrate `tool_result` session-tree nodes as visible transcript messages in `src/main/store/sessions/node-hydration.ts`
- Focused verification passed:
  - `pnpm vitest run src/main/store/session-details/__tests__/message-hydration.unit.test.ts src/main/store/sessions/__tests__/node-hydration.unit.test.ts src/renderer/src/features/chat/lib/__tests__/session-workspace-transcript.unit.test.ts src/renderer/src/features/chat/hooks/__tests__/useBuildChatRows.tool-calls.unit.test.ts`
  - `pnpm vitest run -c vitest.component.config.ts src/renderer/src/features/chat/hooks/__tests__/useChatScrollBehaviour.autoscroll.component.test.tsx`
- Debug instrumentation removed after confirmation.
- User-confirmed result: approved tools stay completed after thread revisit/rerender, and old-thread scrolling no longer gets stuck.
