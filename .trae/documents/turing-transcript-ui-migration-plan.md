# Turing Transcript UI Migration Plan

## Summary

Migrate OpenWaggle's chat transcript so the Turing phase timeline UI becomes the only supported transcript presentation for Turing runs, remove the legacy raw reasoning/tool-call transcript UI from the renderer path, and make the new phase UI the default end-to-end surface for persisted, hydrated, and live session playback.

## Current State Analysis

### What is happening today

- The Turing run persists both:
  - normal assistant/tool transcript messages into the session snapshot, and
  - a separate persisted `openwaggle.phase-transcript` custom node.
- The renderer still converts raw persisted `reasoning`, `tool-call`, and `tool-result` parts into the old inline transcript UI.
- The new phase UI exists in code (`PhaseTimelineCard.tsx`, `StreamingRunLoader.tsx`, `UserQuestionCard.tsx`) but is not wired into the production `ChatRow` pipeline.
- Session hydration currently ignores persisted phase transcript nodes, so the new UI is not restored as the canonical transcript shape after reload.
- Transcript resolution can fall back to raw `messages` or append live tail messages when viewing the branch head, which lets the legacy transcript surface reappear.

### Confirmed production gaps

1. **Turing persistence duplicates two transcript representations**
   - `src/main/adapters/turing/turing-classic-run.ts`
   - `buildRunResult(...)` writes raw appended assistant/tool messages into `sessionSnapshot.nodes` and also reattaches `phaseTranscriptNode` plus `threadSnapshotNode`.

2. **Legacy raw transcript rendering is still active**
   - `src/renderer/src/features/chat/lib/chat-message-conversion.ts`
   - `src/renderer/src/features/chat/components/AssistantMessageBubble.tsx`
   - `src/renderer/src/features/chat/components/ToolCallRouter.tsx`
   - `src/renderer/src/features/chat/components/ToolCallBlock.tsx`
   - Raw `thinking`, `tool-call`, and `tool-result` parts still render directly as assistant transcript content.

3. **The new phase UI is orphaned**
   - `src/renderer/src/features/chat/components/PhaseTimelineCard.tsx`
   - `src/renderer/src/features/chat/components/StreamingRunLoader.tsx`
   - `src/renderer/src/features/chat/components/ToolPermissionInlineCard.tsx`
   - `src/renderer/src/features/chat/components/UserQuestionCard.tsx`
   - Production `ChatRow` types and `ChatRowRenderer` do not include a `phase` row today.

4. **Hydration does not restore persisted phase transcript nodes**
   - `src/main/store/session-details/message-hydration.ts`
   - `hydrateStructuralSessionMessage(...)` handles branch and compaction summaries only.

5. **Tests already describe the intended new behavior, but production code does not match**
   - `src/main/store/session-details/__tests__/message-hydration.unit.test.ts`
   - `src/renderer/src/features/chat/hooks/__tests__/useTranscriptSection.refresh-recovery.test.tsx`
   - These tests expect hydrated `phaseTranscript` metadata / `phase` rows, but current production types and renderers do not implement that contract.

## Proposed Changes

### 1. Make persisted phase transcript a first-class hydrated message shape

#### Files

- `src/shared/types/agent.ts`
- `src/shared/types/chat-ui.ts`
- `src/shared/types/phase.ts`
- `src/main/store/session-details/message-hydration.ts`
- `src/renderer/src/features/chat/lib/chat-message-conversion.ts`
- `src/renderer/src/features/chat/lib/session-workspace-transcript.ts`

#### What

- Extend shared message metadata to include `phaseTranscript`.
- Hydrate `openwaggle.phase-transcript` custom nodes into assistant messages with `metadata.phaseTranscript` and empty parts.
- Carry `phaseTranscript` through the renderer conversion boundary into `UIMessage.metadata`.

#### Why

- The renderer needs one canonical hydrated shape for persisted phase transcript rows.
- Without metadata hydration, reloads and workspace restores fall back to old raw assistant/tool messages.

#### How

- Update `MessageMetadata` and `UIMessageMetadata` to include a typed `phaseTranscript` field.
- In `hydrateStructuralSessionMessage(...)`, decode `openwaggle.phase-transcript` and return an assistant message with empty `parts` and `metadata.phaseTranscript`.
- In `sessionToUIMessages(...)` and `workspacePathToMessages(...)`, preserve `phaseTranscript` metadata the same way branch and compaction summaries are preserved today.

### 2. Introduce a production `phase` chat row and render it by default

#### Files

- `src/renderer/src/features/chat/lib/types-chat-row.ts`
- `src/renderer/src/features/chat/hooks/useBuildChatRows.ts`
- `src/renderer/src/features/chat/components/ChatRowRenderer.tsx`
- `src/renderer/src/features/chat/components/PhaseTimelineCard.tsx`
- `src/renderer/src/features/chat/components/ChatTranscript.tsx`
- `src/renderer/src/features/chat/model/chat-panel-sections.ts`
- `src/renderer/src/features/chat/hooks/useTranscriptSection.ts`

