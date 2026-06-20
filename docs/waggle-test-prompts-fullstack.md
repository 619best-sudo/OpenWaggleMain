# Fullstack Waggle Test Prompts

Use this file to test the built-in Waggles on a fresh product that includes:

- public website
- backend API
- database

This pack is useful when you want to test cross-surface behavior instead of only isolated website or backend work.

## Recommended Fresh Project Shape

The ideal fixture looks like this:

- website app
  - homepage
  - pricing or features section
  - signup or contact form
- backend API
  - auth endpoint
  - create/list resource endpoints
  - one admin-only or protected action
- database
  - at least two related tables
  - seed data
  - one list query that can become slow with more rows

Example domain:

- product: `WaggleFlow`
- public website: marketing homepage with signup form
- app domain: projects and teammates
- backend: login, create project, list projects, invite teammate

## MCPs To Prepare

- `playwright`
- `chrome-devtools`
- `postman`
- `database`
- `sql`

Optional:

- `mobile-mcp` if the fullstack product also has a mobile client you want to test later

## Recommended Test Order

1. `product-planning`
2. `product-ui`
3. `backend-systems`
4. `qa-debug`
5. `development-qa`
6. `security-audit`
7. `performance-inspector`
8. `launch-readiness`

## 1. `product-planning`

### Primary Prompt

```text
We are starting a fresh fullstack product called WaggleFlow.

The MVP includes:
- a public homepage
- signup CTA
- backend login
- project creation
- project listing
- teammate invite flow

Please create a launchable MVP plan for the website, backend, and data model together.

Define:
- MVP scope
- non-goals
- acceptance criteria
- sequence of implementation
- biggest cross-surface risks
- recommended next Waggle
```

### Follow-Up Prompts

```text
Split this into the smallest practical website phase and backend phase so they can be built cleanly in order.
```

```text
Tighten the acceptance criteria so the UI and backend Waggles can work independently without losing alignment.
```

## 2. `product-ui`

### Code Setup Needed

- homepage route exists
- signup or contact form exists, even if simple
- one stable local URL is available for the website

### Primary Prompt

```text
Build the first public website MVP for WaggleFlow in this project.

Requirements:
- homepage with hero, features, CTA, and footer
- clear "Start Free" path
- one signup or contact form surface
- responsive layout
- reusable components where reasonable

Implement the real website UI and leave clear integration points for backend-powered signup or auth flows.
```

### Follow-Up Prompts

```text
Now tighten the CTA path so the homepage more clearly leads into signup.
```

```text
Now polish the hero and signup section and make sure the focused section and full page would both audit well.
```

## 3. `backend-systems`

### Code Setup Needed

- backend server runs locally
- DB schema or migration flow exists
- seed data exists or can be created

### Primary Prompt

```text
Build the backend MVP for WaggleFlow in this project.

Requirements:
- login endpoint
- create project endpoint
- list projects endpoint scoped to the authenticated user
- teammate invite endpoint first version
- persistence for project records

Use the real backend structure and keep validation, auth, and data access explicit.
```

### Follow-Up Prompts

```text
Now tighten validation, auth boundaries, and error responses without expanding the scope too much.
```

```text
Now reduce data and migration risk, especially around invite and project ownership flows.
```

## 4. `qa-debug`

### Code Setup Needed

Seed one cross-surface bug, for example:

- homepage signup form succeeds in UI but backend rejects malformed payload
- project listing works in API but website shows stale or incomplete state
- duplicate invite behavior corrupts UI assumptions

### Primary Prompt

```text
There is a cross-surface bug in this fullstack project:
- the signup or create-project flow looks successful in the UI
- but the backend response or persisted data is inconsistent

Reproduce the issue, inspect both the UI and backend behavior, isolate the root cause, fix it safely, and verify the full path.
```

### Follow-Up Prompts

```text
Now check whether the same root cause also affects invite flow, project listing, or form error states.
```

```text
Add the smallest useful regression protection if the fix still feels fragile.
```

## 5. `development-qa`

### Primary Prompt

```text
Create and execute a structured QA plan for this fullstack product.

Cover:
- homepage CTA and signup flow
- login
- create project
- list projects
- invite teammate
- frontend validation
- backend validation
- database side effects where relevant

Use the structured QA format with test cases, execution results, severity buckets, blocked areas, and a ship recommendation.
```

### Follow-Up Prompts

```text
Add more cases for malformed requests, stale UI state, duplicate submissions, and auth failures.
```

```text
Re-run only the failed or blocked cases after the latest fixes.
```

## 6. `security-audit`

### Code Setup Needed

Useful security targets:

- `.env.example`
- auth config
- frontend form submission path
- one protected backend route
- any secret or token usage

### Primary Prompt

```text
Run a full security audit of this product across website, backend, and config.

Check for:
- leaked information in code or config
- unsafe frontend exposure
- weak auth or authorization
- insecure defaults
- unsafe logging
- weak validation
- obvious security risks in public and protected flows

Apply safe hardening where appropriate and end with the structured security report.
```

### Follow-Up Prompts

```text
Focus specifically on signup, login, invite, token handling, and environment configuration.
```

```text
Re-run the audit after hardening and tell me what remains unresolved, mitigated, or fixed.
```

## 7. `performance-inspector`

### Code Setup Needed

Useful fixture setup:

- homepage with images or a few heavy assets
- one slow or medium-cost API route
- enough database rows to expose weak list queries

### Primary Prompt

```text
Run a full performance inspection of this product across website, API, and database surfaces.

Focus on:
- homepage load and above-the-fold rendering
- signup or create-project flow latency
- slow API routes
- repeated request patterns
- slow queries or index gaps

Use the structured performance format with PI-* measurements, baseline vs observed, and a top 3 optimization plan.
```

### Follow-Up Prompts

```text
Focus only on the slowest user-facing flow from browser to backend to database, and give me the top 3 highest-value optimizations.
```

```text
Re-measure after fixes and compare the results against the original PI measurements.
```

## 8. `launch-readiness`

### Primary Prompt

```text
Assess whether this fullstack MVP is ready for a private beta launch.

Review:
- implemented website scope
- implemented backend scope
- verification coverage
- unresolved QA findings
- unresolved security findings
- unresolved performance risk
- rollout or migration concerns

End with a clear ship recommendation.
```

### Follow-Up Prompts

```text
Assume this fullstack product goes to staging tomorrow. What are the blockers versus acceptable follow-up items?
```

```text
Rewrite the result as a concise launch checklist for a human maintainer covering website, backend, and data concerns.
```

## Good Things To Observe During Fullstack Testing

- whether `product-planning` cleanly separates website and backend phases
- whether `product-ui` preserves future integration points instead of hardcoding fake flows
- whether `backend-systems` keeps API and data logic safe without overscoping
- whether `qa-debug` can reason across browser, API, and DB boundaries
- whether `security-audit` catches exposure across frontend and backend together
- whether `performance-inspector` actually follows the end-to-end request path instead of optimizing only one layer
