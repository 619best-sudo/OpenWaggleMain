# [OPEN] permission-flow

## Symptoms
- Inline tool permission popup does not appear during Turing runs.
- Composer permission preference is not respected at runtime.
- User sees the run continue in the background and only final state appears later.

## Reproduction
1. Set composer permission preference to `allow-all` or `ask-edit`.
2. Send a Turing prompt like `create html page`.
3. Observe that no inline permission popup appears.
4. Observe the run still behaves as if permission mode were `ask`.

## Hypotheses
1. Renderer preference is saved, but the application run path never passes `toolPermissionMode` into `AgentKernelService.run`.
2. Main process emits the tool-permission custom event, but the renderer listener drops it because of session mismatch or event filtering.
3. Turing maps permission mode correctly, but still requests permission for read-only tools because the bridge marks the request as mutating.
4. Inline permission UI depends on transcript rows only, while live permission requests arrive as custom transport events with no immediate transcript representation.

## Observation Points
- Renderer send path and current saved `toolPermissionMode`
- Main preflight settings snapshot
- Turing permission mode received by `runTuringSession`
- Turing custom event emission for tool permission
- Renderer custom event receipt and pending permission state
