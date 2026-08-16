# [OPEN] openrouter-401-auth

## Summary
- Symptom: direct `openrouter/...` provider runs fail with `401 Missing Authentication header`.
- Goal: confirm whether OpenWaggle/Pi is resolving the wrong OpenRouter credential for direct provider usage.

## Hypotheses
1. The saved `openrouter` credential is not a real OpenRouter API key.
2. `greatx-backend` works because it uses a different auth path than direct `openrouter/...`.
3. Direct `openrouter/...` provider runs are reading a JWT-like local token and forwarding it upstream.
4. The selected OpenRouter model is not the issue; auth resolution is.

## Evidence Plan
- Inspect the current local OpenRouter credential shape.
- Compare that with the known-good `greatx-backend` path.
- Confirm the direct-provider failure is auth-related, not model-related.
