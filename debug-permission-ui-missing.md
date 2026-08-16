# Debug Session: permission-ui-missing

Status: OPEN

## Symptom
- Expected: when a guarded tool requests permission in `ask` or `ask-edit` mode, the app should pause and show an inline permission card in the transcript.
- Actual: tools continue running and no permission UI appears.

## Scope
- Repo: `/Users/shashankv/Projects/OpenWaggleMain`
- Related runtime: permission interception, transcript permission extraction, renderer permission surface

## Initial Hypotheses
1. The active permission mode is effectively `allow-all`, so no permission request event is emitted at all.
2. The main-process permission extension is not attached for the current run path, so guarded tools bypass interception.
3. Permission requests are emitted, but the renderer does not detect them from transcript messages.
4. Permission requests are detected, but the transcript surface is suppressing or not rendering the inline card.
5. A stale app build is running, so the latest renderer changes are not present in the active UI.

## Evidence Plan
- Instrument the main-process permission interception point.
- Instrument the renderer permission-request extraction and render conditions.
- Reproduce with `ask` / `ask-edit` mode and inspect runtime logs before changing logic.
