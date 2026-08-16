[OPEN] Overlay checkout falls back to browser

- Session ID: `overlay-web-fallback`
- Symptom: payment still opens a web page instead of staying in the in-app Dodo overlay
- Expected: checkout opens inside the Electron renderer using the Dodo overlay SDK

## Hypotheses

1. The Dodo overlay SDK throws during initialization or open inside Electron.
2. Renderer CSP still blocks a Dodo frame, script, or network origin that the SDK requires.
3. The backend-created checkout URL is valid for hosted checkout but incompatible with Dodo overlay usage.
4. The overlay opens briefly but emits a redirect or close event that leads the app down the browser fallback path.

## Evidence Log

- Pending instrumentation.
