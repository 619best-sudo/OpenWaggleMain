import type { WagglePreset } from '@shared/types/waggle'

export interface WaggleStarterPrompt {
  readonly id: string
  readonly title: string
  readonly prompt: string
}

const PRESET_STARTER_PROMPTS: Readonly<Record<string, readonly WaggleStarterPrompt[]>> = {
  turing: [
    {
      id: 'route-full-product-lifecycle',
      title: 'Route full product lifecycle',
      prompt:
        'Read this request and route it into the best next lifecycle Waggle for this repository. Decide whether the work should begin with product-planning, design-asset-direction, web-build, mobile-build, backend-build, qa-repair-loop, quality-assurance-engineer, release-readiness, or deployment, and explain the likely follow-up Waggle after that first step.',
    },
    {
      id: 'route-mobile-feature-flow',
      title: 'Route mobile feature flow',
      prompt:
        'This request is likely a mobile product change. Inspect the repository first, determine whether the next step should be product-planning, design-asset-direction, mobile-build, qa-repair-loop, or quality-assurance-engineer, and produce a concrete starter prompt for the chosen Waggle plus the likely follow-up step after it.',
    },
  ],
  'product-planning': [
    {
      id: 'plan-mvp-lifecycle',
      title: 'Plan MVP and lifecycle',
      prompt:
        'Turn this request into a concrete MVP plan for this repository. Define what should be built first, what acceptance criteria must hold, whether design-asset-direction is needed, which build Waggle should execute next, and what QA and release steps should follow after implementation.',
    },
    {
      id: 'plan-mobile-feature',
      title: 'Plan mobile feature',
      prompt:
        'Create a build-ready plan for a mobile feature or mobile product improvement in this repository. Clarify the target users, affected screens or flows, acceptance criteria, design or asset needs, the exact scope for mobile-build, and the QA path that should follow before release.',
    },
  ],
  'design-asset-direction': [
    {
      id: 'beautiful-landing-direction',
      title: 'Beautiful landing page direction',
      prompt:
        'Turn this request into a build-ready design and asset plan for a beautiful landing page or homepage hero in this repository. Start from the best available source such as repo UI, screenshots, Figma, external references, or only a verbal prompt. Decide the section structure, hierarchy, hero mode, and asset sourcing order. If rich media is not clearly justified, default to static or code-only UI and name the exact fallback ladder before handing off to build.',
    },
    {
      id: 'app-ui-from-verbal-brief',
      title: 'App UI from verbal brief',
      prompt:
        'Create a design and asset direction from a verbal product prompt only. Inspect the current product surfaces first, map the requested screens or sections into the existing design language, decide whether assets are truly needed, and produce a concrete builder handoff with components, layout structure, hero mode if relevant, repo asset paths, and fallback rules.',
    },
  ],
  'web-build': [
    {
      id: 'build-planned-web-surface',
      title: 'Build planned web surface',
      prompt:
        'Implement the scoped web surface from the latest planning and asset handoff. Build the real route or component in this repository, reuse the existing architecture, keep any generated or imported assets inside the repo, and leave a clean route-plus-risk handoff for the QA Repair Loop.',
    },
    {
      id: 'hero-with-fallbacks',
      title: 'Hero build with media fallback',
      prompt:
        'Build a polished landing page or hero section in this repository using the provided design and asset plan. If the asset plan calls for static, animated-ui, video, or frames, follow it exactly. If the rich-media path fails, keep the page shippable with the declared fallback instead of stalling the implementation, then hand off the exact route and states for QA.',
    },
  ],
  'mobile-build': [
    {
      id: 'build-planned-mobile-flow',
      title: 'Build planned mobile flow',
      prompt:
        'Implement the scoped mobile screen or flow from the latest planning and asset handoff. Fit the change into the current navigation, screen, and styling architecture, preserve platform behavior, keep assets in repo-owned paths, and hand off the exact runtime flow for the QA Repair Loop.',
    },
    {
      id: 'mobile-ui-refinement',
      title: 'Refine existing mobile UI',
      prompt:
        'Refine an existing mobile screen or flow in this repository rather than creating a duplicate UX path. Use the latest design and asset handoff, preserve surrounding navigation and state, apply the smallest reliable implementation, and leave a clean device-flow handoff for QA.',
    },
  ],
  'backend-build': [
    {
      id: 'implement-scoped-backend-change',
      title: 'Implement scoped backend change',
      prompt:
        'Implement the planned backend, API, or data change in this repository. Start from the current contracts and persistence paths, apply the smallest reliable change, preserve validation and error handling, and hand off the exact endpoint, command, and data expectations for the QA Repair Loop.',
    },
    {
      id: 'bugfix-with-verification-handoff',
      title: 'Backend bugfix with QA handoff',
      prompt:
        'Fix a scoped backend or API issue in the real implementation path. Avoid broad refactors, preserve adjacent behavior, and leave a precise verification handoff that names the affected endpoints, commands, and expected stored-data results.',
    },
  ],
  'web-engineer': [
    {
      id: 'landing-page-refresh',
      title: 'Landing page refresh',
      prompt:
        'Plan, implement, animate if justified, and verify a landing page or homepage refresh in this repository. First inspect the existing web app, any provided mock, screenshot, doc, or Figma input, and decide whether the request needs no motion, microinteractions only, stronger animation, or generated media. Then update the real implementation, keep any generated image or video assets inside repo assets paths when needed, use animation only where it improves the result, and verify the final UI with Playwright against the requested experience plus any nearby web flows that may have been disturbed.',
    },
    {
      id: 'existing-web-feature-edit',
      title: 'Edit existing web feature',
      prompt:
        'This is an edit to an existing web feature, not a greenfield build. First inspect the current implementation, any provided design references, and the disturbed routes, components, or shared logic that could be affected. Then update the existing feature safely, add microinteractions only if the request or UX warrants them, avoid unnecessary media generation, and verify the changed path plus adjacent web flows with Playwright before sign-off.',
    },
    {
      id: 'figma-to-web-ui',
      title: 'Figma to web UI',
      prompt:
        'Build a web UI from the provided Figma or design reference. First read the relevant files and map the design into the existing web architecture, including any assets, animations, responsive behavior, and disturbed shared components that may need updates. Then implement the UI in the real feature path, create any required repo-owned assets under assets if generation is needed, and verify with Playwright that the delivered UI matches the provided design reference closely enough across the affected flows.',
    },
    {
      id: 'web-regression-fix',
      title: 'Web regression and blast radius',
      prompt:
        'Investigate and fix a web regression in this repository. First identify the main broken surface and the other routes, components, shared state, APIs, or design-dependent flows whose behavior may have been disturbed by the change. Then implement the safest fix in the real code path, use animation or generated media only if the request clearly needs it, and verify both the main web regression and the adjacent disturbed flows with Playwright before declaring the work complete.',
    },
  ],
  'mobile-engineer': [
    {
      id: 'mobile-onboarding-refresh',
      title: 'Mobile onboarding refresh',
      prompt:
        'Plan, implement, animate if justified, and verify a mobile onboarding or welcome-flow update in this repository. First inspect the current mobile project, any provided mock, screenshot, doc, or Figma input, and decide whether the request needs no motion, microinteractions only, stronger animation, or generated media. Then update the real implementation, keep any generated image or video assets inside repo assets paths when needed, use animation only where it improves the actual experience, and verify the final mobile UI and surrounding flows with mobile runtime tooling.',
    },
    {
      id: 'existing-mobile-feature-edit',
      title: 'Edit existing mobile feature',
      prompt:
        'This is an edit to an existing mobile feature, not a greenfield build. First inspect the current implementation, provided design references, and the adjacent screens, navigation paths, or shared logic that could be disturbed. Then update the existing feature safely, add microinteractions only if the request or UX warrants them, avoid unnecessary media generation, and verify the changed path plus nearby mobile flows with mobile-mcp before sign-off.',
    },
    {
      id: 'figma-to-mobile-ui',
      title: 'Figma to mobile UI',
      prompt:
        'Build a mobile UI from the provided Figma or design reference. First map the design into the existing mobile architecture, including assets, motion, device constraints, and any shared screens or components that may need coordinated updates. Then implement the real feature, create any required repo-owned assets under assets if generation is needed, and verify with mobile runtime tooling that the delivered mobile UI matches the design reference closely enough across the affected flows.',
    },
    {
      id: 'mobile-regression-fix',
      title: 'Mobile regression and blast radius',
      prompt:
        'Investigate and fix a mobile regression in this repository. First identify the main broken screen or flow and the other screens, navigation paths, shared state, APIs, or data flows whose behavior may have been disturbed by the change. Then implement the safest fix in the real code path, use animation or generated media only if the request clearly needs it, and verify both the main regression and the adjacent disturbed mobile flows with mobile-mcp before declaring the work complete.',
    },
  ],
  'backend-engineer': [
    {
      id: 'new-api-feature',
      title: 'New API feature',
      prompt:
        'Plan, implement, and verify a new backend feature in this repository. First inspect the existing backend architecture and identify which files should be changed or created. Then build the feature using the current patterns, compile or typecheck the affected code, exercise the API flow with the API-call MCP, and verify the final database state with the database MCP.',
    },
    {
      id: 'existing-feature-edit',
      title: 'Edit existing feature',
      prompt:
        'This is an edit to an existing backend feature, not a greenfield build. First read the current implementation and identify the exact files that should change. Then update the existing behavior safely, avoid duplicate code paths, compile or typecheck the affected code, exercise the changed API flow with the API-call MCP, and verify the resulting database state with the database MCP.',
    },
    {
      id: 'bugfix-with-data-check',
      title: 'Bugfix and data check',
      prompt:
        'Investigate and fix a backend issue in this repository. Start by mapping the request to the current backend files and identifying what will likely change. Then implement the fix in the real feature path, compile or typecheck the affected code, reproduce the API flow with the API-call MCP, and verify in the database MCP that the expected records were inserted, updated, or left untouched correctly.',
    },
  ],
  'quality-assurance-engineer': [
    {
      id: 'web-qa-regression',
      title: 'Web QA and regressions',
      prompt:
        'Run a complete web QA cycle for this change. First plan the full browser test suite for the changed website or web-app surface, including happy paths, edge cases, error states, accessibility or usability risks when obvious, and regressions in nearby routes, components, or flows that could have been disturbed by the change. Then execute the planned browser cases with Playwright, record pass/fail/blocked outcomes, capture evidence, and finish with a final QA judgment on whether the web change is safe to ship.',
    },
    {
      id: 'mobile-qa-regression',
      title: 'Mobile QA and regressions',
      prompt:
        'Run a complete mobile QA cycle for this change. First plan the full mobile test suite for the changed screen, navigation path, or app flow, including happy paths, edge cases, failure states, device or runtime risks, and regressions in adjacent screens or flows that may have been disturbed. Then execute the planned cases with mobile-mcp, record pass/fail/blocked outcomes, capture evidence, and finish with a final QA judgment on whether the mobile change is safe to ship.',
    },
    {
      id: 'backend-qa-api-sql',
      title: 'Backend API and SQL QA',
      prompt:
        'Run a complete backend QA cycle for this change. First plan the full API and data-validation suite for the affected backend behavior, including happy paths, invalid input, auth or permission cases, error handling, contract checks, and regressions in other endpoints, workers, or data flows that could have been disturbed. Then execute the API cases with the Postman-style MCP, verify stored data and query results with SQL MCP, record pass/fail/blocked outcomes, and finish with a final QA judgment on whether the backend change is safe to ship.',
    },
    {
      id: 'cross-flow-blast-radius',
      title: 'Disturbed flow blast radius',
      prompt:
        'Do a QA pass focused on ripple effects from this change. First identify the primary feature that changed and then plan all the other files, routes, screens, APIs, database behaviors, and user flows whose functionality may have been disturbed indirectly. Cover web, mobile, and backend surfaces when relevant. Execute the planned tests with the right tools such as Playwright, mobile-mcp, API-call MCP, and SQL MCP, record evidence for confirmed regressions or blocked areas, and finish with a final QA judgment that clearly states what still needs retesting before ship.',
    },
  ],
  'qa-debug': [
    {
      id: 'ui-layout-debug',
      title: 'UI layout bug',
      prompt:
        'Debug and fix a UI issue in this repository. First classify whether the bug is really a UI-only problem or a mixed issue, then reproduce it with Playwright or mobile runtime tooling, capture the affected component or screen, and add targeted measurements such as width, height, x, y, bounding box, computed style, or console errors when useful. Apply the smallest reversible fix, verify the component and the surrounding disturbed page or flow, and if the fix does not work, revert that attempt and carry the learning into the next planner pass.',
    },
    {
      id: 'backend-api-debug',
      title: 'Backend API bug',
      prompt:
        'Debug and fix a backend or API issue in this repository. First classify the failing boundary, then reproduce it with API-call tooling, capture request and response evidence, add scoped logs where needed, and verify any affected SQL or stored-data assumptions. Apply the smallest reversible fix, verify the original failing path plus any nearby endpoints or data flows that may have been disturbed, and if the attempt does not work, revert it before the next loop and forward the failed-attempt learning.',
    },
    {
      id: 'logic-state-debug',
      title: 'Logic or state bug',
      prompt:
        'Debug and fix a logic or state issue in this repository. First reverse engineer the failing path, classify whether it is pure logic or mixed with UI or backend behavior, and add targeted temporary logs around state transitions, branch conditions, async ordering, cache behavior, retries, or stale data assumptions. Apply the smallest reversible fix, verify the original behavior and the adjacent flows that depend on the same logic, and if the result is not fixed, undo that code change before the next loop and pass the new learning back to the planner.',
    },
    {
      id: 'mixed-regression-debug',
      title: 'Mixed disturbed flow regression',
      prompt:
        'Debug and fix a mixed regression where one change may have disturbed other files or flows. First classify the issue across UI, backend, logic, mobile, API, or SQL layers, then reproduce the main failure and investigate all adjacent routes, screens, endpoints, database behaviors, and shared logic that may have been disturbed. Use the right MCPs for each layer, gather evidence, apply the smallest reversible fix, verify both the main issue and the disturbed flows, and if the attempt does not work, revert it fully and send the failed-attempt learning into the next planner cycle.',
    },
  ],
  'qa-repair-loop': [
    {
      id: 'verify-fix-retest-web',
      title: 'Verify, fix, and retest web change',
      prompt:
        'Run a QA repair loop for a changed web surface in this repository. Start by verifying the real browser behavior with the strongest evidence available, turn any failures into a concrete defect list, apply the smallest focused fix, and rerun the critical checks before deciding whether the result now passes or needs another loop.',
    },
    {
      id: 'verify-fix-retest-mobile',
      title: 'Verify, fix, and retest mobile change',
      prompt:
        'Run a QA repair loop for a changed mobile screen or flow in this repository. Start by verifying the real device or simulator behavior with mobile runtime tooling, turn any failures into a concrete defect list, apply the smallest focused fix, and rerun the critical mobile checks before deciding whether the result now passes or needs another loop.',
    },
    {
      id: 'verify-fix-retest-mixed',
      title: 'Verify, fix, and retest mixed issue',
      prompt:
        'Run a QA repair loop for a mixed issue that may span UI, backend, API, mobile, or data behavior. Verify first, produce structured defects, pick the single highest-value repair pass, apply the smallest fix, and rerun the most important checks before deciding the next route.',
    },
  ],
  'release-readiness': [
    {
      id: 'ship-readiness-check',
      title: 'Ship readiness check',
      prompt:
        'Decide whether this change is ready to ship. Summarize what changed, what evidence exists, what remains assumed, what the biggest risks are, and whether the current state is ready, almost ready, or not ready for release.',
    },
    {
      id: 'beta-demo-merge-decision',
      title: 'Beta, demo, or merge decision',
      prompt:
        'Evaluate this work for the next milestone such as merge, demo, beta, or release. Use the strongest available verification evidence, separate true blockers from lower-priority follow-ups, and produce a decisive recommendation plus the smallest remaining work if it is not ready.',
    },
  ],
  deployment: [
    {
      id: 'manual-runbook-deployment',
      title: 'Manual deployment runbook',
      prompt:
        'Prepare and execute the safest deployment path available in this repository. If automated deployment tooling is not installed here, produce the exact manual deployment runbook, list prerequisites, record commands or steps in order, and finish with the post-deploy checks that should validate the result.',
    },
    {
      id: 'post-release-validation',
      title: 'Post-release validation',
      prompt:
        'Validate a deployment result for this repository. Review the planned deployment path, the actual execution evidence, any runtime smoke checks, and decide whether the deployment succeeded, partially completed, or failed with a rollback recommendation.',
    },
  ],
}

export function getPresetStarterPrompts(
  presetId: string | WagglePreset['id'],
): readonly WaggleStarterPrompt[] {
  return PRESET_STARTER_PROMPTS[String(presetId)] ?? []
}
