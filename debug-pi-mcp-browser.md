# Debug Session: pi-mcp-browser

Status: OPEN

## Symptom

- MCP server appears enabled in Settings, but the agent still says it cannot open Chrome or access `chrome-devtools`.

## Expected

- In an OpenWaggle chat session with MCP enabled, the model should receive usable browser/MCP tools and stop falling back to file/bash-only responses.

## Notes

- No new runtime evidence collected yet.
- Next step is hypothesis-driven instrumentation or runtime inspection only.

## Hypotheses

- A: Pi runtime services build a valid MCP runtime context, but the generated runtime config does not expose usable tools at session startup.
- B: The session binds extensions successfully, but the final registered tool list still excludes MCP/browser tools.
- C: The prompt path receives only built-in tools even after session creation, so the model never sees MCP capability at send time.
- D: MCP server startup or metadata hydration fails later, after session creation.
- E: Tool registration succeeds, but model-facing tool prompt assembly drops MCP tools.

## Instrumentation

- `src/main/adapters/pi/pi-provider-catalog.ts`
  - Logs runtime context creation and generated MCP runtime config.
- `src/main/adapters/pi/pi-session-lifecycle.ts`
  - Logs the tool list immediately after extension binding.
- `src/main/adapters/pi/agent-kernel/run-lifecycle.ts`
  - Logs the tool list immediately before `session.prompt(...)`.

## Evidence

- `.dbg/trae-debug-log-pi-mcp-browser.ndjson`
  - Result: empty after reported reproduction

## Hypothesis Status

- A: INCONCLUSIVE
  - No runtime log emitted from `createPiRuntimeServices(...)`.
- B: INCONCLUSIVE
  - No runtime log emitted after extension binding.
- C: INCONCLUSIVE
  - No runtime log emitted before `session.prompt(...)`.
- D: POSSIBLE
  - Current test may have run in an app instance that does not contain the instrumented code.
- E: POSSIBLE
  - Not testable yet because no instrumented runtime path executed.

## Current Assessment

- The modified code path did not execute in the environment the user tested.
- Most likely causes:
  - The user tested an installed/build copy instead of the app started from this checkout.
  - The app was not restarted after the instrumentation was added.

## Local Launch Attempt

- Tried launching the repo app from this checkout with:
  - isolated user data dir
  - single-instance bypass enabled
- Result:
  - build completed
  - Electron process crashed in this IDE environment during sandbox/GPU startup
  - no app-side session evidence was collected from the isolated launch

## Revised Assessment

- The debug server and instrumentation are ready.
- The remaining evidence must come from one reproduction in the user's normally running repo dev app after a full restart.

## Evidence-Based Analysis

| ID | Hypothesis | Status | Evidence Summary |
|----|------------|--------|------------------|
| A | Runtime context is not created for the actual run | CONFIRMED | Log lines 6, 8, 11, 13, 16 show `loadMcpAdapter: true` but `hasMcpRuntimeContext: false` and `generatedConfig: null`. |
| B | Session extension binding completes but MCP tools are not registered | CONFIRMED | Log lines 7, 9, 12, 14, 17 show tool list remains only `read`, `bash`, `edit`, `write`. |
| C | Prompt path still receives only built-in tools | CONFIRMED | Log line 10 shows `toolNames` only contain the built-in four immediately before `session.prompt(...)`. |
| D | Adapter is effectively disabled at runtime despite existing MCP server config | CONFIRMED | Live file inspection shows `~/.pi/agent/settings.json` has `"packages": []` while `~/.pi/agent/mcp.json` contains `chrome-devtools`. |
| E | Model prompt assembly drops already-registered MCP tools | REJECTED | MCP tools were never registered in the session, so prompt assembly is not the first failure point. |

## Root Cause

- OpenWaggle had MCP server config present, but the `pi-mcp-adapter` package source was not enabled in `~/.pi/agent/settings.json`.
- Because of that, `prepareRuntimeContext(...)` returned `null`, no MCP runtime context was created, and Pi registered only the built-in tools.

## Fix

- Runtime now auto-enables the MCP adapter when there are active configured MCP servers.
- If there are no active MCP servers, behavior stays unchanged and MCP remains off.

## Follow-up Evidence

- After the first fix, runtime logs changed:
  - MCP runtime context started being created
  - generated MCP config contained `settings.directTools = true`
  - but session tool registration still stayed at only `read`, `bash`, `edit`, `write`

## Second Root Cause

- `createPiRuntimeServices(...)` created `settingsManager` before runtime-context preparation.
- Pi's `SettingsManager.fromStorage(...)` snapshots settings on construction.
- So even after OpenWaggle wrote the adapter package source into Pi settings, the already-created `settingsManager` still exposed the old package list during service creation.

## Second Fix

- `createPiRuntimeServices(...)` now calls `settingsManager.reload()` after preparing a non-null MCP runtime context and before creating session services.
- This keeps behavior minimal while making the adapter package visible to Pi in the same run.

## Instrumentation Follow-up

- A later instrumentation update caused a regression:
  - `agent:send-message` failed with `TypeError: Cannot read properties of undefined (reading 'keys')`
  - root cause was debug logging assuming `extensionsResult.runtime.commands` and `flagValues` always existed
- Fixed by guarding those fields before calling `.keys()`
- This was instrumentation-only and not part of the MCP runtime behavior itself

## Final Evidence

- Runtime now confirms:
  - MCP runtime context is created
  - generated config contains `chrome-devtools`
  - Pi settings include `extensions/pi-mcp-adapter`
  - but extension loading fails before registration
- Confirmed extension error:
  - `Failed to load extension: Cannot find module '@modelcontextprotocol/ext-apps/app-bridge'`
  - require stack points into `~/.pi/agent/extensions/pi-mcp-adapter/metadata-cache.ts`

## Final Root Cause

- OpenWaggle installed `pi-mcp-adapter` by copying the package directory into `~/.pi/agent/extensions/pi-mcp-adapter`.
- That copy no longer sat inside the original package dependency graph, so Node could not resolve adapter runtime dependencies such as `@modelcontextprotocol/ext-apps`.
- Because the extension failed at import time, Pi registered only the built-in tools.

## Final Fix

- The bundled MCP adapter is now installed as a directory symlink to the bundled package instead of a raw copied directory.
- This preserves normal Node package resolution for the adapter's runtime dependencies with minimal behavior change.

## Post-Fix Evidence

- Runtime logs now show:
  - `extensionErrors: []`
  - loaded extension path includes `~/.pi/agent/extensions/pi-mcp-adapter/index.ts`
  - session tool list includes direct tools such as `chrome_devtools_navigate_page`, `chrome_devtools_take_snapshot`, and others
  - proxy tool `mcp` is also still present
- Session transcript shows the model successfully used `mcp` to navigate and take snapshots, proving the adapter is functional.
- Remaining issue:
  - the model sometimes still chooses the proxy `mcp` tool and sends malformed JSON in the stringified `args` field
  - this is less reliable than calling the already-available direct `chrome_devtools_*` tools

## Final Polishing Fix

- Runtime defaults now also set `settings.disableProxyTool = true` when OpenWaggle injects `directTools: true`, unless the user explicitly chose a proxy setting.
- This keeps direct MCP tools available while removing the brittle proxy path from the model's default toolset.
