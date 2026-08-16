# Debug Session: openrouter-key-save
- **Status**: [OPEN]
- **Issue**: Saving the OpenRouter API key in the running dev app does not work. Expected: the provider becomes configured after save. Actual: the save does not appear to stick.
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-openrouter-key-save.ndjson

## Reproduction Steps
1. Launch the isolated dev app with the stable profile.
2. Open Connections settings.
3. Enter an OpenRouter API key.
4. Save the key.
5. Observe that OpenRouter still does not appear configured.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | The OpenRouter API-key save action never fires from the renderer row. | High | Low | Pending |
| B | The renderer submits the key, but the IPC/provider-auth path rejects OpenRouter specifically. | High | Medium | Pending |
| C | The key saves, but the provider snapshot/auth refresh still reports OpenRouter as unconfigured. | Medium | Medium | Pending |
| D | The settings row writes to a different auth scope/source than the provider state reads from. | Medium | Medium | Pending |
| E | OpenRouter is not presented as a true API-key provider in this runtime state, so the wrong auth surface is used. | Medium | Low | Pending |

## Log Evidence
- First reproduction: renderer instrumentation executed, but CSP blocked fetches to `http://127.0.0.1:7777/event`.
- Terminal evidence confirms `KeyEditor.handleSave` fired and `provider-store.updateApiKey` reached its post-refresh stage.
- This rejects hypothesis `A` and makes a hard renderer-click failure unlikely.
- Renderer instrumentation was updated to `http://localhost:7777/event`, which is allowed by the current CSP.
- Second reproduction:
  - `auth:set-api-key` reached main and completed successfully.
  - Immediate writeback on the same `AuthStorage` instance showed `{ type: 'api_key' }`.
  - The next provider refresh still reported `apiKeyConfigured: false`.
- Deeper investigation:
  - `/Users/shashankv/.pi/agent/auth.json` contained the saved OpenRouter key.
  - In the sandboxed dev environment, fresh `AuthStorage.create()` instances had `loadError = EPERM: operation not permitted, mkdir '/Users/shashankv/.pi/agent/auth.json.lock'`.
  - Because Pi could not create its lock directory under the real home path, fresh auth reads started empty and provider refreshes showed OpenRouter as unconfigured.
  - Running the same Pi auth probe with `HOME=/tmp/openwaggle-dev-home` produced `loadError = null` and successful cross-instance OpenRouter key reloads.

## Verification Conclusion
- Root cause confirmed: the OpenRouter key save failure in this debug session was caused by the sandboxed dev launch using a home directory where Pi auth storage could not create its lock directory.
- Operational fix applied: relaunch the app with `HOME=/tmp/openwaggle-dev-home` so Pi auth storage can lock, persist, and reload credentials correctly in this sandbox.
- User verification: OpenRouter key saving now works in the relaunched app.
- Follow-up symptom after the save fix: chat requests still fail with `401 Missing Authentication header` for model `openrouter/openrouter/free`, which appears to be a separate runtime issue from the original settings-save bug.

## Instrumentation Points
- `A`: `KeyEditor.handleSave` logs whether the OpenRouter save button actually fires and with what draft length.
- `B`: `useProviderStore.updateApiKey` logs the renderer-side IPC dispatch and any main-handler error.
- `C`: `useProviderStore.updateApiKey` logs the refreshed provider auth state after `loadProviderModels()`.
- `D`: `auth:set-api-key` logs whether main receives the request and whether `ProviderAuthService.setApiKey(...)` completes.
