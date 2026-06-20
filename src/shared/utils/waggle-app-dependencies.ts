import type { McpServerDefinition, McpSettingsView } from '@shared/types/mcp'
import type { SkillCatalogResult } from '@shared/types/standards'
import type {
  WaggleAppDependencyStatus,
  WaggleAppInstallStatus,
  WaggleAppManifest,
} from '@shared/types/waggle'

export interface WaggleAppSkillInstallRecipe {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly markdown: string
  readonly setupSteps?: readonly string[]
}

export interface WaggleAppMcpInstallRecipe {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly serverName: string
  readonly alternateServerNames?: readonly string[]
  readonly definition: McpServerDefinition
  readonly setupSteps?: readonly string[]
}

function createStarterSkillMarkdown(input: {
  readonly name: string
  readonly description: string
  readonly body: string
}) {
  return `---
name: ${input.name}
description: ${input.description}
---

${input.body}
`
}

const WAGGLE_APP_SKILL_RECIPES = {
  'frontend-implementer': {
    id: 'frontend-implementer',
    label: 'Frontend Implementer',
    description:
      'Implements frontend UI from product requirements or reference images. Invoke when a Waggle app needs an agent to build or refine the real UI.',
    markdown: createStarterSkillMarkdown({
      name: 'frontend-implementer',
      description:
        'Implements frontend UI from requirements or reference imagery. Invoke when an agent is responsible for building or refining product-facing UI.',
      body: `# Frontend Implementer

Build real frontend UI that can ship, not demo-only markup.

## When To Use

Invoke this skill when the task is primarily about implementing or refining UI:

- New screens, panels, dialogs, cards, forms, tables, or navigation flows
- Styling or layout adjustments that must hold up in the real product
- Reproducing a reference screenshot, mockup, or design direction in code
- Tightening broken, incomplete, or inconsistent interaction states

## Core Expectations

- Work in the real feature boundary, not in throwaway demo code.
- Preserve the existing product language unless the user explicitly asks for redesign.
- Prefer shared primitives and existing architecture over ad hoc one-off components.
- Make the UI robust across likely states: loading, empty, disabled, long content, and error-adjacent conditions.
- If a reference image exists, match hierarchy, spacing, proportions, and affordances as closely as the system allows.

## Implementation Workflow

1. Read the owning feature, route, state, and any nearby tests before editing.
2. Identify the smallest real change that satisfies the request.
3. Implement the UI with production-minded structure and copy.
4. Check for layout traps such as clipped text, unstable widths, missing min/max constraints, and weak alignment.
5. Verify the edited surface when practical before handing off for audit.

## Reference Image Rules

- Treat attached images as fidelity targets, not vague inspiration.
- Replicate the visible structure before polishing micro-details.
- If exact matching is impossible because of platform constraints or missing assets, say so clearly and explain the closest acceptable interpretation.

## Handoff Format

End with:

- what changed
- what still needs visual verification
- any known deviation from the reference or requested UX`,
    }),
  },
  'ui-critic': {
    id: 'ui-critic',
    label: 'UI Critic',
    description:
      'Reviews UI work for hierarchy, affordances, copy quality, and obvious regressions.',
    markdown: createStarterSkillMarkdown({
      name: 'ui-critic',
      description: 'Critiques UI changes for clarity, spacing, hierarchy, and interaction risks.',
      body: `# UI Critic

Review UI work with a product-design lens.

- Focus on usability, visual hierarchy, spacing, copy clarity, accessibility, and obvious regressions.
- Prefer concrete findings over general praise.
- Call out missing states, poor affordances, and mismatches between implementation and intent.
- End with a concise ship/no-ship recommendation and the highest-value next fixes.`,
    }),
  },
  'ui-screenshot-auditor': {
    id: 'ui-screenshot-auditor',
    label: 'UI Screenshot Auditor',
    description:
      'Audits rendered UI with screenshots and compares implementation against reference imagery. Invoke after UI work or when validating visual fidelity.',
    markdown: createStarterSkillMarkdown({
      name: 'ui-screenshot-auditor',
      description:
        'Audits rendered UI with screenshots and reference-image comparison. Invoke when an agent should verify visual quality after frontend changes.',
      body: `# UI Screenshot Auditor

Audit the real rendered UI using screenshot evidence.

## When To Use

Invoke this skill when:

- a frontend implementation needs visual QA before sign-off
- the agent should compare the rendered result against a screenshot or mockup
- the task asks whether a UI is "breaking", visually regressing, or diverging from the target

## Primary Responsibilities

- Inspect the actual running UI whenever possible instead of trusting code alone.
- Capture or review screenshots of the changed surface and relevant states.
- If the task changes a specific website section, capture both a focused screenshot of that section and a full-page screenshot so local quality and page-level fit are both reviewed.
- Compare the implementation against the user's request, the existing product language, and any attached reference image.
- Separate real defects from subjective design preference.

## Audit Checklist

Check for:

- clipping, overflow, truncation, and broken wrapping
- inconsistent spacing, alignment, and sizing
- weak hierarchy or emphasis compared to the target
- awkward empty, loading, disabled, hover, focus, and selected states
- regressions in responsiveness, density, or affordance clarity
- mismatches between a reference image and the shipped implementation

## Comparison Rules

- If a reference image exists, discuss structure, spacing rhythm, proportions, copy placement, and affordances.
- Accept justified design-system deviations, but name them explicitly.
- Do not claim a pass unless the UI is stable and the major visual risks have been checked.
- When a section-level screenshot is reviewed, also verify that the surrounding full page or full screen still looks coherent and unbroken.

## Output Format

End with:

- verdict: pass or needs work
- evidence reviewed: screenshots and states inspected
- findings: short ordered list of concrete visual issues
- next fix: the single highest-value follow-up`,
    }),
  },
  'backend-auditor': {
    id: 'backend-auditor',
    label: 'Backend Auditor',
    description:
      'Audits backend and integration work for contracts, validation, and operational risk.',
    markdown: createStarterSkillMarkdown({
      name: 'backend-auditor',
      description:
        'Audits backend changes for contracts, data flow, correctness, and operational risk.',
      body: `# Backend Auditor

Audit backend and integration work before it ships.

- Check request and response contracts, data validation, error handling, retries, and logging.
- Look for migration risk, auth gaps, unsafe defaults, and missing tests around failure paths.
- Prefer findings tied to behavior, not style.
- Summarize the main production risks and what should be verified before release.`,
    }),
  },
  'media-director': {
    id: 'media-director',
    label: 'Media Director',
    description:
      'Guides image, audio, and video generation toward a cohesive brief-aligned result.',
    markdown: createStarterSkillMarkdown({
      name: 'media-director',
      description:
        'Directs media-generation workflows with feedback on composition, pacing, and cohesion.',
      body: `# Media Director

Guide image, audio, and video generation toward a cohesive result.

- Judge outputs on clarity, composition, pacing, continuity, and fit for the brief.
- When artifacts are provided, reference them directly and suggest the next concrete revision.
- Prefer short, actionable feedback loops over abstract creative commentary.
- Keep the team aligned on one quality bar and one next iteration target.`,
    }),
  },
  'game-systems-architect': {
    id: 'game-systems-architect',
    label: 'Game Systems Architect',
    description:
      'Designs the technical roadmap for browser or desktop games, including world systems, streaming, performance budgets, and milestone sequencing.',
    markdown: createStarterSkillMarkdown({
      name: 'game-systems-architect',
      description:
        'Plans production-ready game architecture, milestone flow, and technical contracts for browser-based and desktop game projects.',
      body: `# Game Systems Architect

Design the game as a shippable system, not as a loose pile of features.

## Focus Areas

- vertical-slice-first planning
- scene and runtime boundaries
- world generation and chunk streaming contracts
- save/load shape and deterministic seed rules
- performance budgets for draw calls, memory, and frame pacing
- content pipeline boundaries for runtime-safe assets

## Working Rules

- Prefer a playable, measurable milestone over broad speculative scope.
- Separate game pillars, technical constraints, and content production constraints.
- Define interfaces before parallel implementation starts.
- Call out where a browser game needs workers, streaming, instancing, LOD, or asset preprocessing.
- Keep acceptance criteria concrete enough for QA and performance review.

## Output Format

End with:

- milestone goal
- systems affected
- contracts to freeze
- highest-risk technical gap
- next build step`,
    }),
  },
  'asset-pipeline-director': {
    id: 'asset-pipeline-director',
    label: 'Asset Pipeline Director',
    description:
      'Directs the intake, validation, optimization, and runtime packaging flow for generated game assets, especially GLB-based 3D content.',
    markdown: createStarterSkillMarkdown({
      name: 'asset-pipeline-director',
      description:
        'Owns raw-to-runtime asset flow for images, audio, video, and GLB models with validation, naming, and optimization rules.',
      body: `# Asset Pipeline Director

Turn generated media into production-safe game assets.

## Asset Intake Responsibilities

- Treat AI-generated models, textures, audio, and video as staging inputs, not runtime-ready deliverables.
- Keep a clear path from raw asset -> review -> optimization -> approved runtime asset.
- For 3D models, normalize scale, orientation, pivots, materials, textures, animation clips, and LODs before release.
- Require collider strategy, manifest metadata, provenance notes, and runtime ownership for every approved GLB.

## GLB Rules

- Keep raw model outputs in an inbox or staging folder first.
- Validate geometry, materials, and animation clips before runtime import.
- Generate or confirm LOD variants when the asset is used repeatedly at scale.
- Add simplified colliders when physics or interaction requires them.
- Record file size, triangle count, texture budget, and compression decisions.

## Media Rules

- Image outputs should be reviewed for style consistency, tileability, and resolution before shipping.
- Audio outputs should be trimmed, normalized, loop-checked, and categorized.
- Video outputs should be used for trailers, tutorials, or concept validation unless the game explicitly needs runtime video.

## Output Format

End with:

- asset category
- intake status
- processing steps completed
- remaining validation
- approved runtime destination`,
    }),
  },
  'release-checker': {
    id: 'release-checker',
    label: 'Release Checker',
    description:
      'Checks release readiness across verification, rollout risk, and operator guidance.',
    markdown: createStarterSkillMarkdown({
      name: 'release-checker',
      description:
        'Checks release readiness across testing, risk, rollout notes, and follow-up actions.',
      body: `# Release Checker

Evaluate whether a change is ready to release.

- Check verification coverage, config changes, migration impact, rollback plan, and known risks.
- Prefer explicit blockers, gaps, and release notes over broad summaries.
- Call out missing observability, cleanup tasks, and operator-facing guidance.
- Finish with a release recommendation and the minimum remaining work to de-risk launch.`,
    }),
  },
  'security-auditor': {
    id: 'security-auditor',
    label: 'Security Auditor',
    description:
      'Reviews code and configuration for leaked secrets, unsafe defaults, auth issues, and obvious exploit paths, then guides hardening and reporting.',
    markdown: createStarterSkillMarkdown({
      name: 'security-auditor',
      description:
        'Audits code and configuration for secrets exposure, auth gaps, insecure defaults, and high-confidence security risks.',
      body: `# Security Auditor

Audit the product for practical security weaknesses and obvious exposure risk.

## What To Look For

- hardcoded secrets, keys, tokens, passwords, or connection strings
- unsafe logging of sensitive values
- weak auth or authorization checks
- insecure defaults, missing validation, and exposed debug behavior
- obvious injection, path traversal, SSRF, command execution, or trust-boundary risks
- public or accidental exposure of internal endpoints, configs, or privileged data

## Working Style

- Prefer high-confidence findings over speculative fear.
- Be explicit about where the risk lives and how it could be abused.
- If a fix is straightforward and low-risk, recommend or apply the hardening step.
- Never claim the system is "unhackable". Report residual risk honestly.

## Reporting Format

End with:

- critical findings
- major findings
- minor findings
- fixes applied or recommended
- residual risks
- security recommendation: improved / needs work / high risk`,
    }),
  },
  'game-planner-director': {
    id: 'game-planner-director',
    label: 'Game Planner / Narrative Director',
    description:
      'Plans the current game slice, narrative direction, character lineup, environment mood, and loop routing. Invoke when starting a game build cycle or when QA needs the next repair or polish plan.',
    markdown: createStarterSkillMarkdown({
      name: 'game-planner-director',
      description:
        'Plans the current game slice, narrative direction, character lineup, environment mood, and loop routing. Invoke when starting a game build cycle or when QA needs the next repair or polish plan.',
      body: `# Game Planner / Narrative Director

Plan one playable slice at a time.

- Pick the current milestone and define acceptance criteria.
- Set the story tone, scene framing, character lineup, and environment mood just deeply enough for builders to execute.
- Decide what is in scope now, what is cut, and what can use placeholders.
- Keep the first cycle focused on a runnable, testable game.
- If the user requires a port or port range, choose one concrete target port or startup rule early.
- Route the next cycle after QA based on evidence, not optimism.
- After QA has spoken, treat QA evidence as the source of truth for the next cycle.
- Do not reopen a fresh code review or implementation audit unless QA explicitly reported missing evidence.
- Convert QA blockers into a narrow next milestone and route them to the correct builder.

End with:

- game mode
- current milestone
- acceptance criteria
- must-have scope now
- explicit cuts
- next handoff
- progress
- files_changed
- commands_run
- artifacts
- blockers
- next_task`,
    }),
  },
  'game-skeleton-prototype-builder': {
    id: 'game-skeleton-prototype-builder',
    label: 'Game Skeleton / Prototype Builder',
    description:
      'Builds the runnable scaffold, placeholder-first prototype, and startup path. Invoke when the game needs entry files, dependency install, bootstrapping, or a first playable build.',
    markdown: createStarterSkillMarkdown({
      name: 'game-skeleton-prototype-builder',
      description:
        'Builds the runnable scaffold, placeholder-first prototype, and startup path. Invoke when the game needs entry files, dependency install, bootstrapping, or a first playable build.',
      body: `# Game Skeleton / Prototype Builder

Ship a runnable prototype before chasing polish.

- Create entry files, source roots, config, and boot modules when they are missing.
- Install dependencies or initialize the workspace when required.
- Build the first playable shell with placeholders if real assets are unavailable.
- Start on a concrete free port inside any user-required range and record the exact port or preview URL in artifacts.
- Fall back in this order when asset generation fails: existing asset -> HTML/CSS/SVG -> primitive shapes or blocks -> plain placeholder text.

End with:

- progress
- files_changed
- commands_run
- artifacts
- blockers
- next_task`,
    }),
  },
  'game-world-presentation-builder': {
    id: 'game-world-presentation-builder',
    label: 'Game World / Environment Builder',
    description:
      'Builds the visible world, environment presentation, and surrounding atmosphere. Invoke when a game needs 2D or 3D world visuals, environment assets, or environment animation.',
    markdown: createStarterSkillMarkdown({
      name: 'game-world-presentation-builder',
      description:
        'Builds the visible world, environment presentation, and surrounding atmosphere. Invoke when a game needs 2D or 3D world visuals, environment assets, or environment animation.',
      body: `# Game World / Environment Builder

Build the visible world that supports play.

- Own board, level, scene, terrain, tilemap, background, lighting, ambience, and environment composition.
- Reuse external or repo assets before generating new ones.
- Use Blender, glTF inspection, 3D asset processing, multimodal media, and FFmpeg only when they materially improve the current milestone.
- Prefer a believable playable space over perfect art in cycle one.
- Fall back to HTML/SVG/basic shapes when generation is unavailable.

End with:

- progress
- files_changed
- commands_run
- artifacts
- blockers
- next_task`,
    }),
  },
  'game-character-actor-builder': {
    id: 'game-character-actor-builder',
    label: 'Game Character / Actor Builder',
    description:
      'Builds the main character, focal actors, actor-facing controls, and actor media pipeline. Invoke when the game needs a controllable player, NPC, token, vehicle, or focal actor.',
    markdown: createStarterSkillMarkdown({
      name: 'game-character-actor-builder',
      description:
        'Builds the main character, focal actors, actor-facing controls, and actor media pipeline. Invoke when the game needs a controllable player, NPC, token, vehicle, or focal actor.',
      body: `# Game Character / Actor Builder

Build the focal actor that turns the prototype into a game.

- Own the player character, focal NPC, token, vehicle, or equivalent controllable actor.
- Use image, audio, video, and 3D tools only when they materially improve the actor for the current slice.
- Keep the actor controllable even if final animation, model, or voice generation fails.
- Fall back in this order when asset generation fails: existing asset -> HTML/CSS/SVG -> primitive shapes or blocks -> plain placeholder text.
- Add stable selectors, semantic labels, or keyboard hooks when QA needs better automation.

End with:

- progress
- files_changed
- commands_run
- artifacts
- blockers
- next_task`,
    }),
  },
  'game-core-gameplay-builder': {
    id: 'game-core-gameplay-builder',
    label: 'Game Core Gameplay Builder',
    description:
      'Builds the runnable scaffold and the main game interaction. Invoke when the project needs bootstrapping, controls, rules, or the primary playable loop.',
    markdown: createStarterSkillMarkdown({
      name: 'game-core-gameplay-builder',
      description:
        'Builds the runnable scaffold and the main game interaction. Invoke when the project needs bootstrapping, controls, rules, or the primary playable loop.',
      body: `# Game Core Gameplay Builder

Make the project boot and make the main interaction playable.

- Create missing entry files, scaffold files, and boot modules when needed.
- Install dependencies or initialize the workspace when required.
- Implement the primary control loop such as cards, movement, steering, or puzzle input.
- Hand off a build QA can actually play, even if placeholders are still present.`,
    }),
  },
  'game-systems-world-logic-builder': {
    id: 'game-systems-world-logic-builder',
    label: 'Game Systems / World Logic Builder',
    description:
      'Builds surrounding world logic, enemies, triggers, and reactive systems. Invoke when the game needs behavior around the main interaction or infinite-world support.',
    markdown: createStarterSkillMarkdown({
      name: 'game-systems-world-logic-builder',
      description:
        'Builds surrounding world logic, enemies, triggers, and reactive systems. Invoke when the game needs behavior around the main interaction or infinite-world support.',
      body: `# Game Systems / World Logic Builder

Build the behavior around the core interaction.

- Own enemies, NPCs, pickups, triggers, scoring, progression, and reactive world systems.
- Support 2D room transitions or 3D streaming only as far as the current milestone needs.
- Reuse assets first and use placeholders when generation is slow or unavailable.
- Prefer simple but working systems in the first cycle.`,
    }),
  },
  'game-qa-runtime-governor': {
    id: 'game-qa-runtime-governor',
    label: 'Game QA / Runtime Governor',
    description:
      'Runs browser QA, captures logs and screenshots, and gates the next loop. Invoke when a game build is ready to test or when runtime evidence is needed.',
    markdown: createStarterSkillMarkdown({
      name: 'game-qa-runtime-governor',
      description:
        'Runs browser QA, captures logs and screenshots, and gates the next loop. Invoke when a game build is ready to test or when runtime evidence is needed.',
      body: `# Game QA / Runtime Governor

Test the running game like a player.

- Use Playwright to open the app, trigger CTAs, and capture screenshots.
- Use Chrome DevTools to inspect console errors, network failures, and browser-side evidence.
- Reject non-runnable scaffolds and require a visible playable surface.
- Return the smallest high-impact repair loop when the build fails.
- Require stable selectors or semantic labels when automation is fragile.
- Never act like the implementing builder or announce file creation as QA work.
- If the app is not runnable yet, attempt the most relevant command or browser-open step anyway and report that failed attempt as evidence.
- Use the builder-reported preview URL or chosen port first instead of spending the turn debating which port to use.
- "failure_categories" must never be "none" when the loop verdict is not approved.
- "evidence_reviewed" must never be "none".

End with:

- loop_verdict
- failure_categories
- top_blockers
- evidence_reviewed
- screenshots
- logs
- exact_next_cycle`,
    }),
  },
  'game-loop-contract-governor': {
    id: 'game-loop-contract-governor',
    label: 'Game Loop Contract Governor',
    description:
      'Defines game-cycle handoffs, QA gates, artifacts, fallback rules, and failure routing. Invoke when coordinating multi-agent game loops or tightening QA evidence.',
    markdown: createStarterSkillMarkdown({
      name: 'game-loop-contract-governor',
      description:
        'Defines game-cycle handoffs, QA gates, artifacts, fallback rules, and failure routing. Invoke when coordinating multi-agent game loops or tightening QA evidence.',
      body: `# Game Loop Contract Governor

Keep every game cycle disciplined and evidence-driven.

- Require a shared handoff packet with progress, files changed, commands run, artifacts, blockers, and next task.
- Enforce the first-cycle QA bar: runnable build, visible play surface, controllable core interaction, and minimal surrounding systems.
- Prefer placeholders when asset generation fails so the cycle stays playable.
- Classify failures clearly and route the next repair loop to the right builder.
- Route install, boot, and scaffold failures to the skeleton/prototype builder first, world failures to the world builder, and focal actor or control failures to the character builder.`,
    }),
  },
  'performance-auditor': {
    id: 'performance-auditor',
    label: 'Performance Auditor',
    description:
      'Profiles web, mobile, API, and database behavior to surface bottlenecks, regressions, and the highest-value optimization targets.',
    markdown: createStarterSkillMarkdown({
      name: 'performance-auditor',
      description:
        'Audits runtime performance across browser, mobile, API, and database surfaces and reports actionable bottlenecks.',
      body: `# Performance Auditor

Audit the product for practical performance bottlenecks and scalability risks.

## What To Measure

- web runtime performance, rendering cost, network waterfalls, and Core Web Vitals signals
- mobile screen responsiveness, heavy transitions, slow lists, startup pain, and runtime stalls
- API latency, repeated calls, slow endpoints, and poor failure-time behavior
- database query cost, heavy scans, weak indexes, and wasteful data access patterns

## Working Style

- Prefer measured bottlenecks over guesswork.
- Tie every finding to evidence: traces, timings, request patterns, screenshots, logs, or query observations.
- Distinguish true bottlenecks from low-value micro-optimizations.
- Recommend the highest-value fixes first.

## Reporting Format

End with:

- web findings
- mobile findings
- API findings
- database findings
- critical bottlenecks
- major bottlenecks
- minor bottlenecks
- recommended optimizations
- residual performance risks
- performance recommendation: healthy / needs work / high risk`,
    }),
  },
} as const satisfies Record<string, WaggleAppSkillInstallRecipe>

