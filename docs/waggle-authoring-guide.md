# Waggle Authoring Guide

This guide defines the ingredients needed to create a successful Waggle in OpenWaggle.

Use it when you are:

- creating a new built-in Waggle
- creating a project-specific custom Waggle
- deciding which MCPs and skills a Waggle should require
- designing a Waggle that should work reliably with lower-tier models

## What A Successful Waggle Is

A successful Waggle is not just a prompt with multiple agents.

It is a workflow with:

- a clear job
- the right number of agents
- a strict handoff format
- explicit dependency rules
- honest preflight checks
- real verification
- predictable failure routing

If any of those are weak, the Waggle will feel smart in demos but unreliable end to end.

## Core Principle

Waggle should be a workflow system, not a magic autonomous team.

The best Waggles do not try to solve everything in one loop. They:

- narrow the stage of work
- reduce ambiguity
- keep each agent focused
- make the verifier stricter than the builder
- route failures back automatically

## The Ingredients

## 1. Clear Purpose

Every Waggle must answer:

- what exact problem it solves
- when it should be used
- when it should not be used

Good example:

- `mobile-build`: implement a planned mobile screen or flow

Bad example:

- "build any app end to end"

If the purpose is broad, the Waggle will overreach and become unreliable.

## 2. Narrow Lifecycle Stage

A Waggle should belong to one stage of the product/tech lifecycle:

- routing
- planning
- design
- build
- QA
- release
- deployment

The clean default lifecycle is:

1. `turing`
2. `product-planning`
3. `design-asset-direction`
4. `web-build` or `mobile-build` or `backend-build`
5. `qa-repair-loop`
6. `release-readiness`
7. `deployment`

Do not collapse all of these into one giant Waggle unless you are deliberately making an experimental preset.

## 3. Minimal Agent Count

Use the smallest number of agents that can do the job well.

Recommended defaults:

- `2 agents` for planning, design direction, release decisions
- `3 agents` for build or broad QA flows
- `4 agents` only when the extra role is truly necessary

Good default role patterns:

- `Planner + Challenger`
- `Builder + Reviewer`
- `Planner + Builder + Verifier`
- `Verifier + Repair Planner + Fixer + Final Verifier`

Too many agents add:

- latency
- handoff noise
- prompt bloat
- more chances to lose context

## 4. Strong Role Separation

Each agent should own one responsibility.

Good examples:

- Planner defines scope and acceptance criteria
- Builder edits code and assets
- Verifier checks evidence
- Release Owner decides ship or no-ship

Bad examples:

- one agent both builds and signs off
- every agent is allowed to do everything

If roles overlap too much, the Waggle becomes hard to reason about and hard to debug.

## 5. Structured Input Contract

Every Waggle should expect a known input shape.

Minimum useful inputs:

- `userGoal`
- `surface`: web, mobile, backend, fullstack, or unknown
- `references`: screenshot, Figma, URL, image, or verbal prompt
- `constraints`
- `verificationNeed`
- `previousHandoff`

The more vague the input contract is, the more the first agent wastes time rediscovering context.

## 6. Structured Output Contract

Every Waggle should end with a clean handoff.

Minimum useful outputs:

- `summary`
- `status`: pass, needs-work, blocked
- `filesChanged`
- `assetsUsedOrCreated`
- `commandsRun`
- `evidenceReviewed`
- `risks`
- `nextRecommendedWaggle`
- `nextInputPayload`

This is one of the most important ingredients. Low-tier models perform much better when the handoff format is rigid.

## 7. Dependency Contract

Each Waggle must clearly define:

- `required MCPs`
- `optional MCPs`
- `required skills`
- `optional skills`
- `unsupported but allowed fallbacks`

Use these rules:

- required means the Waggle should not claim full success without it
- optional means the Waggle can still run, but with narrower coverage
- optional tools should not dominate the prompt unless the request actually needs them

Examples:

- `web-build`
  - required: `playwright` only if runtime verification is part of the build promise
  - optional: `figma`, media tools
- `mobile-build`
  - required: mobile runtime MCPs for runtime-heavy promises
  - optional: design and media tools

## 8. Installability

If you want the Waggle `Install` button to work well, every dependency needs a clear install story.

That means:

- MCPs need install recipes when possible
- starter skills need a reproducible creation path
- optional dependencies should still be visible in setup
- the install flow should not pretend to install tools that have no recipe

A successful Waggle is not only well prompted. It is also operationally installable.

## 9. Honest Preflight

Every serious Waggle should have preflight checks.

The current preflight model should answer:

- are required dependencies installed
- does the repo look like the right surface
- are likely run/build entries present
- do relevant local tools respond
- do project-local framework CLIs respond for supported cases

Preflight should produce:

- `ready`
- `partial`
- `blocked`

And it should explain why.

Bad behavior:

- vague "may not work" wording
- claiming ready because only optional design tools are missing while the repo itself does not match the Waggle

Good behavior:

- show the most important warning first
- explain exactly what is missing
- reduce confidence instead of overpromising

## 10. Real Verification

A Waggle is only trustworthy if the verifier uses real evidence.

Examples:

- web: Playwright, screenshots, route verification, asset loading
- mobile: simulator/emulator/device evidence, screenshots, runtime logs
- backend: API execution, DB checks, contract checks
- release: explicit verification coverage and residual risk

