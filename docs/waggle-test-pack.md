# Waggle Test Pack

This test pack gives you practical prompts for testing the built-in Waggle apps on top of fresh projects.

Use this together with [waggle-apps.md](file:///Users/shashankv/Projects/OpenWaggleMain/docs/waggle-apps.md).

## Included Files

- `docs/waggle-test-prompts-website.md`
- `docs/waggle-test-prompts-backend.md`
- `docs/waggle-test-prompts-mobile.md`
- `docs/waggle-test-prompts-fullstack.md`
- `docs/waggle-bug-seeding-checklist.md`

## How To Use This Pack

1. Start with a fresh but runnable project.
2. Make sure the project can boot locally before you launch any Waggle.
3. Install the MCPs required by the Waggle you want to test.
4. Copy one primary prompt from the relevant domain file.
5. Run the listed follow-up prompts after the first Waggle turn sequence finishes.
6. Record:
   - what the Waggle changed or reported
   - whether the agent roles behaved correctly
   - whether the output format matched the built-in contract
   - whether the MCP actually got used when expected

## Common Project Setup

For any fresh project, make sure these are true before testing:

- the repo starts locally with `pnpm`
- there is a clear local run command such as `pnpm dev`, `pnpm start`, or `pnpm preview`
- environment variables are documented in a local `.env.example`
- there is at least one meaningful user flow to test
- logs are readable and the app fails loudly enough to debug
- the project path is selected in OpenWaggle settings

## MCP Setup Matrix

- `playwright`
  - needed for UI build, UI audit, responsive QA, and some QA/debug flows
  - project must expose a stable local URL
- `chrome-devtools`
  - needed for web performance inspection
  - Chrome must be installed and the site must be reachable locally
- `mobile-mcp`
  - needed for mobile QA, debugging, and performance inspection
  - simulator or emulator should already be booted
- `postman`
  - needed when QA or performance testing API behavior
  - provide `POSTMAN_API_KEY` and, if needed, a local collection or environment
- `database`
  - useful for debugging and QA on backend or data flows
  - configure a project-level database MCP config
- `sql`
  - useful for performance inspection of query cost and data-access patterns
  - configure read-only SQL access where possible

## What To Verify For Every Waggle

- `Role behavior`
  - Agent A and Agent B should behave according to the built-in prompt
- `Turn flow`
  - Agent A should go first, Agent B should respond correctly, and later turns should stay on-role
- `MCP usage`
  - the Waggle should actually use the MCPs that matter for the task
- `Output contract`
  - structured sections like `TC-*`, `PI-*`, severity buckets, or ship recommendations should appear when required
- `Useful result`
  - the Waggle should produce either a real code change, a meaningful report, or a clear next action

## Recommended Testing Order

For each fresh project, use this order:

1. `product-planning`
2. build Waggle for that domain
   - website: `product-ui`
   - backend: `backend-systems`
   - mobile: `product-ui`
3. verification Waggle
   - `qa-debug` or `development-qa`
4. `security-audit`
5. `performance-inspector`
6. `launch-readiness`

## Extra Packs

- `docs/waggle-test-prompts-fullstack.md`
  - use when you want to test browser, API, and database behavior together in one product flow
- `docs/waggle-bug-seeding-checklist.md`
  - use when you want to intentionally plant realistic defects before testing QA, security, or performance Waggles

## Expected Fresh Project Shapes

- Website project
  - React, Next.js, or another local web app
  - at least one route and one meaningful section to build or revise
- Backend project
  - API server with at least one database-backed flow
  - health endpoint, create/read/update flow, auth or admin boundary if possible
- Mobile project
  - React Native or Expo app preferred
  - at least three screens and one API-backed flow

## Notes

- These prompts are designed for manual product testing, not benchmark scoring.
- If you want deterministic comparisons, keep fixture data and environment state stable between runs.
- For screenshot-driven Waggles, store any reference images inside the project or attach them through the UI before starting the run.
