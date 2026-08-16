# Debug Session: tool-model-routing
- **Status**: [OPEN]
- **Issue**: Tool executions still appear in OpenRouter logs as `poolside/laguna-xs-2.1` even when the app should route `read` to `bytedance-seed/seed-2.0-mini` and code-editing tools to `tencent/hy3`.
- **Debug Server**: http://127.0.0.1:7779/event
- **Log File**: `.dbg/trae-debug-log-tool-model-routing.ndjson`

## Reproduction Steps
1. Trigger a `read` tool call from the OpenWaggle app.
2. Trigger a code-editing tool call such as `write`, `edit`, or `multiedit`.
3. Inspect OpenRouter logs and verify which upstream model is actually used.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | The Turing Machine provider hook never sees the approved tool model because the permission-resolution custom message is not present in the provider request context. | High | Low | Pending |
| B | The tool execution path for `read` and editing tools bypasses the guarded permission flow, so `request.model` is never set. | High | Low | Pending |
| C | The provider payload model is overwritten after our extension runs, restoring `turing-machine` and causing backend fallback to Laguna. | Medium | Medium | Pending |
| D | The edited tools are not the tool names we matched, so the router falls back to the default Laguna model. | Medium | Low | Pending |
| E | The backend receives the concrete model but another upstream aliasing layer rewrites it before the OpenRouter request. | Low | Medium | Pending |

## Log Evidence
- Instrumentation added in:
  - `src/main/adapters/pi/tool-permission-request-extension.ts`
  - `src/main/ipc/agent-handler.ts`
  - `src/main/adapters/pi/turing-machine-tool-selection-extension.ts`
  - `/Users/shashankv/Projects/backend/src/turing-machine/turing-machine.service.ts`
- The debug server started successfully at `http://127.0.0.1:7779/event`.
- The env file was created at `.dbg/tool-model-routing.env`.
- No `.dbg/trae-debug-log-tool-model-routing.ndjson` file was created after reproduction.
- This means none of the instrumented code paths emitted events during the observed run.

## Verification Conclusion
- Hypothesis A: ✅ Confirmed by code-path inspection. The renderer only restores the tool-specific model from `details.request.model`, but the permission extension was not serializing the `request` object into `details`.
- Hypothesis B: ❌ Rejected as the primary root cause. Guarded tool routing logic exists and unit coverage confirms it selects the intended models.
- Hypothesis C: Secondary effect. Once the resumed permission flow lost the concrete model, the runtime/provider path naturally fell back to the session model alias and then Laguna.
- Hypothesis D: ❌ Rejected as the primary root cause. Tool-name routing coverage passes for `read` and editing tools.
- Hypothesis E: ❌ Rejected as the primary root cause. Backend only falls back to Laguna when it receives the `turing-machine` alias instead of a concrete model.

## Fix Applied
- Mirrored the permission `request` payload into `details.request` in `src/main/adapters/pi/tool-permission-request-extension.ts`.
- Added assertions so the permission result payload now includes `details.request.model` for `bash` and `read`.
- Revalidated focused unit coverage for:
  - `src/main/adapters/pi/__tests__/tool-permission-request-extension.unit.test.ts`
  - `src/renderer/src/features/chat/lib/__tests__/tool-permission-request.unit.test.ts`
  - `src/main/adapters/pi/__tests__/turing-machine-tool-selection-extension.unit.test.ts`