const WAGGLE_APP_MCP_RECIPES = {
  'chrome-devtools': {
    id: 'chrome-devtools',
    label: 'Chrome DevTools',
    description:
      'Lets Waggle agents inspect live Chrome pages with DevTools-grade performance traces, audits, and runtime diagnostics.',
    serverName: 'chrome-devtools',
    definition: {
      command: 'npx',
      args: ['-y', 'chrome-devtools-mcp@latest', '--headless'],
    },
    setupSteps: [
      'Ensure Chrome is installed and the target web app can run locally before using browser performance diagnostics.',
      'If you do not want CrUX lookups or usage statistics, add the documented opt-out flags in project MCP config after install.',
    ],
  },
  playwright: {
    id: 'playwright',
    label: 'Playwright',
    description:
      'Lets Waggle agents inspect and automate browser UI state during UI-focused flows.',
    serverName: 'playwright',
    definition: {
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
    },
    setupSteps: [
      'Confirm the target project can run locally before using browser automation.',
      'If Playwright asks for browser binaries, install them in the project environment.',
    ],
  },
  gsap: {
    id: 'gsap',
    label: 'GSAP',
    description:
      'Lets Waggle agents plan, generate, debug, and optimize GSAP-based production animations for websites and hybrid UI flows.',
    serverName: 'gsap',
    definition: {
      command: 'npx',
      args: ['-y', '@vinhnguyen/gsap-mcp'],
    },
    setupSteps: [
      'Use this when a Waggle needs production-grade GSAP motion patterns, animation debugging, or performance tuning.',
      'Pair this with the running app verification step so the agent can validate the final animation in context.',
    ],
  },
  remotion: {
    id: 'remotion',
    label: 'Remotion',
    description:
      'Lets Waggle agents inspect Remotion motion workflows and documentation when animation-heavy UI or motion-design sequences need stronger structure.',
    serverName: 'remotion',
    definition: {
      command: 'npx',
      args: ['-y', '@remotion/mcp@latest'],
    },
    setupSteps: [
      'If the project already uses Remotion packages, align all remotion and @remotion/* versions before relying on generated guidance.',
      'Use this when a Waggle needs motion-system guidance, sequence planning, or video-style UI composition help.',
    ],
  },
  animejs: {
    id: 'animejs',
    label: 'Anime.js',
    description:
      'Lets Waggle agents access Anime.js patterns, docs, and examples for timeline, stagger, SVG, and lightweight UI motion work.',
    serverName: 'anime-js',
    definition: {
      command: 'npx',
      args: ['-y', '@animejs/anime-js-mcp-server'],
    },
    setupSteps: [
      'Use this when a Waggle needs Anime.js-specific motion patterns, easing guidance, or animation examples.',
      'If enhanced docs or repo-backed lookups are needed, add the optional GitHub token in project MCP config after install.',
    ],
  },
  database: {
    id: 'database',
    label: 'Database',
    description:
      'Lets Waggle agents inspect and query many database engines through one MCP server during backend and data-focused flows.',
    serverName: 'database',
    definition: {
      command: 'npx',
      args: ['-y', '@adevguide/mcp-database-server', '--config', '.mcp-database-server.config'],
    },
    setupSteps: [
      'Create a project-level .mcp-database-server.config file with the database connections this project needs.',
      'Prefer read-only credentials for QA and debugging flows unless write access is explicitly required.',
      'Keep secrets in project config or environment variables, not inside the Waggle app manifest.',
    ],
  },
  sql: {
    id: 'sql',
    label: 'SQL',
    description:
      'Lets Waggle agents inspect SQL database behavior and query performance through one MCP server during performance and data-analysis flows.',
    serverName: 'database',
    alternateServerNames: ['sql'],
    definition: {
      command: 'npx',
      args: ['-y', '@adevguide/mcp-database-server', '--config', '.mcp-database-server.config'],
    },
    setupSteps: [
      'Create a project-level .mcp-database-server.config file with the SQL connections this project needs.',
      'Prefer read-only credentials for performance and inspection flows unless write access is explicitly required.',
      'Keep secrets in project config or environment variables, not inside the Waggle app manifest.',
    ],
  },
  'mobile-mcp': {
    id: 'mobile-mcp',
    label: 'Mobile MCP',
    description:
      'Lets Waggle agents inspect and automate iOS and Android apps on simulators, emulators, or real devices.',
    serverName: 'mobile-mcp',
    definition: {
      command: 'npx',
      args: ['-y', '@mobilenext/mobile-mcp@latest'],
    },
    setupSteps: [
      'Ensure the project can run on the target simulator, emulator, or device before using mobile automation.',
      'Configure any required Android SDK, Xcode, or device-access prerequisites in project MCP config after install.',
    ],
  },
  'mobile-device': {
    id: 'mobile-device',
    label: 'Mobile Device MCP',
    description:
      'Lets Waggle agents inspect and drive mobile devices with screenshot analysis, Flutter widget-tree access, and verification across React Native, Flutter, Kotlin, Swift, Android, and iOS flows.',
    serverName: 'mobile-device',
    definition: {
      command: 'npx',
      args: ['-y', 'mobile-device-mcp'],
    },
    setupSteps: [
      'Use this when the Waggle needs stronger visual inspection, widget-tree data, or device-flow evidence beyond baseline mobile automation.',
      'Ensure the target emulator, simulator, or device tooling such as ADB or Xcode prerequisites is available before verification starts.',
    ],
  },
  postman: {
    id: 'postman',
    label: 'Postman',
    description:
      'Lets Waggle agents run API requests and collection-driven API checks through Postman MCP during QA and backend verification flows.',
    serverName: 'postman',
    definition: {
      command: 'npx',
      args: ['-y', '@postman/postman-mcp-server'],
    },
    setupSteps: [
      'Add a POSTMAN_API_KEY environment value in project MCP config after install.',
      'Use the local Postman MCP server path when the API under test is only reachable from the local development environment.',
      'Prefer minimal tool mode unless the project needs broader Postman workspace management.',
    ],
  },
  postgres: {
    id: 'postgres',
    label: 'Postgres',
    description:
      'Lets Waggle agents inspect database schema and run read-oriented database checks.',
    serverName: 'postgres',
    definition: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres'],
    },
    setupSteps: [
      'Add the database connection details required by this MCP in project MCP config after install.',
      'Keep secrets in project config or environment variables, not inside the Waggle app manifest.',
    ],
  },
  figma: {
    id: 'figma',
    label: 'Figma',
    description:
      'Lets Waggle agents inspect design files and compare implementation against source designs.',
    serverName: 'figma',
    definition: {
      command: 'npx',
      args: ['-y', 'figma-ui-mcp'],
    },
    setupSteps: [
      'Add the Figma access token or any required environment values in project MCP config after install.',
      'Verify the MCP can reach the design file you expect this Waggle app to use.',
    ],
  },
  blender: {
    id: 'blender',
    label: 'Blender',
    description:
      'Lets Waggle agents drive Blender for scene inspection, model cleanup, rendering, and GLB export preparation.',
    serverName: 'blender',
    definition: {
      command: 'npx',
      args: ['-y', '@j4flmao/go_blender_mcp'],
    },
    setupSteps: [
      'Install the Blender bridge add-on from the package documentation, then start the bridge from Blender before using the MCP.',
      'Open Blender on the machine where the MCP runs and keep the bridge port free.',
      'Use this for staging, cleanup, LOD preparation, and export review instead of loading raw generated models straight into the game.',
    ],
  },
  '3d-asset-processing': {
    id: '3d-asset-processing',
    label: '3D Asset Processing',
    description:
      'Lets Waggle agents analyze, validate, convert, compress, and optimize glTF or GLB assets before runtime use.',
    serverName: '3d-asset-processing-mcp',
    definition: {
      command: 'npx',
      args: ['-y', '3d-asset-processing-mcp'],
    },
    setupSteps: [
      'Use this after raw model intake to validate, compress, and optimize GLB assets for browser performance.',
      'Keep processed outputs separate from raw assets so the team can compare before and after optimization.',
      'Review texture compression, geometry simplification, and material changes before approving runtime use.',
    ],
  },
  'gltf-mcp': {
    id: 'gltf-mcp',
    label: 'glTF Inspector',
    description:
      'Lets Waggle agents inspect and render GLB assets for visual QA, triangle budgets, and scene hierarchy checks.',
    serverName: 'gltf-mcp',
    definition: {
      command: 'npx',
      args: ['-y', 'gltf-mcp'],
    },
    setupSteps: [
      'Use this to preview and inspect approved or candidate GLB files during asset review.',
      'Expect a local Chromium download on first install because the renderer uses Puppeteer.',
      'Pair this with the 3D asset processing MCP when a model needs both inspection and optimization.',
    ],
  },
  'multimodal-media': {
    id: 'multimodal-media',
    label: 'Multimodal Media',
    description:
      'Lets Waggle agents generate and edit images, videos, audio, and transcriptions through one MCP-backed media workflow.',
    serverName: 'multimodal-mcp',
    definition: {
      command: 'npx',
      args: ['-y', '@r16t/multimodal-mcp@latest'],
    },
    setupSteps: [
      'Add at least one provider API key such as OPENAI_API_KEY, GEMINI_API_KEY, XAI_API_KEY, ELEVENLABS_API_KEY, or BFL_API_KEY in project MCP config after install.',
      'Point the output directory at a project staging area so generated assets can be reviewed before promotion.',
      'Use this for concept images, texture sources, voice or sound generation, and trailer or tutorial rough cuts, not as a bypass for asset QA.',
    ],
  },
  ffmpeg: {
    id: 'ffmpeg',
    label: 'FFmpeg',
    description:
      'Lets Waggle agents transform, inspect, and package generated audio and video assets for trailers, tutorials, and runtime-adjacent media.',
    serverName: 'ffmpeg',
    definition: {
      command: 'npx',
      args: ['-y', 'ffmpeg-mcp-server'],
    },
    setupSteps: [
      'Use this to trim, convert, normalize, and package media outputs after generation.',
      'Validate exported codecs and file sizes before treating the result as a shipping asset.',
      'Keep generated source media and final packaged media in separate folders so QA can audit the pipeline.',
    ],
  },
} as const satisfies Record<string, WaggleAppMcpInstallRecipe>

