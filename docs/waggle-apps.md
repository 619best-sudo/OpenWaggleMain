# Waggle Apps

This document describes the current built-in Waggle apps in OpenWaggle, the recommended order to use them when launching a product, and what each agent does on its turn.

## Turn Model

Most built-in Waggle apps use a two-agent sequential flow. `web-engineer`, `mobile-engineer`, and `qa-debug` use four-agent sequential loops, `backend-engineer` and `quality-assurance-engineer` use three-agent sequential loops, and `game-factory` uses a five-agent sequential loop.

- Turn 1: Agent A goes first and produces the initial plan, build, investigation, or report input
- Turn 2: Agent B responds by reviewing, challenging, auditing, reporting, or acting on Agent A's work
- Later turns: the agents continue alternating until they reach consensus or hit the preset's safety turn limit
- Multi-agent exceptions: `web-engineer` and `mobile-engineer` rotate across Planner, Builder, Animation Expert, and Verifier; `qa-debug` rotates across Debug Planner, Runtime Investigator, Fixer, and Verifier; `backend-engineer` and `quality-assurance-engineer` rotate across three specialized roles; `game-factory` rotates across Planner, Skeleton, World, Character, and QA before starting the next loop
- Output shape: each built-in Waggle tells its agents exactly how to end their turn so the next turn has a clean handoff

When reading the entries below:

- `Agent A` means the first agent to speak in the Waggle
- `Agent B` means the second agent to speak in the Waggle
- `Agent C`, `Agent D`, and `Agent E` only appear on multi-agent presets such as `web-engineer`, `mobile-engineer`, `backend-engineer`, and `game-factory`
- `Turn Flow` explains how the back-and-forth usually works

## Core Launch Set

Use these first. They cover the minimum product lifecycle from planning through implementation and ship decision across website, mobile, and backend surfaces.

### `turing`

- Purpose: read the user request and repository context, then recommend the next installed Waggle and its two-agent execution plan
- Roles: `Context Reader + Installed Waggle Selector`
- Agent A: `Context Reader`
- Agent A role: reads the user query, inspects the relevant files, classifies the task, and drafts the first next-Waggle recommendation
- Agent B: `Installed Waggle Selector`
- Agent B role: validates that recommendation against the Waggles that are actually installed and ready, then finalizes the next Waggle and the two-agent handoff plan
- Best for: starting from an ambiguous request, routing work to the correct Waggle, and avoiding recommendations that depend on missing MCPs or skills
- Required MCPs: none
- Required skills: none
- Turn Flow: Context Reader maps the request and relevant repo context first, Installed Waggle Selector checks which Waggles are really usable in the current project second, and later turns tighten the routing recommendation until one ready next Waggle is selected

### `product-planning`

- Purpose: turn a vague request into a buildable MVP plan
- Roles: `Planner + Challenger`
- Agent A: `Planner`
- Agent A role: clarifies the goal, defines MVP scope, writes acceptance criteria, calls out non-goals, and recommends the next Waggle
- Agent B: `Challenger`
- Agent B role: pressure-tests the plan for missing requirements, hidden complexity, scope bloat, and weak acceptance criteria
- Best for: scope, acceptance criteria, risks, and choosing the next Waggle
- Required MCPs: none
- Required skills: none
- Turn Flow: Planner proposes the first actionable plan, Challenger critiques and tightens it, then later turns refine the plan until it is build-ready

### `product-ui`

- Purpose: build or refine a user-facing product surface and audit the result
- Roles: `UI Builder + UI Auditor`
- Agent A: `UI Builder`
- Agent A role: implements the real UI surface, wires state, handles likely states, and prepares the feature for audit
- Agent B: `UI Auditor`
- Agent B role: checks the rendered result with Playwright, captures evidence, compares the focused surface and full page or screen, and reports breakage or mismatches
- Best for: website sections, product screens, settings, forms, and UI flows
- Required MCPs: `playwright`
- Required skills: `frontend-implementer`, `ui-screenshot-auditor`
- Note: if the work changes a specific website section, the audit should capture both the focused section and the full page
- Turn Flow: UI Builder ships the requested UI change first, UI Auditor reviews it with screenshots and context, and later turns refine the UI until the audit passes

