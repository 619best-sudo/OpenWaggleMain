[OPEN] Tool model final request debugging

## Session

- Session id: `tool-model-final-request`
- Goal: prove which model reaches the final Turing Machine backend request and why Laguna still appears for all tool-driven calls.

## Symptoms

- Tool routing logs show:
  - `read -> bytedance-seed/seed-2.0-mini`
  - `edit/write -> tencent/hy3`
  - `bash -> poolside/laguna-xs-2.1`
- OpenRouter logs still show Laguna for all calls.
- Existing debug evidence reaches the permission-resolution IPC handoff, but not the final provider/backend request boundary.

## Hypotheses

1. The real request path bypasses `before_provider_request`, so OpenWaggle-side payload overrides never execute.
2. `before_provider_request` executes, but the outgoing request body is rebuilt later and overwrites the overridden model with the active run model.
3. The final backend request originates from a different process or endpoint than the currently instrumented `backend/src/turing-machine/turing-machine.service.ts`.
4. The tool-model override is stored correctly for permission flows, but follow-up tool execution requests do not read the same hidden/custom session entry or queue state.
5. The active Turing Machine provider/model alias is transformed downstream and collapses concrete per-tool models back to Laguna before the OpenRouter HTTP call is sent.

## Instrumentation Plan

- Add a last-mile OpenWaggle probe immediately before the Turing Machine HTTP request is constructed/sent.
- Add a backend probe that records the exact final request body model sent to OpenRouter.
- If necessary, add a Pi runtime probe on the provider request path used by the installed patched package.

## Evidence To Collect

- Whether `before_provider_request` fires for the same run that produced the tool call.
- The exact `payload.model` after every local override and immediately before the backend request.
- The exact backend DTO `model` and final OpenRouter `body.model`.
- Whether those values differ across `read`, `edit`, and `bash`.