export function getWaggleAppSkillInstallRecipe(skillId: string) {
  return (
    (WAGGLE_APP_SKILL_RECIPES as Readonly<Record<string, WaggleAppSkillInstallRecipe>>)[skillId] ??
    null
  )
}

export function getWaggleAppMcpInstallRecipe(mcpId: string) {
  return (
    (WAGGLE_APP_MCP_RECIPES as Readonly<Record<string, WaggleAppMcpInstallRecipe>>)[mcpId] ?? null
  )
}

function buildSkillDependencyStatus(
  skillId: string,
  catalog: SkillCatalogResult | null,
  required: boolean,
): WaggleAppDependencyStatus {
  const recipe = getWaggleAppSkillInstallRecipe(skillId)
  const label = recipe?.label ?? skillId
  const skill = catalog?.skills.find((entry) => entry.id === skillId) ?? null

  if (skill?.loadStatus === 'ok' && skill.enabled) {
    return {
      kind: 'skill',
      id: skillId,
      label,
      required,
      state: 'installed',
      description: recipe?.description,
      setupSteps: recipe?.setupSteps,
    }
  }
  if (skill?.loadStatus === 'ok' && !skill.enabled) {
    return {
      kind: 'skill',
      id: skillId,
      label,
      required,
      state: 'missing',
      description: recipe?.description,
      detail: 'Installed but currently disabled.',
      setupSteps: recipe?.setupSteps,
    }
  }
  if (skill?.loadStatus === 'error') {
    return {
      kind: 'skill',
      id: skillId,
      label,
      required,
      state: 'missing',
      description: recipe?.description,
      detail: skill.loadError ?? 'Skill is present but invalid.',
      setupSteps: recipe?.setupSteps,
    }
  }
  if (recipe) {
    return {
      kind: 'skill',
      id: skillId,
      label,
      required,
      state: 'missing',
      description: recipe.description,
      detail: 'Ready to install into this project.',
      setupSteps: recipe.setupSteps,
    }
  }
  return {
    kind: 'skill',
    id: skillId,
    label,
    required,
    state: 'unsupported',
    description: 'No starter skill recipe is currently bundled for this dependency id.',
    detail: 'No starter recipe is registered for this skill id yet.',
  }
}

