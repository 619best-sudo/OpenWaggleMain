# Plan: cut first-prompt latency from 20–30s by parallelizing MCP + prewarming the bridge

## Summary

Today, every first prompt on a thread pays 20–30 s of setup work in front of the LLM call. The largest single contributor is MCP stdio cold-starts: each enabled server is spawned and JSON-RPC-handshaked **sequentially** in [turing-openwaggle-bridge.ts#L160-L170](file:///Users/shashankv/Projects/OpenWaggleMain/src/main/adapters/turing/turing-openwaggle-bridge.ts#L160-L170), and this work runs **inside the prompt turn** instead of at project open / new-thread time. turing-harness itself has the same sequential pattern in [project-presets.ts#L321-L337](file:///Users/shashankv/Projects/turing-harness/src/presets/project-presets.ts#L321-L337).

This plan does two things:

1. **Parallelize** MCP stdio spawns at every layer (OpenWaggle bridge, turing-harness preset bridge).
2. **Prewarm the bridge** — move the MCP + skills attach from the first prompt to the existing prewarm window that already fires on project open, model change, and (after this change) new-thread click.

Net effect: in the common case, the first prompt hits an already-wired session and the LLM is called with no MCP spawn cost at all. Worst case (cold session, config changed) goes from `sum(spawn_times)` to `max(spawn_times)`.

---

## Current state analysis

### Where MCP attach runs today

| Layer | File | Line | Pattern |
|---|---|---|---|
| OpenWaggle bridge | `src/main/adapters/turing/turing-openwaggle-bridge.ts` | L160-L170 | `for…of` with `await session.addMcpServer(options)` |
| turing-harness preset | `src/turing-harness/src/presets/project-presets.ts` | L321-L337 | same `for…of` with `await session.addMcpServer(options)` |
| turing-harness session | `src/turing-harness/src/session.ts` | L191-L194 | `connectMcpServer(opts)` (independent per call) → `registry.add(provider)` (sync) |

Each `addMcpServer` triggers [McpClient.start](file:///Users/shashankv/Projects/turing-harness/src/mcp/client.ts#L55-L97) which is a full `child_process.spawn` + JSON-RPC `initialize` + `tools/list` round-trip. There is no shared mutable state across servers, so the calls are parallel-safe.

### Where prewarm runs today

Renderer triggers [`triggerProjectMemoryPrewarm`](file:///Users/shashankv/Projects/OpenWaggleMain/src/renderer/src/features/settings/state/preferences-store-actions.ts#L40-L48) at:
- App boot — `loadSettings()` if saved projectPath exists
- Project open / select-folder — `setProjectPath()`
- Model change — `setSelectedModel()`

Main-side [`prewarmProjectMemory`](file:///Users/shashankv/Projects/OpenWaggleMain/src/main/adapters/turing/turing-memory-prewarm.ts#L138-L183) currently:
1. Builds a `Harness` + project session
2. Uses `connectMcp: false`, `fileMemoryRuntime: { autoStartHydration: false }` — explicitly skips MCP
3. Returns a `WarmProjectSession` with no MCP clients and no skill providers

The bridge's [`attachOpenWaggleRuntime`](file:///Users/shashankv/Projects/OpenWaggleMain/src/main/adapters/turing/turing-openwaggle-bridge.ts#L130-L215) is only called from [`runTuringSession`](file:///Users/shashankv/Projects/OpenWaggleMain/src/main/adapters/turing/turing-classic-run.ts#L106-L109), i.e. on the first prompt.

### Where the runtime cache lives

[`turing-openwaggle-runtime-cache.ts`](file:///Users/shashankv/Projects/OpenWaggleMain/src/main/adapters/turing/turing-openwaggle-runtime-cache.ts) is a `WeakMap<Session, {signature, result}>` keyed by the `Session` object. Because the same `Session` object survives the `spareSessions → assignedSessions` transition in [turing-memory-prewarm.ts#L222-L228](file:///Users/shashankv/Projects/OpenWaggleMain/src/main/adapters/turing/turing-memory-prewarm.ts#L222-L228), the cache naturally survives a prewarm-to-first-prompt hand-off. No signature-coupling changes are needed.

### What "new thread" does today

[`useSessionNav.ts#handleNewSession`](file:///Users/shashankv/Projects/OpenWaggleMain/src/renderer/src/features/sessions/hooks/useSessionNav.ts#L58-L61) only calls `startDraftSession(projectPath)` — pure UI state, no IPC. The spare is replenished by [`replenishWarmSpare`](file:///Users/shashankv/Projects/OpenWaggleMain/src/main/adapters/turing/turing-memory-prewarm.ts#L196-L198) only after the previous run consumed it.

---

## Proposed changes

### Part A — turing-harness library (apply in `../turing-harness`)

#### A.1 Parallelize the preset MCP attach

File: [src/turing-harness/src/presets/project-presets.ts](file:///Users/shashankv/Projects/turing-harness/src/presets/project-presets.ts), [L321-L337](file:///Users/shashankv/Projects/turing-harness/src/presets/project-presets.ts#L321-L337).

Replace the `for…of` with `Promise.allSettled` so preset MCP servers spawn in parallel. Same per-entry try/catch, same `setProviderPhases`, same report shape (`connected`, `failed`).

Sketch:

```ts
if (opts.connectMcp) {
  const results = await Promise.allSettled(
    preset.mcp
      .filter((entry) =>
        (!opts.include || opts.include.includes(entry.id)) &&
        !opts.exclude?.includes(entry.id),
      )
      .map(async (entry) => {
        const options = entry.build(ctx)
        if (!options) {
          report.skipped.push({
            id: entry.id,
            reason: `missing config${entry.requires ? ` (${entry.requires.join(", ")})` : ""}`,
          })
          return null
        }
        try {
          const item = await session.addMcpServer(options)
          session.setProviderPhases(item.id, entry.phases)
          report.connected.push(entry.id)
          return item.id
        } catch (err) {
          report.failed.push({ id: entry.id, error: (err as Error).message })
          return null
        }
      }),
  )
  // Promise.allSettled never rejects at the top level; individual failures are
  // already captured in report.failed, so no further handling is required.
  void results
}
```

Why: the preset path is what `Harness.createProjectSession({ connectMcp: true })` uses. Once OpenWaggle moves the attach into prewarm, future variants that opt into turing-harness's preset-managed MCP also benefit.

#### A.2 Add timing logs to McpClient.start

File: [src/turing-harness/src/mcp/client.ts](file:///Users/shashankv/Projects/turing-harness/src/mcp/client.ts#L55-L97).

Add a `Date.now()` before `spawn` and after `tools/list`, log the deltas with `id` + `command` + `args`. Optional, low-risk, gives us field telemetry for the change.

Why: lets the next dev see actual per-server cost in dev:debug logs without instrumenting from outside. Same log line used by OpenWaggle and any other consumer.

#### A.3 (Optional) Add `connectMcpServers(servers: McpServerOptions[]): Promise<ProviderListItem[]>` to Session

File: [src/turing-harness/src/session.ts](file:///Users/shashankv/Projects/turing-harness/src/session.ts#L191-L194), add after `addMcpServer`.

```ts
async connectMcpServers(servers: McpServerOptions[]): Promise<ProviderListItem[]> {
  return Promise.all(servers.map((opts) => this.addMcpServer(opts)))
}
```

Why: a single API call that's explicitly named for the parallel case, instead of consumers building `Promise.all(s.map(s => session.addMcpServer(s)))` themselves. Not strictly required if every consumer parallelizes via `Promise.allSettled` directly, but removes a footgun.

### Part B — OpenWaggle (apply in this repo)

#### B.1 Parallelize the bridge attach

File: [src/main/adapters/turing/turing-openwaggle-bridge.ts](file:///Users/shashankv/Projects/OpenWaggleMain/src/main/adapters/turing/turing-openwaggle-bridge.ts#L160-L170).

Replace the sequential `for…of` with `Promise.allSettled` over the enabled server list. Preserve the `BridgeIssue` shape (`mcp-fail` on individual errors, no top-level throw), and preserve the `clearExistingOpenWaggleRuntime` semantics (still clear first; the parallel is only on the spawn). Skill registration stays sequential (it's a sync `registry.add` loop and the bodies are already in memory).

Why: this is the immediate, library-free win. N servers paying 500 ms each become 1 × 500 ms instead of N × 500 ms.

Update the existing test at [turing-openwaggle-bridge-cache.unit.test.ts](file:///Users/shashankv/Projects/OpenWaggleMain/src/main/adapters/__tests__/turing-openwaggle-bridge-cache.unit.test.ts) to add a `'spawns MCP servers in parallel'` case using a `vi.fn()` whose resolution order is shuffled to prove the new code path doesn't serialize.

#### B.2 Extend prewarm to attach MCP + skills

File: [src/main/adapters/turing/turing-memory-prewarm.ts](file:///Users/shashankv/Projects/OpenWaggleMain/src/main/adapters/turing/turing-memory-prewarm.ts#L138-L183).

Change `prewarmProjectMemory(projectPath, modelRef?)` → `prewarmProjectMemory(projectPath, { modelRef?, mcpSettings?, standardsContext? })`. Inside `createWarmProjectSession`, after `harness.createProjectSession`, call `attachOpenWaggleRuntime(session, { mcpSettings, standardsContext })` with a try/catch that logs but does not throw. Add two fields to `WarmProjectSession`:
- `bridgeAttached: boolean`
- `bridgeSignature: string | null`

Why: this is the second half of the win. Once B.1 is in, the bridge work is fast, but it still runs on the prompt turn. Moving it to prewarm means the prompt turn's `attachOpenWaggleRuntime` hits the existing WeakMap cache (`getCachedRuntimeAttachment` at [turing-openwaggle-runtime-cache.ts#L51-L57](file:///Users/shashankv/Projects/OpenWaggleMain/src/main/adapters/turing/turing-openwaggle-runtime-cache.ts#L51-L57)) and returns in microseconds.

Note on signature: the cache is `WeakMap<Session, …>`, so when the spare is consumed by `checkoutWarmProjectSession` ([L222-L228](file:///Users/shashankv/Projects/OpenWaggleMain/src/main/adapters/turing/turing-memory-prewarm.ts#L222-L228)) the same `Session` object is moved from `spareSessions` to `assignedSessions` and the cache entry survives.

#### B.3 Make the prewarm call site accept runtime data

File: [src/main/ipc/project-handler.ts](file:///Users/shashankv/Projects/OpenWaggleMain/src/main/ipc/project-handler.ts#L88-L97).

Change the `project:prewarm-memory` handler signature from `(projectPath, modelRef?)` to `{ projectPath, modelRef?, mcpSettings?, standardsContext? }`, validate, forward to `prewarmProjectMemory`. Effect-style update, no other handler logic changes.

File: [src/shared/types/openwaggle-api.ts](file:///Users/shashankv/Projects/OpenWaggleMain/src/shared/types/openwaggle-api.ts).

Add a `PrewarmProjectMemoryInput` type and update the IPC contract:

```ts
interface PrewarmProjectMemoryInput {
  projectPath: string
  modelRef?: string
  mcpSettings?: McpSettingsView
  standardsContext?: AgentKernelStandardsContext
}
project:prewarm-memory: (input: PrewarmProjectMemoryInput) => Promise<void>
```

Mirror the change in [src/preload/api.ts](file:///Users/shashankv/Projects/OpenWaggleMain/src/preload/api.ts) and its unit tests.

#### B.4 Renderer: send runtime in prewarm

File: [src/renderer/src/features/settings/state/preferences-store-actions.ts](file:///Users/shashankv/Projects/OpenWaggleMain/src/renderer/src/features/settings/state/preferences-store-actions.ts#L40-L48).

`triggerProjectMemoryPrewarm` becomes async and loads `mcpSettings` + `standardsContext` for the project before calling `api.prewarmProjectMemory({ projectPath, modelRef, mcpSettings, standardsContext })`. Use existing IPC selectors for both. Wrap the body in a try/catch and never `await` from the caller (fire-and-forget).

File: [src/renderer/src/features/sessions/hooks/useSessionNav.ts](file:///Users/shashankv/Projects/OpenWaggleMain/src/renderer/src/features/sessions/hooks/useSessionNav.ts#L58-L61).

`handleNewSession` and `handleSelectProjectPath` call `triggerProjectMemoryPrewarm(projectPath, currentModel)` after `startDraftSession`. Even if the spare is fresh, the call is a cheap no-op (the in-memory prewarm returns the cached spare).

#### B.5 Prewarm the run-pathside too (defense in depth)

File: [src/main/application/agent-run/preflight.ts](file:///Users/shashankv/Projects/OpenWaggleMain/src/main/application/agent-run/preflight.ts#L51-L79).

After successfully loading `mcpSettings` + `standardsContext` in the preflight, fire a non-blocking prewarm keyed by `(projectPath, mcpSettings, standardsContext)` if the spare is missing. This is the safety net for the case where the user opens a project, never changes model, and immediately types — the renderer-side prewarm is also called, but a main-side one means the work still happens even if the renderer crashes or skips it.

#### B.6 Diagnostics

Add a single `logger.info` line at the start and end of `attachOpenWaggleRuntime` with `{ mode: 'cold' | 'fast-path', ms, mcpCount, skillCount, signature }`. The `mode` makes the fast-path hit visible in dev:debug logs, and `ms` makes the per-attach cost measurable. Same log line serves as the regression signal.

---

## Assumptions & decisions

- **Parallel is safe.** Each `addMcpServer` is an independent `McpClient` with its own child process. `registry.add` is sync. No race. `Promise.allSettled` (not `Promise.all`) so one bad server doesn't fail the whole attach.
- **The existing WeakMap cache is the right reuse mechanism.** It is already keyed by `Session` and the same `Session` survives `spare → assigned`. No new cache layer needed.
- **Prewarm failures must be best-effort.** If MCP can't connect during prewarm, the spare ships without it; the run-path bridge retries. Wrapping the bridge call in `try/catch` in `createWarmProjectSession` enforces this. The existing `mcp-fail` issue reporting is preserved.
- **Skill registration stays sequential.** It's a sync loop over already-in-memory bodies, not an I/O bottleneck. Don't fan it out.
- **Phase-level tool gating is intentionally out of scope.** Skill tools are pinned to all four phases at [turing-openwaggle-bridge.ts#L189](file:///Users/shashankv/Projects/OpenWaggleMain/src/main/adapters/turing/turing-openwaggle-bridge.ts#L189). MCP providers default to all four phases. The orchestrator in turing-harness will hide tools the LLM shouldn't see via Phase policy; the user has confirmed this is a separate, later concern.
- **No turing-harness API change required for the main win.** B.1 + B.2 + B.3 + B.4 are sufficient. A.1 (turing-harness preset parallelization) and A.3 (Session.connectMcpServers) are quality-of-life follow-ups.

---

## Verification

1. `pnpm typecheck` — must be green after B.3 type changes.
2. `pnpm test:unit -- turing-openwaggle-bridge turing-memory-prewarm` — must pass. Add a `'spawns MCP servers in parallel'` unit test that uses a shuffled-resolution `vi.fn()` to prove no serialization.
3. `pnpm test:unit -- turing-openwaggle-bridge-cache` — the existing cache tests should be unchanged in count, only the underlying call order changes.
4. `pnpm test:integration` — for any IPC wiring changes (B.3, B.4).
5. `pnpm dev:debug` with `pnpm prepare:turing-harness` (so A.1 lands in the linked local package). Manual measurement:
   - Open DevTools, filter on `turing-memory-prewarm` / `turing-bridge` log lines.
   - Cold project open: should see a single `bridge attach cold mode` log with `ms` < 2000 (down from 20-30 s today) for a 3-MCP-server setup.
   - First prompt of a new thread: should see `bridge attach fast-path mode` (cache hit) with `ms` < 5.
   - Toggle an MCP server off and back on: should see a second `bridge attach cold mode` (signature change forces re-attach) but still parallel.

---

## Execution order (when plan is approved)

1. B.1 — OpenWaggle bridge parallelize (1 file + 1 test). Immediately measurable on first prompt.
2. A.1 — turing-harness preset parallelize (1 file in `../turing-harness`). Then `pnpm prepare:turing-harness`.
3. A.2 — turing-harness timing logs (1 file). Optional, low-risk.
4. B.2 — OpenWaggle prewarm extension (1 file, type + new fields).
5. B.3 — OpenWaggle IPC type + handler (2 files).
6. B.4 — OpenWaggle renderer wiring (2 files).
7. B.5 — OpenWaggle preflight safety-net (1 file).
8. B.6 — OpenWaggle diagnostics log (1 file).
9. A.3 — turing-harness `connectMcpServers` convenience (1 file). Optional.

Each step is independently revertable. The first three (B.1 + A.1 + A.2) cover the bulk of the latency win and are the smallest diffs.