#### What

- Add a real `phase` row type to the production chat row union.
- Convert any message with `metadata.phaseTranscript` into a `phase` chat row instead of a normal assistant bubble.
- Render `PhaseTimelineCard` from `ChatRowRenderer`.
- Thread live pending question state into phase rows so inline plan review / clarification stays inside the phase card.

#### Why

- The new UI exists but is not reachable from the production renderer.
- The new phase row must become the default visible representation for Turing transcript phases.

#### How

- Define `PhaseTimelinePhaseRow`, `PhaseTimelineToolDetail`, and a `ChatRow` variant `{ type: 'phase', ... }` in `types-chat-row.ts`.
- In `useBuildChatRows.ts`, detect `message.metadata.phaseTranscript`, transform it into one or more `phase` rows, and skip creating a legacy `message` row for that same message.
- Update `ChatRowRenderer.tsx` to render `PhaseTimelineCard`.
- Extend `ChatTranscriptSectionState` and `useTranscriptSection.ts` to expose pending user-question data / resolver needed by `PhaseTimelineCard`.

### 3. Suppress legacy raw reasoning/tool transcript rows for Turing-backed phases

#### Files

- `src/renderer/src/features/chat/lib/session-workspace-transcript.ts`
- `src/renderer/src/features/chat/hooks/useBuildChatRows.ts`
- `src/renderer/src/features/chat/lib/machine-task-transcript.ts`
- `src/renderer/src/features/chat/hooks/useAgentChat*` and reconnect-related helpers that merge persisted/live transcript state

#### What

- When a persisted phase transcript exists for a Turing run segment, prevent the matching raw assistant/tool-call transcript messages from rendering alongside it.
- Ensure live tail merge logic does not resurrect old raw rows after the phase row already exists.

#### Why

- This is the direct cause of the “two UI systems” feeling.
- The migration must enforce a single visible transcript representation.

#### How

- Treat phase transcript rows as authoritative for the corresponding Turing execution window.
- Add transcript filtering rules in `resolveTranscriptMessages(...)` or immediately before row construction to drop raw assistant/tool messages that belong to a phase already represented by `metadata.phaseTranscript`.
- Preserve plain assistant text messages that are not phase-backed.
- Keep machine-mode timeline filtering separate from Turing phase filtering so the two abstractions do not interfere.

### 4. Retire legacy transcript-only tool/reasoning components from the main transcript path

#### Files

- `src/renderer/src/features/chat/components/AssistantMessageBubble.tsx`
- `src/renderer/src/features/chat/components/ToolCallRouter.tsx`
- `src/renderer/src/features/chat/components/ToolCallBlock.tsx`
- `src/renderer/src/features/chat/components/ToolCallBlockChrome.tsx`
- `src/renderer/src/features/chat/components/ToolCallBlockParts.tsx`
- `src/renderer/src/features/chat/hooks/useMessageCollapse.ts`
- related tests under `src/renderer/src/features/chat/components/__tests__/` and `src/renderer/src/features/chat/hooks/__tests__/`

#### What

- Remove legacy transcript behavior that renders inline raw tool-call / reasoning rows as the primary transcript UI.
- Keep only reusable low-level primitives that the new phase timeline still uses internally.

#### Why

- The user explicitly wants the old UI removed, not merely hidden behind fallback conditions.
- The old assistant bubble collapse logic is built around tool-call transcript parts and is no longer the correct primary presentation model for Turing.

#### How

- Narrow `AssistantMessageBubble` to plain assistant text/media rendering only.
- Remove `ToolCallRouter` usage from the transcript bubble path.
- Reuse shared low-level render helpers only where `PhaseTimelineCard` needs them.
- Delete any now-unused old transcript components once imports are removed.
- Update or delete unit/component tests that target the legacy transcript-only behavior.

### 5. Move permission and question handling inline into the new transcript experience

#### Files

- `src/renderer/src/features/chat/hooks/use-chat-panel-controller.ts`
- `src/renderer/src/features/chat/model/chat-panel-sections.ts`
- `src/renderer/src/features/chat/hooks/useTranscriptSection.ts`
- `src/renderer/src/features/chat/components/ToolPermissionInlineCard.tsx`
- `src/renderer/src/features/chat/components/ToolPermissionDialog.tsx`
- `src/renderer/src/features/chat/components/PhaseTimelineCard.tsx`
- `src/main/adapters/turing/turing-classic-run.ts`

#### What

- Use inline phase-card presentation for pending user questions and tool permission interactions wherever the new Turing UI supports it.
- Remove transcript dependence on the older modal/dialog-first experience for Turing-specific approval steps.

#### Why

- The new UI components already model inline interaction and should become the default experience.
- Keeping approvals/questions outside the phase row weakens the migration and makes the old flow continue to leak through.

#### How

