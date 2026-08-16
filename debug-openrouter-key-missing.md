# Debug Session: openrouter-key-missing

Status: [OPEN]

## Symptom

- Backend returns `502 "OPENROUTER_API_KEY not configured"` even though the user says they already entered the OpenRouter key.

## Scope

- Investigate key persistence, provider auth state, and backend/upstream env wiring.

## Hypotheses

- H1. The key was entered in the renderer UI but was not persisted into the main-process auth storage.
- H2. The key was persisted, but GreatX/Turing Machine does not read from that storage and instead expects a separate environment variable.
- H3. The backend is running in a different process/environment from the app, so the saved key never reaches it.
- H4. The request path is still selecting an upstream OpenRouter-backed model/config even when the UI shows `GreatX Backend`.
- H5. The error classifier is masking a more precise backend-misconfiguration/auth-storage problem as `provider-down`.

## Evidence Log

- Pending.

## Next Step

- Inspect OpenRouter key save flow, auth storage lookup, and GreatX provider/backend configuration path without changing business logic.