### `web-engineer`

- Purpose: run a plan -> implement -> animate-if-needed -> verify loop for websites and web apps, including new features and edits to existing web behavior
- Roles: `Web Planner + Web Builder + Web Animation Expert + Web Verifier`
- Agent A: `Web Planner`
- Agent A role: reads the project, any attached plan file, screenshot, mockup image, Figma file or frame, UI description, or existing code, then maps the likely files, runtime path, and whether the request really calls for no motion, microinteractions, broader animation, or generated media before build starts
- Agent B: `Web Builder`
- Agent B role: implements the real website or web-app change in the existing codebase, including direct edits to current features when the request belongs in current behavior, and can request one or more generated assets with explicit prompts, repo asset paths, and video delivery modes
- Agent C: `Web Animation Expert`
- Agent C role: reviews the built code, decides whether meaningful motion is needed, can request one or more generated motion-supporting assets with explicit prompts, repo asset paths, and video delivery modes, and uses GSAP, Anime.js, or Remotion guidance before final QA
- Agent D: `Web Verifier`
- Agent D role: starts or checks the running project, verifies compile/runtime health, uses Playwright to inspect the real UI, compares the rendered result and animation behavior against any supplied plan, Figma artifact, file, image, or document, and confirms generated media was saved into the repository
- Best for: website feature delivery, section rewrites, screen or route implementation, design-to-code work, and existing web feature edits that need real runtime and visual verification
- Required MCPs: `playwright`, `figma`, `gsap`, `remotion`, `animejs`, `multimodal-media`, `ffmpeg`, `blender`, `3d-asset-processing`, `gltf-mcp`
- Required skills: `frontend-implementer`, `ui-screenshot-auditor`, `media-director`
- Planner media rule: microinteractions can be justified anywhere in the product, but generated images or video should usually be requested only when the user request or reference points to a homepage, landing page, hero, marketing, or other clearly media-heavy surface
- Turn Flow: Web Planner scopes the work and input artifacts first, including Figma when present, and decides whether the task needs no motion, microinteractions only, broader animation, or generated media; Web Builder implements the change and can request generated assets second; Web Animation Expert reviews the code and adds or refines motion plus any needed media assets third; Web Verifier validates runtime, Figma or reference fidelity, asset persistence, and video delivery mode last; and later turns feed mismatches or regressions back into the next planning loop until the verifier passes or the blocker is explicit
- Asset persistence rule: generated media must be saved into a repo-owned asset directory such as `assets/`, `src/assets/`, `public/assets/`, or an existing feature-local asset folder already tracked by the project
- Video delivery modes: `direct-video`, `frames-every-second`, or `all-frames`
- Asset request schema: `asset requests: none` or a list of items with `assetType`, `intendedUsage`, `fileType`, `repoAssetPath`, `generationPrompt`, and `videoDeliveryMode`
- Asset output schema: `asset outputs created: none` or a list of items with `assetType`, `fileType`, `repoAssetPath`, `sourceMcp`, `status`, and `videoDeliveryMode`

### `mobile-engineer`