function buildMcpDependencyStatus(
  mcpId: string,
  mcpSettings: McpSettingsView | null,
  required: boolean,
): WaggleAppDependencyStatus {
  const recipe = getWaggleAppMcpInstallRecipe(mcpId)
  const label = recipe?.label ?? mcpId
  const serverNames = recipe
    ? [recipe.serverName, ...(recipe.alternateServerNames ?? [])]
    : [mcpId]
  const server =
    mcpSettings?.servers.find((entry) => serverNames.includes(entry.name)) ?? null

  if (server?.enabled) {
    return {
      kind: 'mcp',
      id: mcpId,
      label,
      required,
      state: 'installed',
      description: recipe?.description,
      setupSteps: recipe?.setupSteps,
    }
  }
  if (server && !server.enabled) {
    return {
      kind: 'mcp',
      id: mcpId,
      label,
      required,
      state: 'missing',
      description: recipe?.description,
      detail: 'Configured but currently disabled.',
      setupSteps: recipe?.setupSteps,
    }
  }
  if (recipe) {
    return {
      kind: 'mcp',
      id: mcpId,
      label,
      required,
      state: 'missing',
      description: recipe.description,
      detail: 'Ready to add to project MCP config.',
      setupSteps: recipe.setupSteps,
    }
  }
  return {
    kind: 'mcp',
    id: mcpId,
    label,
    required,
    state: 'unsupported',
    description: 'No MCP install recipe is currently bundled for this dependency id.',
    detail: 'No install recipe is registered for this MCP id yet.',
  }
}

