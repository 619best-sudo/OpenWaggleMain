# Waggle Bug Seeding Checklist

Use this checklist when you want to intentionally plant realistic defects before testing:

- `qa-debug`
- `development-qa`
- `security-audit`
- `performance-inspector`
- `launch-readiness`

The goal is not to sabotage the project. The goal is to create controlled, observable defects that help you evaluate whether the Waggles behave correctly.

## Rules For Good Bug Seeding

- seed one bug at a time when possible
- keep the bug small and isolated
- avoid destructive or unrecoverable data corruption
- record exactly what you changed before testing
- prefer realistic product failures over synthetic nonsense
- remove or revert the seed after the test cycle finishes

## Seed Categories

## 1. UI Bugs

Good for:

- `product-ui`
- `frontend-ui-audit`
- `responsive-qa`
- `qa-debug`
- `development-qa`

Examples:

- button alignment breaks on narrow widths
- CTA button scrolls to the wrong section
- modal cannot close on a certain path
- form success message never appears
- long card titles overflow
- sticky header overlaps page content

How to seed safely:

- change one breakpoint rule
- remove one state transition
- break one selector or scroll target
- inject one long string into fixture content

What a good Waggle should do:

- reproduce the issue
- locate the owning surface
- describe visual impact clearly
- fix or report it with evidence

## 2. Backend Logic Bugs

Good for:

- `backend-systems`
- `qa-debug`
- `development-qa`
- `launch-readiness`

Examples:

- invite route allows duplicates
- project listing leaks another user's records
- validation lets malformed payloads through
- audit log write silently fails
- unauthorized route skips one guard

How to seed safely:

- remove one validation rule
- weaken one ownership check
- skip one write or transaction step
- mis-handle one error path

What a good Waggle should do:

- reproduce from API or code
- isolate likely root cause
- explain impact
- fix or report with severity

## 3. Security Bugs

Good for:

- `security-audit`
- `launch-readiness`
- sometimes `development-qa`

Examples:

- hardcoded API key in a config file
- secret printed in logs
- unsafe env value exposed to client code
- admin route without strong authorization
- debug mode enabled in production-like config
- weak input validation on a public route

How to seed safely:

- use fake secrets, never real ones
- keep the exposure local to a test branch
- avoid exposing real external services

What a good Waggle should do:

- identify the issue with high confidence
- classify it by severity
- harden safely when possible
- report fixed vs mitigated vs unresolved

## 4. Performance Bugs

Good for:

- `performance-inspector`
- `launch-readiness`
- sometimes `qa-debug`

Examples:

- homepage loads oversized images
- list endpoint triggers repeated queries
- DB list query lacks a useful index
- frontend renders too many cards eagerly
- form submit retries or duplicates requests
- mobile list becomes janky with seeded data

How to seed safely:

- add large but fake assets
- remove one non-critical index in a local test DB
- use larger seed data volume
- force repeated fetching in one route or screen

What a good Waggle should do:

- capture measured evidence
- identify bottlenecks, not just guess
- connect slow user experience to its likely cause
- prioritize fixes by impact

## 5. Data And Migration Bugs

Good for:

- `backend-systems`
- `qa-debug`
- `development-qa`
- `launch-readiness`

Examples:

- nullable field handled inconsistently
- migration default value is wrong
- duplicate records become possible
- seed data violates hidden assumptions
- join or relation fails on missing parent rows

How to seed safely:

- use test-only migration changes
- create seed data with one broken edge case
- avoid irreversible schema damage

What a good Waggle should do:

- spot the inconsistent assumptions
- explain data impact
- reduce rollout risk
- propose or apply the safest correction

## Best Seeds By Waggle

### `qa-debug`

Use:

- one reproducible UI or backend bug
- one clear failure path
- one realistic symptom

Best examples:

- broken form flow
- duplicate invite bug
- mobile keyboard overlap bug

### `development-qa`

Use:

- several small defects across different surfaces
- at least one blocked or untested path

Best examples:

- one UI issue
- one validation bug
- one auth edge case
- one broken empty or loading state

### `security-audit`

Use:

- one fake leaked secret
- one auth or authorization weakness
- one unsafe logging or env exposure issue

Best examples:

- fake token in config
- admin route with weak check
- unsafe client env exposure

### `performance-inspector`

Use:

- one obviously heavy UI asset or render path
- one slow endpoint
- one slow or repeated query pattern

Best examples:

- large homepage image
- repeated API request loop
- under-indexed list query

### `launch-readiness`

Use:

- a mix of unresolved medium-severity issues
- one known risk in QA, security, or performance

Best examples:

- minor responsive issues remain
- one auth concern is mitigated but not fixed
- one slow route still needs tuning

## Suggested Test Seeding Matrix

For a single realistic test cycle, seed only these:

- 1 UI bug
- 1 backend logic bug
- 1 security bug
- 1 performance bug

That is enough to test most of the important Waggle behavior without creating a noisy mess.

## Seed Recording Template

Use this before you begin:

```text
Project:
Branch:
Seed category:
Seed summary:
Files changed:
Expected symptom:
Expected Waggle to catch it:
How to revert:
```

## Revert Reminder

After testing:

- remove the seeded defect
- confirm the project returns to a clean testable state
- keep notes about which Waggle caught which issue best
