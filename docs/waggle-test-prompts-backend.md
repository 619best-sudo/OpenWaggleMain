# Backend Waggle Test Prompts

Use this file to test the built-in Waggle apps on a fresh backend project.

## Recommended Fresh Project Setup

Use a real backend starter such as:

- `Fastify + TypeScript`
- `Express + TypeScript`
- `NestJS`

Before testing, make sure the project has:

- a working local run command such as `pnpm dev`
- a database connection
- migrations or schema setup
- seed data
- at least these routes or flows:
  - `GET /health`
  - `POST /auth/login`
  - one CRUD resource such as `/projects` or `/orders`
  - one admin-only route
- an `.env.example`
- basic logging

## MCPs To Prepare

- `postman`
- `database`
- `sql`

Optional:

- `playwright` if there is an attached admin web UI

## Test Sequence

Run the Waggles in this order:

1. `product-planning`
2. `backend-engineer`
3. `backend-systems`
4. `qa-debug`
5. `development-qa`
6. `security-audit`
7. `performance-inspector`
8. `launch-readiness`

## 1. `product-planning`

### Primary Prompt

```text
We are starting a fresh backend for a product called WaggleFlow.

The MVP needs:
- email login
- project creation
- project listing
- invite teammate flow
- simple audit log entry on important actions

Please plan a launchable backend MVP.

Define:
- MVP scope
- non-goals
- acceptance criteria
- likely routes and data model implications
- biggest backend risks
- recommended next Waggle
```

### Follow-Up Prompts

```text
Reduce this to the smallest backend slice that still supports a private beta.
```

```text
Tighten the acceptance criteria so a backend implementation Waggle can build this without guessing.
```

## 2. `backend-engineer`

### Primary Prompt

```text
Plan, implement, and verify a backend feature in this repository.

Start by reading the current backend implementation and identifying:
- which files should likely change
- which files may need to be created
- the API contracts that will be affected
- the database state that should change

Then implement the feature using the existing backend architecture in this repo.

Finally:
- compile or typecheck the affected backend code
- exercise the changed API flow with the API-call MCP
- verify the resulting database state with the database MCP

Treat this as real backend delivery, not just a design pass.
```

### Follow-Up Prompts

```text
This request is an edit to an existing backend feature. Reuse the current implementation path if possible and avoid creating a parallel duplicate flow.
```

```text
Focus verification on whether the expected records were inserted, updated, or left unchanged correctly after the API call.
```

```text
If anything is blocked, tell me the highest-value next fix and the exact compile, API, or database evidence still missing.
```

## 3. `backend-systems`

### Primary Prompt

```text
Implement a backend MVP for WaggleFlow in this project.

Requirements:
- email login endpoint
- project creation endpoint
- project listing endpoint scoped to the authenticated user
- invite teammate endpoint stub or first version
- audit log write on project creation

Use the real backend architecture and data model in this project.
Keep validation and auth boundaries explicit.
```

### Follow-Up Prompts

```text
Now tighten validation, error responses, and auth checks without expanding the scope too much.
```

```text
Now make sure project listing and invite flows are safe for future multi-user use.
```

```text
Now review the migration or schema implications and reduce rollout risk.
```

## 4. `qa-debug`

### Code Setup Needed

Keep one known backend defect or weak point for debugging, for example:

- invite route allows duplicate invites
- auth token check is skipped on one route
- audit log write silently fails
- project listing leaks another user's record in seeded data

### Primary Prompt

```text
There is a backend bug in this project:
- duplicate invites can be created for the same email and project
- the audit log is inconsistent after that happens

Reproduce the issue, isolate the likely root cause, fix it safely, and verify the result.
```

### Follow-Up Prompts

```text
Now check whether the same root cause also affects project creation or team membership logic.
```

```text
Add the smallest meaningful regression protection if the fix still feels fragile.
```

## 5. `development-qa`

### Primary Prompt

```text
Create and execute a structured QA plan for this backend project.

Cover:
- login
- project creation
- project listing
- invite flow
- auth failures
- validation failures
- database side effects where relevant

Use the structured QA format with test cases, execution results, and severity-based issue reporting.
```

### Follow-Up Prompts

```text
Add cases for duplicate requests, unauthorized access, malformed payloads, and seed-data edge cases.
```

```text
Re-run only the failed or blocked cases after fixes.
```

## 6. `security-audit`

### Code Setup Needed

Good backend targets for this test:

- JWT or session handling
- env-based secrets
- one admin-only route
- user-generated input persisted to the database

### Primary Prompt

```text
Run a security audit of this backend project.

Check for:
- leaked secrets in code or config
- weak auth or authorization
- insecure defaults
- unsafe logging
- weak validation
- obvious injection or trust-boundary risks
- privileged route exposure

Apply safe hardening where appropriate and produce the structured security report.
```

### Follow-Up Prompts

```text
Focus specifically on login, invite, and admin-only flows.
```

```text
Re-run the audit after hardening and tell me what remains unresolved or only mitigated.
```

## 7. `performance-inspector`

### Code Setup Needed

Useful fixture conditions:

- one list endpoint with enough rows to stress query behavior
- at least one write flow
- seeded DB with realistic data volume
- basic indexes not fully tuned yet

### Primary Prompt

```text
Run a performance inspection of this backend project.

Focus on:
- login latency
- project listing latency
- invite flow latency
- repeated query work
- obvious slow queries or index gaps
- wasteful API behavior

Use the structured performance format with PI-* measurements, baseline vs observed, and a top 3 optimization plan.
```

### Follow-Up Prompts

```text
Focus only on the slowest route and the database work behind it. Give me the top 3 highest-value performance fixes.
```

```text
Re-measure after fixes and compare the results against the original PI measurements.
```

## 7. `launch-readiness`

### Primary Prompt

```text
Assess whether this backend MVP is ready to merge or ship to a private beta environment.

Please review:
- implemented scope
- verification coverage
- unresolved QA issues
- unresolved security issues
- performance risk
- migration or rollout concerns

End with a clear ship recommendation.
```

### Follow-Up Prompts

```text
Assume this backend will go to staging tomorrow. What are the blockers versus acceptable follow-up items?
```

```text
Rewrite the result as a concise backend release checklist for a human maintainer.
```

## Optional Full-Stack Add-On

If this backend project also ships a small admin UI, you can additionally test:

- `product-ui`
- `frontend-ui-audit`
- `responsive-qa`

Use the website prompt pack for those UI-oriented flows.