export function buildWaggleAppInstallStatus(input: {
  readonly app: WaggleAppManifest
  readonly catalog: SkillCatalogResult | null
  readonly mcpSettings: McpSettingsView | null
}): WaggleAppInstallStatus {
  const requiredMcpIds = dedupeDependencyIds(input.app.requiredMcps)
  const requiredSkillIds = dedupeDependencyIds(input.app.requiredSkills)
  const optionalMcpIds = dedupeDependencyIds(input.app.optionalMcps).filter(
    (mcpId) => !requiredMcpIds.includes(mcpId),
  )
  const optionalSkillIds = dedupeDependencyIds(input.app.optionalSkills).filter(
    (skillId) => !requiredSkillIds.includes(skillId),
  )
  const dependencies = [
    ...requiredMcpIds.map((mcpId) => buildMcpDependencyStatus(mcpId, input.mcpSettings, true)),
    ...requiredSkillIds.map((skillId) =>
      buildSkillDependencyStatus(skillId, input.catalog, true),
    ),
    ...optionalMcpIds.map((mcpId) => buildMcpDependencyStatus(mcpId, input.mcpSettings, false)),
    ...optionalSkillIds.map((skillId) =>
      buildSkillDependencyStatus(skillId, input.catalog, false),
    ),
  ]

  const requiredDependencies = dependencies.filter((dependency) => dependency.required)
  const optionalDependencies = dependencies.filter((dependency) => !dependency.required)

  const installedCount = requiredDependencies.filter(
    (dependency) => dependency.state === 'installed',
  ).length
  const missingCount = requiredDependencies.filter((dependency) => dependency.state === 'missing').length
  const unsupportedCount = requiredDependencies.filter(
    (dependency) => dependency.state === 'unsupported',
  ).length
  const optionalInstalledCount = optionalDependencies.filter(
    (dependency) => dependency.state === 'installed',
  ).length
  const optionalMissingCount = optionalDependencies.filter(
    (dependency) => dependency.state === 'missing',
  ).length
  const optionalUnsupportedCount = optionalDependencies.filter(
    (dependency) => dependency.state === 'unsupported',
  ).length

  return {
    ready: missingCount === 0 && unsupportedCount === 0,
    requiredDependencyCount: requiredDependencies.length,
    optionalDependencyCount: optionalDependencies.length,
    installedCount,
    missingCount,
    unsupportedCount,
    optionalInstalledCount,
    optionalMissingCount,
    optionalUnsupportedCount,
    dependencies,
  }
}

function dedupeDependencyIds(values: readonly string[] | undefined) {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const value of values ?? []) {
    if (!value || seen.has(value)) continue
    seen.add(value)
    normalized.push(value)
  }
  return normalized
}