- Purpose: run a plan -> implement -> animate-if-needed -> verify loop for mobile apps, including new features and edits to existing mobile behavior
- Roles: `Mobile Planner + Mobile Builder + Mobile Animation Expert + Mobile Verifier`
- Agent A: `Mobile Planner`
- Agent A role: reads the project, any attached plan file, screenshot, mockup image, Figma file or frame, UI description, or existing code, then maps the likely files, runtime path, and whether the request really calls for no motion, microinteractions, broader animation, or generated media before build starts
- Agent B: `Mobile Builder`
- Agent B role: implements the real mobile screen or flow in the existing codebase, including direct edits to current features when the request belongs in current behavior, and can request one or more generated assets with explicit prompts, repo asset paths, and video delivery modes
- Agent C: `Mobile Animation Expert`
- Agent C role: reviews the built code, decides whether meaningful motion is needed, can request one or more generated motion-supporting assets with explicit prompts, repo asset paths, and video delivery modes, and refines animations for the real stack in use across React Native, Flutter, Kotlin Android, Swift iOS, or hybrid mobile surfaces
- Agent D: `Mobile Verifier`
- Agent D role: starts or checks the running app, verifies compile/runtime health, uses `mobile-mcp`, `mobile-device`, or the most relevant installed mobile runtime MCP to inspect the real screen or flow, compares the rendered result and animation behavior against any supplied plan, Figma artifact, file, image, or document, and confirms generated media was saved into the repository
- Best for: mobile feature delivery, screen flows, navigation work, UI-to-code implementation, and existing mobile feature edits that need real device-flow and visual verification
- Required MCPs: `mobile-mcp`, `mobile-device`, `figma`, `gsap`, `remotion`, `animejs`, `multimodal-media`, `ffmpeg`, `blender`, `3d-asset-processing`, `gltf-mcp`
- Required skills: `frontend-implementer`, `ui-screenshot-auditor`, `media-director`
- Planner media rule: microinteractions can be justified anywhere in the app, but generated images or video should usually be requested only when the request or reference points to a media-heavy experience such as onboarding, splash, welcome, marketing-style home, or another explicitly branded surface
- Turn Flow: Mobile Planner scopes the work and input artifacts first, including Figma when present, and decides whether the task needs no motion, microinteractions only, broader animation, or generated media; Mobile Builder implements the change and can request generated assets second; Mobile Animation Expert reviews the code and adds or refines motion plus any needed media assets third; Mobile Verifier validates runtime, Figma or reference fidelity, asset persistence, and video delivery mode last; and later turns feed mismatches or regressions back into the next planning loop until the verifier passes or the blocker is explicit
- Asset persistence rule: generated media must be saved into a repo-owned asset directory such as `assets/`, `src/assets/`, `android/app/src/main/res/`, `ios/`, or an existing feature-local asset folder already tracked by the project
- Video delivery modes: `direct-video`, `frames-every-second`, or `all-frames`
- Asset request schema: `asset requests: none` or a list of items with `assetType`, `intendedUsage`, `fileType`, `repoAssetPath`, `generationPrompt`, and `videoDeliveryMode`
- Asset output schema: `asset outputs created: none` or a list of items with `assetType`, `fileType`, `repoAssetPath`, `sourceMcp`, `status`, and `videoDeliveryMode`

### `backend-systems`

- Purpose: build or harden backend and data-facing product logic
- Roles: `Backend Builder + Backend Auditor`
- Agent A: `Backend Builder`
- Agent A role: implements backend, API, integration, or data-layer changes in the real product code
- Agent B: `Backend Auditor`
- Agent B role: reviews contracts, validation, auth, migration safety, data risk, and operational edge cases
- Best for: APIs, validation, auth boundaries, migrations, integrations, and system behavior
- Required MCPs: none
- Required skills: `backend-auditor`
- Turn Flow: Backend Builder makes the first implementation pass, Backend Auditor inspects the design and risks, and later turns tighten the system until the change is safe enough to verify or release

### `backend-engineer`

- Purpose: run a plan -> implement -> verify backend delivery loop for APIs, services, persistence, and existing backend feature edits
- Roles: `Backend Planner + Backend Builder + Backend Verifier`
- Agent A: `Backend Planner`
- Agent A role: classifies the request, reads the current implementation, and maps which files are likely to change or be created before build starts
- Agent B: `Backend Builder`
- Agent B role: implements the backend change in the real codebase, including edits to existing backend features when the request belongs in current behavior
- Agent C: `Backend Verifier`
- Agent C role: compiles or typechecks the affected backend path, exercises the changed API flow through the API-call MCP, and checks database state through the database MCP when persistence changes
- Best for: backend feature delivery, API work, persistence changes, integration flows, and backend edits that need both implementation and runtime verification in one Waggle
- Required MCPs: `postman`, `database`
- Required skills: `backend-auditor`
- Turn Flow: Backend Planner scopes the work and file plan first, Backend Builder implements the change second, Backend Verifier validates compile/runtime/database behavior third, and later turns continue tightening the backend path until the verifier passes or the blocker is explicit
- Launcher prompts: the settings launcher includes one-click starter prompts for new API features, existing feature edits, and bugfix-plus-database-verification flows

