import type { WagglePreset } from '@shared/types/waggle'

export interface WaggleStarterPrompt {
  readonly id: string
  readonly title: string
  readonly prompt: string
}

const PRESET_STARTER_PROMPTS: Readonly<Record<string, readonly WaggleStarterPrompt[]>> = {
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
}

export function getPresetStarterPrompts(
  presetId: string | WagglePreset['id'],
): readonly WaggleStarterPrompt[] {
  return PRESET_STARTER_PROMPTS[String(presetId)] ?? []
}