- Thread pending question and permission request state into transcript rows for the active run.
- Render `UserQuestionCard` and `ToolPermissionInlineCard` inside `PhaseTimelineCard` or adjacent `phase` rows.
- Keep modal fallback only if a non-Turing path still requires it; otherwise delete the dialog path for transcript approvals.

### 6. Align persistence and replay so the new UI survives refresh, reconnect, and branch navigation

#### Files

- `src/main/store/session-details/session-queries.ts`
- `src/main/store/session-details/message-hydration.ts`
- `src/main/store/session-details/__tests__/session-queries.unit.test.ts`
- `src/renderer/src/features/chat/hooks/__tests__/useTranscriptSection.refresh-recovery.test.tsx`
- `src/renderer/src/features/chat/hooks/__tests__/useAgentChat.*`
- `src/renderer/src/features/chat/lib/__tests__/session-workspace-transcript.unit.test.ts`

#### What

- Make session detail queries, workspace transcript resolution, and reconnect merge logic consistently preserve phase rows.

#### Why

- The migration will fail if refresh/reconnect switches the UI back to old raw transcript rows.

#### How

- Keep appending only the latest active-branch phase transcript artifact when it is outside the active path.
- Ensure reconnect/hydration logic recognizes phase metadata messages and does not flatten them back into raw assistant bubbles.
- Verify branch switching and background-run monitoring do not repopulate old tool-call rows after reconnect.

### 7. Remove dead tests and replace them with migration-accurate coverage

#### Files

- `src/renderer/src/features/chat/components/__tests__/AssistantMessageBubble.component.test.tsx`
- `src/renderer/src/features/chat/components/__tests__/ToolCallRouter.component.test.tsx`
- `src/renderer/src/features/chat/components/__tests__/ToolCallBlock.component.test.tsx`
- `src/renderer/src/features/chat/components/__tests__/PhaseTimelineCard.component.test.tsx`
- `src/renderer/src/features/chat/hooks/__tests__/useBuildChatRows.*`
- `src/renderer/src/features/chat/hooks/__tests__/useTranscriptSection.*`
- `src/main/store/session-details/__tests__/message-hydration.unit.test.ts`
- `src/main/store/session-details/__tests__/session-queries.unit.test.ts`
- `e2e/tool-call-rendering.e2e.test.ts`

#### What

- Remove tests that codify the legacy tool-call transcript UI as the main presentation.
- Add tests that assert:
  - phase transcript hydration works,
  - raw tool/reasoning rows do not appear when phase rows exist,
  - phase rows survive refresh/reconnect,
  - pending inline questions/approvals render in the new UI,
  - branch/head navigation does not re-enable the old UI.

#### Why

- Current tests are split between old production behavior and new intended behavior.
- The migration needs a clean, enforceable regression net.

## Assumptions & Decisions

- **Decision:** “Old UI” means the raw reasoning/tool-call transcript surface rendered from assistant message parts in the chat transcript.
- **Decision:** The new Turing phase timeline becomes the default and authoritative transcript surface for Turing runs.
- **Decision:** Plain user messages and plain assistant text bubbles remain part of the chat transcript; only the legacy raw reasoning/tool-call presentation is removed.
- **Decision:** Persisted `openwaggle.phase-transcript` data is the durable source of truth for completed Turing phases.
- **Assumption:** Pi-legacy support is not the desired long-term transcript UI for this migration; if a non-Turing path still emits raw tool transcript parts, it should either be migrated to the phase model or intentionally scoped out in implementation.
- **Assumption:** The currently orphaned `PhaseTimelineCard` and related tests reflect the intended target UX and should be promoted into production instead of replaced.

## Implementation Order

1. Add shared metadata support for `phaseTranscript`.
2. Hydrate persisted phase transcript nodes from main-process session data.
3. Carry phase transcript metadata into renderer `UIMessage`s.
4. Add production `phase` chat row types and render path.
5. Convert build/transcript hooks to emit `phase` rows and skip legacy message rows.
6. Inline user-question and permission interactions into the phase UI.
7. Remove old transcript tool/reasoning components from the primary transcript path.
8. Update tests and delete obsolete legacy coverage.

## Verification Steps

### Static verification

- `pnpm test:unit -- src/main/store/session-details`
- `pnpm test:unit -- src/renderer/src/features/chat`
- `pnpm test:component -- src/renderer/src/features/chat/components`
- `pnpm typecheck`
- `pnpm lint`

### Behavior verification

- Confirm a Turing run shows only phase timeline cards plus normal user/plain assistant text rows.
- Confirm no raw inline reasoning/tool-call blocks appear during:
  - fresh run,
  - page refresh / workspace reload,
  - reconnect after active run,
  - branch navigation,
  - session reopen from persisted state.
- Confirm pending plan review / clarification renders inline in the phase card.
- Confirm tool permission handling no longer surfaces the old transcript UI path.

### Regression verification

- Branch summary and compaction summary rows still render correctly.
- Machine timeline rows still render correctly and do not get mistaken for Turing phase rows.
- Waggle turn grouping remains unaffected for non-phase assistant turns.