Rules:

- builders do not mark themselves done
- verifiers should not pass based only on reasoning
- release should not be the first place verification happens

## 11. Self-Healing QA Loop

For lower-tier models, this is critical.

The best QA Waggle shape is:

1. `Verifier`
2. `Repair Planner`
3. `Fixer`
4. `Final Verifier`

The loop should:

- find real defects
- convert defects into a small fix plan
- apply the smallest fix
- retest the same path
- stop after bounded retries

This is why `qa-repair-loop` is a canonical lifecycle Waggle.

## 12. Asset Strategy

UI-heavy Waggles should not treat assets as an afterthought.

They should always declare:

- `asset mode`: none, existing, external, generated
- `asset source`
- `asset paths`
- `fallback used`

For hero and marketing work, also declare:

- `hero mode`: static, animated-ui, video, frames

Best order of preference:

1. existing repo assets
2. user-provided assets
3. reference images or URLs
4. generated assets
5. pure code fallback

Do not make video or frame pipelines the default for every web/mobile Waggle.

## 13. Fallback Rules

Every Waggle needs an explicit fallback path.

Examples:

- no Figma -> use screenshot or text brief
- no Playwright -> downgrade verification confidence
- no simulator/device path -> allow planning/build, block runtime signoff
- no media tools -> use static or code-first assets

Without fallback rules, failures become confusing and repetitive.

## 14. Stop Condition

A Waggle should stop because a condition is met, not because the prompt ran out of steam.

Good stop conditions:

- build verified
- defects fixed and retested
- release judgment reached
- blocker clearly identified

Bad stop conditions:

- "agents seem to agree"
- "enough turns happened"

Consensus can help, but evidence should be stronger than consensus.

## 15. Next-Step Routing

A successful Waggle should clearly say what happens next.

Examples:

- `product-planning` -> `design-asset-direction` or a build Waggle
- `web-build` -> `qa-repair-loop`
- `qa-repair-loop` -> `release-readiness`
- `release-readiness` -> `deployment`

This is what makes separate Waggles feel like one coherent lifecycle.

## Canonical Lifecycle Waggles

These are the Waggles that best match the lifecycle designed in this project:

- `turing`
- `product-planning`
- `design-asset-direction`
- `web-build`
- `mobile-build`
- `backend-build`
- `qa-repair-loop`
- `release-readiness`
- `deployment`

These are the ones to treat as the default lifecycle backbone.

## Supporting Waggles

These can still be useful, but they are not the cleanest default chain:

- `quality-assurance-engineer`
- `product-ui`
- `web-engineer`
- `mobile-engineer`
- `backend-engineer`
- `qa-debug`

Use them when you want a broader or more opinionated flow, not when you need the strictest lifecycle discipline.

## Recommended Waggle Definition Template

Use this structure when authoring a Waggle:

```md
# <waggle-name>

## Purpose
- One-sentence mission

## When To Use
- Clear situations where this Waggle is appropriate

## When Not To Use
- Clear exclusions

## Inputs
- userGoal
- surface
- references
- constraints
- previousHandoff

## Roles
- Agent A: <role name> -> exact job
- Agent B: <role name> -> exact job
- Agent C: <role name> -> exact job

## Required MCPs
- ...

## Optional MCPs
- ...

## Required Skills
- ...

## Optional Skills
- ...

## Output Contract
- summary
- status
- filesChanged
- evidenceReviewed
- nextRecommendedWaggle
- nextInputPayload

## Success Condition
- What must be true to count as done

## Failure Routing
- Where blocked or failed work goes next

## Verification
- What evidence must be collected

## Retry Policy
- What can retry
- Max retries

## Notes
- Asset rules
- Fallback rules
- Special stack handling
```

## Recommended Author Checklist

Before shipping a Waggle, confirm all of these:

- purpose is narrow
- lifecycle stage is clear
- agent count is minimal
- each role has one main responsibility
- input contract is defined
- output contract is defined
- required vs optional dependencies are explicit
- install recipes exist where possible
- preflight can report ready, partial, or blocked
- verifier uses real evidence
- fallback behavior is documented
- next Waggle is explicit
- tests cover the main contract and setup/status behavior

## Anti-Patterns

Avoid these:

- one giant Waggle for planning + design + build + QA + release + deploy
- too many agents with overlapping jobs
- prompts that assume every optional tool is always installed
- verification that relies on reasoning instead of evidence
- install flows that claim support without recipes
- asset generation rules that are always on
- vague handoffs
- no retry limits
- no explicit blocked state

## Best Default For Lower-Tier Models

If you want weaker models to perform well, optimize for:

- narrow scope
- rigid output format
- stronger verifier than builder
- explicit defect lists
- bounded retry loops
- smaller Waggles chained together

This is more reliable than trying to make one giant Waggle "smart enough".

## Definition Of Done

A Waggle is successful when:

- it is chosen for the right job
- it has the dependencies it actually needs
- preflight represents readiness honestly
- it can hand work cleanly to the next Waggle
- it verifies with evidence
- it fails predictably when blocked
- it does not promise more than it can deliver

That is the real recipe for a successful Waggle.