### `qa-debug`

- Purpose: classify the bug, investigate it with targeted runtime evidence and logs, apply a reversible fix, and verify whether the result should be kept or rolled back before the next loop
- Roles: `Debug Planner + Runtime Investigator + Fixer + Verifier`
- Agent A: `Debug Planner`
- Agent A role: decides whether the problem is UI, backend, logic, or mixed, chooses the right MCP path, defines what logs or measurements to capture, and sets the rollback boundary if the first fix attempt fails
- Agent B: `Runtime Investigator`
- Agent B role: reproduces the issue, adds scoped temporary instrumentation, captures focused evidence such as screenshots, component measurements, API outputs, SQL data, or logic-path logs, and narrows the highest-confidence fix direction
- Agent C: `Fixer`
- Agent C role: applies the smallest reliable fix, keeps the attempt reversible, removes temporary instrumentation when possible, and records exact rollback instructions if verification fails
- Agent D: `Verifier`
- Agent D role: re-runs the failing path and adjacent disturbed flows with the same MCP classes, decides whether to keep or revert the attempted fix, and forwards failed-attempt learning back into the next planning loop
- Best for: frontend, mobile, backend, API, SQL, and logic debugging where you want a reproduce -> instrument -> fix -> verify loop instead of a single-pass patch
- Required MCPs: `playwright`, `mobile-mcp`, `mobile-device`, `postman`, `sql`
- Required skills: `frontend-implementer`, `ui-screenshot-auditor`, `backend-auditor`
- Investigation rule: UI bugs should use visual and measurable evidence when useful, including component screenshots, console errors, bounding boxes, and width or height or x or y measurements; logic and backend bugs should use scoped temporary logs, request or response evidence, and SQL checks when relevant
- Rollback rule: if the verifier says the attempted fix did not work, the next loop should start by undoing that failed code change before trying a new approach
- Turn Flow: Debug Planner classifies the issue and plans the investigation first, Runtime Investigator reproduces and instruments second, Fixer applies a reversible patch third, Verifier decides whether the fix is real or must be reverted fourth, and later turns continue with the verifier's learning fed back into the next planner pass

### `launch-readiness`

- Purpose: decide whether the current change is ready to merge, demo, beta, or launch
- Roles: `Release Owner + Release Checker`
- Agent A: `Release Owner`
- Agent A role: summarizes what changed, what surfaces are affected, what was verified, and what risks are already known
- Agent B: `Release Checker`
- Agent B role: checks for missing verification, rollout hazards, migration risk, and unresolved blockers, then gives the release judgment
- Best for: final release review, rollout risk, missing verification, and operator concerns
- Required MCPs: none
- Required skills: `release-checker`
- Turn Flow: Release Owner assembles the launch picture first, Release Checker audits it and challenges weak spots second, and later turns narrow the remaining release risks until a clear ship decision is possible

## Quality And Inspection

Use these when the product needs deeper structured evidence before release.

### `development-qa`

- Purpose: create test cases, execute them, and report bugs without fixing code
- Roles: `Test Designer + Test Executor`
- Agent A: `Test Designer`
- Agent A role: defines structured `TC-*` test cases across frontend, mobile, API, and database coverage with expected results and tool choice
- Agent B: `Test Executor`
- Agent B role: runs those cases with the declared MCPs, records pass or fail or blocked results, and turns failures into issue reports
- Best for: formal QA across frontend, mobile, API, and database surfaces
- Required MCPs: `playwright`, `mobile-mcp`, `postman`, `database`
- Required skills: `ui-screenshot-auditor`, `backend-auditor`
- Output style: `TC-*` test cases, pass/fail/blocked/untested results, severity buckets, and a ship recommendation
- Turn Flow: Test Designer writes the plan first, Test Executor runs the exact cases second, and later turns extend coverage or clarify failures until the QA report is complete

### `quality-assurance-engineer`

