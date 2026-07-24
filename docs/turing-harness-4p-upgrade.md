# turing-harness 4P upgrade — OpenWaggle integration changes

turing-harness gained several output-contract and orchestration changes. This
doc lists what changed in the library and exactly what OpenWaggle must adapt.
The app consumes the library via `file:../turing-harness` and rebuilds it on
every `dev`/`build`/`test` (`prepare:turing-harness`), so the new types are
available automatically — only the code that *reads* the changed fields needs
updating.

## Library changes (turing-harness)

1. **Output contract consolidated.** Every phase now ends with the same trailer:
   `SUMMARY:` (full briefing / card), `UI SUMMARY:` (short styled user-facing
   status), `TOOL CHAIN:` (curated continuity). The old **`CHAT SUMMARY`**,
   **`TOOL TRANSCRIPT`** (Prepare), and **`DEBUG_LOGS`** (Plan) markers were
   **removed** from the contract (still parsed as legacy fallbacks).
   - `PhaseResult.uiSummary` is the new styled short summary.
   - `PhaseResult.toolChain` (`ToolChainEntry[]`) and `PhaseResult.handoff`
     (`PhaseHandoff`) are new continuity fields.
   - `artifacts.chatSummary` is **gone**; `artifacts.uiSummary` replaces it.

2. **Multiple plans + execution order.** Plan may emit `PLANS_JSON`
   (multi-repo/complex tasks) in addition to the legacy `PLAN_JSON`. Both
   normalize into `PhaseResult.planSet: { plans: PlanDocument[]; executionOrder:
   string[] }`. When there are multiple plans, the orchestrator runs **one
   Perform pass per plan, in execution order** — i.e. the event stream emits
   several `perform` `phase_start`/`phase_end` pairs in a single iteration.

3. **Complexity inheritance.** Prepare's per-file complexity and Plan's per-task
   complexity flow to later phases. Every `PermissionRequest` now carries
   `complexityRating` (`low`|`medium`|`high`) and `complexitySource`
   (`estimated`|`prepare-file`|`plan-task`) alongside the existing
   `complexity` (0..1 + signals).

4. **Permission `option`.** `PermissionRequest.options?: PermissionOption[]` and
   `PermissionDecision.option?: string` let the host offer/echo named choices.
   `PermissionDecision.model` already accepts any OpenRouter slug.

5. **Perfect QA plan.** `PhaseResult.qaPlan: { stack?; checks: QaCheck[] }` — the
   tech-stack QA plan Perfect derived and verified. `FIX` on failure is now a
   plan-like handoff.

6. **`defineSkill(...)`** export — first-class, phase-scoped skill registration
   (parallel to `connectMcpServer`).

## Required OpenWaggle changes

### 1. Summary resolution — `uiSummary` (correctness; `chatSummary` is gone)
- `src/main/adapters/turing/turing-classic-run.ts` → `resolvePersistedPhaseSummary`
- `src/main/adapters/turing/turing-event-mapper.ts` → `resolvePhaseSummary`

Prefer `result.uiSummary` (then `display.summary`, then `summary`), keeping
`artifacts.chatSummary` only as a legacy fallback. Without this the styled short
chip silently degrades to the full `summary`.

### 2. Multi-plan (`planSet`) + multiple Perform passes
- `src/shared/types/stream.ts` → add `planSet?`, `qaPlan?` to
  `AgentTransportPhaseEndEvent`.
- `src/shared/types/phase.ts` → add `planSet?`, `qaPlan?` to `AgentPhaseEntry`
  and `PersistedPhaseTranscriptPhase`.
- `turing-event-mapper.ts` → emit `planSet`/`qaPlan` on `phase_end`.
- `src/main/agent/phase-tracker.ts` → carry `planSet`/`qaPlan` into the entry.
- `turing-classic-run.ts` → persist `planSet`/`qaPlan` in the transcript node.
- Renderer (`PhaseTimelineCard.tsx`) → render `planSet` (flatten to the existing
  plan preview when present, else `planJson`); show `qaPlan` checks in Perfect.

Multiple `perform` phases per iteration already work (the event mapper indexes
phase occurrences); multi-plan just produces more of them.

### 3. Permission complexity + options
- `src/shared/types/tool-permission.ts` → add `complexity?`, `complexityRating?`,
  `complexitySource?` to `ToolPermissionRequestEnvelope` (+ optional `option`).
- `turing-classic-run.ts` permission callback → populate those from `request`,
  and pass `option`/`model` back in the decision. **[done]**
- Renderer permission card → show the complexity rating/source. **[done]** —
  `ToolPermissionInlineCard` (a `ComplexityChip`) and `ToolPermissionDialog`
  render the rating + source when the harness attaches one.

### 4. Skills registration via `defineSkill` — **[done]**
`turing-openwaggle-bridge.ts` registers each active skill through
`defineSkill({ id, name, description, phases, tools })` instead of a hand-rolled
provider object, so skills land in exactly the declared phases and get skill
metadata.

### 5. Optional (not yet needed)
- Surface `toolChain`/`handoff` if a dedicated continuity view is desired (the
  data now flows through `PhaseResult`; no UI consumes it yet).

## Regression fixes (post-upgrade)

Two regressions were reported after the upgrade and fixed:

1. **Clarification (`ask_user_question`) stopped appearing for vague prompts.**
   The prompt consolidation had demoted the "ask when unsure" instruction to a
   single bullet, so the (weak) planner model stopped asking. **Fix (library):**
   added a prominent `CLARIFY BEFORE PLANNING (do this FIRST)` directive to the
   PLAN prompt — the planner now calls `ask_user_question` and waits before
   producing a plan whenever the request is genuinely ambiguous.

2. **After plan approval, Perfect didn't start — "run stopped in the middle."**
   Root cause was not the 4P loop (verified: Perform→Perfect always run after
   approval). It was that a **host event subscriber throwing** — e.g. the event
   mapper on a phase result carrying the new `planSet`/`qaPlan` fields —
   propagated synchronously out of the orchestrator's `emit()` and aborted the
   whole chain. **Fixes:**
   - *Library:* `Orchestrator.emit` and `HarnessAgent.emit` now isolate each
     subscriber in a try/catch, so a throwing listener can never terminate a run
     (a rogue listener only loses its own event; it's logged).
   - *App:* `turing-event-mapper.emitPhaseEnd` converts `planSet`/`qaPlan`/
     `planJson` through a defensive `safeJson()` so a malformed value can't throw
     out of the mapper and drop the `phase_end` event (which would make the phase
     card fail to render).