- Purpose: run a full QA cycle where one agent plans the entire test suite, one agent executes the cases across all relevant surfaces, and one agent decides whether coverage and quality are strong enough to ship
- Roles: `QA Planner + QA Executor + QA Lead`
- Agent A: `QA Planner`
- Agent A role: designs the complete QA plan across browser, mobile, API, SQL, regressions, and edge cases based on the actual request and changed surfaces
- Agent B: `QA Executor`
- Agent B role: executes the planned cases with `playwright`, `mobile-mcp`, `postman`, and `sql`, records pass/fail/blocked outcomes, and gathers the strongest available evidence
- Agent C: `QA Lead`
- Agent C role: audits whether the plan and execution really covered the important paths, summarizes confirmed issues and blocked areas, and gives the final ship recommendation plus the exact next QA cycle when needed
- Best for: end-to-end product QA where you want planning, execution, and final coverage judgment in one Waggle
- Required MCPs: `playwright`, `mobile-mcp`, `postman`, `sql`
- Required skills: `ui-screenshot-auditor`, `backend-auditor`
- Output style: full test-plan coverage, executed-case results, evidence by surface, severity buckets, blocked gaps, and a final ship recommendation
- Turn Flow: QA Planner defines the full suite first, QA Executor runs the planned cases second, QA Lead checks whether the execution truly covered the risky paths third, and later turns continue until the QA lead has enough evidence for a trustworthy ship or no-ship call

### `security-audit`

- Purpose: inspect for leaked information and practical security weaknesses, then harden where safe
- Roles: `Security Investigator + Security Hardener`
- Agent A: `Security Investigator`
- Agent A role: finds leaked secrets, exposed sensitive information, unsafe auth or config, and high-confidence security weaknesses
- Agent B: `Security Hardener`
- Agent B role: applies safe hardening where practical, records mitigations when fixes are risky, and produces the final security report
- Best for: secrets exposure, unsafe auth/config, insecure defaults, sensitive logging, and clear exploit paths
- Required MCPs: none
- Required skills: `security-auditor`
- Output style: secrets/auth/API/frontend/infra sections, fixed vs mitigated vs unresolved, and a security ship recommendation
- Note: this Waggle reduces realistic attack surface; it does not claim a product is "unhackable"
- Turn Flow: Security Investigator maps the real risks first, Security Hardener responds with fixes or mitigations second, and later turns continue until the remaining security posture is clearly documented

### `performance-inspector`

- Purpose: gather performance evidence across web, mobile, API, and database surfaces and turn it into a bottleneck report
- Roles: `Performance Investigator + Performance Reporter`
- Agent A: `Performance Investigator`
- Agent A role: collects `PI-*` measurements, traces, timings, and per-surface evidence across web, mobile, API, and database systems
- Agent B: `Performance Reporter`
- Agent B role: turns the measurements into a bottleneck report with baseline vs observed comparisons, severity, and a top 3 optimization plan
- Best for: runtime bottlenecks, slow endpoints, slow queries, rendering cost, and scalability risks
- Required MCPs: `chrome-devtools`, `mobile-mcp`, `postman`, `sql`
- Required skills: `performance-auditor`
- Output style: `PI-*` measurements, per-surface metrics, baseline vs observed, top 3 optimization plan, and a ship recommendation
- Turn Flow: Performance Investigator gathers evidence first, Performance Reporter synthesizes the findings second, and later turns fill measurement gaps or sharpen the optimization plan

## UI Specialists

Use these when the core launch set is not specific enough for focused UI work.

### `frontend-ui-audit`

- Purpose: ship UI work and audit it with Playwright evidence
- Roles: `Frontend Builder + UI Auditor`
- Agent A: `Frontend Builder`
- Agent A role: implements the requested frontend change and gets it ready for review
- Agent B: `UI Auditor`
- Agent B role: inspects the visual result, captures screenshots, and reports visual or behavioral regressions
- Best for: focused frontend implementation and screenshot-based audit
- Required MCPs: `playwright`
- Required skills: `frontend-implementer`, `ui-screenshot-auditor`
- Turn Flow: Frontend Builder changes the UI first, UI Auditor critiques the result second, and later turns tighten the UI until the audit is satisfied

### `reference-image-replication`

- Purpose: reproduce a target screenshot or mockup in the real product UI
- Roles: `Reference Builder + Fidelity Auditor`
- Agent A: `Reference Builder`
- Agent A role: recreates the target layout and interaction shape in the actual product UI
- Agent B: `Fidelity Auditor`
- Agent B role: compares the implementation against the reference image and reports fidelity gaps
- Best for: image-to-UI implementation work
- Required MCPs: `playwright`
- Required skills: `frontend-implementer`, `ui-screenshot-auditor`
- Turn Flow: Reference Builder creates the first UI pass, Fidelity Auditor compares it against the source image, and later turns reduce the mismatch until the fidelity bar is met

### `design-system-compliance`

- Purpose: make new UI feel native to the existing product language
- Roles: `System Builder + Design System Auditor`
- Agent A: `System Builder`
- Agent A role: builds the requested UI with the existing primitives, spacing rules, and product patterns
- Agent B: `Design System Auditor`
- Agent B role: checks whether the result actually matches the design system and product language
- Best for: spacing rhythm, primitive reuse, consistency, and product-native polish
- Required MCPs: `playwright`
- Required skills: `frontend-implementer`, `ui-critic`
- Turn Flow: System Builder implements the UI first, Design System Auditor reviews the result second, and later turns remove one-off styling or inconsistent patterns

### `responsive-qa`

- Purpose: harden layouts against clipping, overflow, resizing, and stressed states
- Roles: `Responsive Builder + Responsive Auditor`
- Agent A: `Responsive Builder`
- Agent A role: adjusts the UI to behave well across viewport sizes, long content, and stressed states
- Agent B: `Responsive Auditor`
- Agent B role: resizes and inspects the result, then reports clipping, overflow, wrapping, and layout instability
- Best for: desktop/window resizing, long content, awkward breakpoints, and fragile layouts
- Required MCPs: `playwright`
- Required skills: `frontend-implementer`, `ui-screenshot-auditor`
- Turn Flow: Responsive Builder hardens the layout first, Responsive Auditor tests stressed states second, and later turns continue until the responsive issues are resolved

## Other Built-Ins

### `game-factory`

- Purpose: run an end-to-end browser-game production loop for 2D or 3D games with a tighter 5-agent structure that plans, prototypes, builds the world, builds the focal actor, tests, and loops quickly
- Roles: `Planner / Narrative Director + Skeleton / Prototype Builder + World / Environment Builder + Character / Actor Builder + QA / Runtime Governor`
- Agent A: `Planner / Narrative Director`
- Agent A role: defines the story tone, scenes, character lineup, environment mood, current milestone, scope cuts, and loop routing so the team ships one playable slice at a time
- Agent B: `Skeleton / Prototype Builder`
- Agent B role: owns project bootstrap, entry files, dependency install, placeholder-first prototype flow, and the minimum runnable shell needed for the first QA pass
- Agent C: `World / Environment Builder`
- Agent C role: owns the visible world, 2D or 3D environment presentation, ambience, world-facing assets, and relevant environment MCP usage
- Agent D: `Character / Actor Builder`
- Agent D role: owns the main character or focal actor, actor-facing controls and media, character assets, and actor-level fallback implementation
- Agent E: `QA / Runtime Governor`
- Agent E role: opens the game in the browser, checks logs and screenshots, tests CTAs and control flow, requests stable selectors when automation is fragile, and decides whether the build passes or goes back into the loop
- Best for: browser-based 2D or 3D games, infinite-world or tilemap prototypes, GLB-heavy or sprite-heavy workflows, media-assisted content pipelines, and fast vertical-slice-first game production
- Required MCPs: `playwright`, `chrome-devtools`, `blender`, `3d-asset-processing`, `gltf-mcp`, `multimodal-media`, `ffmpeg`
- Required skills: `game-planner-director`, `game-skeleton-prototype-builder`, `game-world-presentation-builder`, `game-character-actor-builder`, `game-qa-runtime-governor`, `game-loop-contract-governor`
- MCP allocation:
  - `Skeleton / Prototype Builder` uses `multimodal-media` and `ffmpeg` for fast placeholders, temporary audio, and simple prototype feedback when needed
  - `World / Environment Builder` uses `blender`, `3d-asset-processing`, `gltf-mcp`, `multimodal-media`, and `ffmpeg` when world assets, ambience, 2D visuals, 3D scenes, or environment animation helpers are needed
  - `Character / Actor Builder` uses `multimodal-media`, `blender`, `3d-asset-processing`, `gltf-mcp`, and `ffmpeg` for character art, actor audio, rigs, sprites, GLB actors, and simple character animation support
  - `QA / Runtime Governor` uses `playwright` and `chrome-devtools` to open the game, click through CTAs, inspect logs, capture screenshots, and verify runtime behavior
- Existing assets: the waggle prefers approved repo or external assets first, searches before generating, and only creates missing or unusable models, textures, audio, video, or animation support assets
- First QA bar: the first full cycle is expected to hand QA a runnable, testable game slice with real scaffold files, installed dependencies when needed, a visible play surface, and at least one controllable or testable focal actor, even if placeholders are still in use
- Shared loop contract: every builder hands off progress, files changed, commands run, artifacts, blockers, and next task; QA classifies failures, captures screenshots and logs, and routes the next repair loop
- Runtime enforcement: `game-factory` now declares a config-level loop contract and per-agent output contracts, so Waggle core injects the required labels into prompts and Pi runtime treats missing contract sections as a failed turn instead of silent success
- Turn Flow: one full loop runs Planner / Narrative -> Skeleton / Prototype -> World / Environment -> Character / Actor -> QA / Runtime, then repeats until the current slice is approved, narrowed, or stopped; later loops should polish a working game rather than discover bootstrap work was skipped

### `code-review`

- Purpose: run a two-pass review that prioritizes ripple effects, blast radius, hidden regressions, edge cases, and missing tests above style feedback
- Roles: `Architect + Reviewer`
- Agent A: `Architect`
- Agent A role: performs the first pass as the lead reviewer, maps the blast radius across dependent files and contracts, identifies bugs and weak assumptions, and calls out adjacent functionality that may have been disturbed
- Agent B: `Reviewer`
- Agent B role: acts as the final review auditor, verifies or refutes the first pass with code evidence, hunts for missed regressions in dependent paths, and decides whether the change is safe to merge
- Best for: review-focused collaboration instead of implementation
- Required MCPs: none by default
- Required skills: none by default
- Highest priority: ripple-effect analysis; the review should actively trace what else can break when one file, type, helper, schema, state shape, API contract, persistence path, or fallback behavior changes
- Architect output contract: `primary findings`, `ripple effects to inspect`, `edge cases at risk`, `test and coverage gaps`, `recommended fixes`
- Reviewer output contract: `validated findings`, `new ripple-effect findings`, `edge cases verified`, `residual risks`, `merge recommendation`
- Turn Flow: Architect maps the likely blast radius first, Reviewer pressure-tests that analysis and adds anything missed second, and later turns continue until the remaining regression risk is clear enough for a trustworthy merge recommendation

## Recommended Flow

For a typical product launch, use this order:

1. `product-planning`
2. `web-engineer` and/or `mobile-engineer` and/or `backend-engineer`
3. `qa-debug` or `development-qa`
4. `security-audit`
5. `performance-inspector`
6. `launch-readiness`

## Dependency Notes

- `playwright`: browser automation and screenshot-based UI checks
- `figma`: design-file and frame inspection for design-to-code and fidelity comparison
- `chrome-devtools`: web performance traces and DevTools-grade browser diagnostics
- `mobile-mcp`: mobile runtime and device/simulator inspection
- `postman`: API request execution and timing analysis
- `database`: general database inspection
- `sql`: SQL-focused query and data-access inspection

## Selection Guidance

- If you are not sure where to start, choose `product-planning`
- If you need the repo-aware next Waggle recommendation first, choose `turing`
- If the request is mainly user-facing, choose `product-ui`
- If the request is mainly system or data logic, choose `backend-systems`
- If you want one Waggle to plan, implement, and verify backend work in a single loop, choose `backend-engineer`
- If something is failing or needs verification, choose `qa-debug`
- If you want one Waggle to drive a game from concept through assets, implementation, QA, and polish loops, choose `game-factory`
- If you need a report rather than a fix, choose `development-qa`, `security-audit`, or `performance-inspector`
- If the work is about shipping confidence, choose `launch-readiness`
