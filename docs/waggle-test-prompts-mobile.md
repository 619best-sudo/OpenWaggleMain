# Mobile Waggle Test Prompts

Use this file to test the built-in Waggle apps on a fresh mobile project.

## Recommended Fresh Project Setup

Preferred stack for testing:

- `Expo + React Native + TypeScript`

You can also use plain React Native if the simulator and tooling are already working.

Before testing, make sure the project has:

- a working simulator or emulator
- a local run command such as `pnpm expo start` or `pnpm dev`
- at least these screens:
  - login
  - home or dashboard
  - details screen
  - settings screen
- one API-backed flow
- one local form
- basic loading and error states
- an `.env.example`

## MCPs To Prepare

- `mobile-mcp`
- `postman` if the app talks to a local backend

Optional:

- `sql` if you also want to inspect local or attached API database performance
- `playwright` only if the mobile app shares a companion web UI you want to test too

## Important Note

The current Waggle stack is strongest on mobile code, screenshots, simulator inspection, QA, security review, and performance reasoning. It is less mature than the website flow for full native runtime automation depth, so keep the mobile fixture simple and runnable.

## Test Sequence

Run the Waggles in this order:

1. `product-planning`
2. `mobile-engineer`
3. `product-ui`
4. `qa-debug`
5. `development-qa`
6. `security-audit`
7. `performance-inspector`
8. `launch-readiness`

## 1. `product-planning`

### Primary Prompt

```text
We are starting a fresh mobile app for WaggleFlow.

The MVP needs:
- email login
- home screen with project list
- project detail screen
- create project form
- settings screen

Please plan a launchable mobile MVP.

Define:
- MVP scope
- non-goals
- acceptance criteria
- likely screen flows
- risks for mobile implementation
- recommended next Waggle
```

### Follow-Up Prompts

```text
Reduce this to the smallest mobile slice that still supports a useful internal beta.
```

```text
Tighten the acceptance criteria so a UI-focused Waggle can build the first screen flow without guessing.
```

## 2. `mobile-engineer`

### Primary Prompt

```text
Plan, implement, and verify a mobile app change in this project.

Start by reading the existing mobile code, navigation, screens, and styling approach.
If I attached a plan file, screenshot, mockup image, or UI description, use that as planning input too.

Then:
- identify which files should likely change
- identify any new files that may need to be created
- implement the real mobile screen or flow in the existing project structure
- if assets are needed, request one or more generated assets with explicit prompts, repo asset paths, and required output file types
- review the built code for any animation or motion work needed before final verification
- if animation work needs assets, request those too with explicit prompts, repo asset paths, and required output file types
- start or check the app locally
- verify there are no obvious compile or runtime errors
- use mobile-mcp to inspect the changed screen or flow
- compare the rendered result and animation behavior against the request and any attached reference artifact including Figma when available
- ensure every generated media file is saved inside the repository under an assets path
- for video requests, choose one delivery mode: direct-video, frames-every-second, or all-frames

If the built UI is not similar enough to the provided target, report the mismatch clearly and plan the next loop.

When asset generation is needed, use this exact structure:
- asset requests: none
- or asset requests:
  - assetType:
    intendedUsage:
    fileType:
    repoAssetPath:
    generationPrompt:
    videoDeliveryMode:
- asset outputs created: none
- or asset outputs created:
  - assetType:
    fileType:
    repoAssetPath:
    sourceMcp:
    status:
    videoDeliveryMode:
```

### Follow-Up Prompts

```text
This is an edit to an existing mobile feature. Reuse the current implementation path and avoid creating a duplicate screen or flow.
```

```text
Focus the next loop on matching the attached reference image more closely while keeping touch targets, navigation, and loading states stable.
```

```text
Use the verifier step to compare the changed screen in realistic device context before deciding whether the UI passes.
```

## 3. `product-ui`

### Primary Prompt

```text
Build the first mobile MVP screens in this project.

Implement:
- login screen
- home screen with project list
- create project flow
- settings screen shell

Requirements:
- use the real app structure
- keep spacing and hierarchy clean
- support loading and error states
- make the UI feel native and not web-like

Please implement the real UI and flow, not placeholder mock screens.
```

### Follow-Up Prompts

```text
Now tighten the mobile spacing, touch targets, and screen hierarchy so the app feels more polished.
```

```text
Assume the create project flow should be reusable later in an edit screen. Refactor only as much as needed for that.
```

```text
If I attach a mobile reference screenshot later, preserve the current screen structure but make it easier to align with that design.
```

## 4. `qa-debug`

### Code Setup Needed

Keep one known mobile bug for testing, for example:

- keyboard covers the submit button
- create project form does not clear after success
- back navigation is broken on the detail screen
- loading spinner never ends on a failed request

### Primary Prompt

```text
There is a mobile bug in this project:
- on smaller devices the keyboard covers the create project submit button
- after a failed submit the form state also becomes confusing

Reproduce the issue, isolate the root cause, fix it safely, and verify the result.
```

### Follow-Up Prompts

```text
Now check whether the same root cause also affects login or settings forms.
```

```text
Add the smallest useful regression protection if the fix still feels fragile.
```

## 5. `development-qa`

### Primary Prompt

```text
Create and execute a structured QA plan for this mobile app.

Cover:
- login flow
- home screen rendering
- create project flow
- back navigation
- loading and error states
- mobile-specific usability issues

Use the structured QA format with test cases, execution results, severity buckets, blocked areas, and a ship recommendation.
```

### Follow-Up Prompts

```text
Add more cases for small-screen behavior, slow network behavior, and repeated submit taps.
```

```text
Re-run only the failed or blocked cases after the latest fixes.
```

## 6. `security-audit`

### Code Setup Needed

Good targets for the mobile fixture:

- token storage or session persistence
- env usage
- any debug flags
- API error logging
- one privileged screen or setting

### Primary Prompt

```text
Run a security audit of this mobile project.

Check for:
- leaked secrets in code or config
- unsafe token or session handling
- sensitive logging
- insecure debug behavior
- weak validation
- risky client-side exposure

Apply safe hardening where appropriate and produce the structured security report.
```

### Follow-Up Prompts

```text
Focus specifically on login, token handling, settings, and any persisted session state.
```

```text
Re-run the audit after hardening and tell me what remains unresolved or only mitigated.
```

## 7. `performance-inspector`

### Code Setup Needed

Useful conditions:

- enough seeded list items to stress the home screen
- at least one slow API call or artificial delay
- an image-heavy or card-heavy screen

### Primary Prompt

```text
Run a performance inspection of this mobile app.

Focus on:
- app startup
- home screen responsiveness
- project list rendering
- create project flow latency
- repeated network calls
- obvious interaction stalls

Use the structured performance format with PI-* measurements, baseline vs observed, and a top 3 optimization plan.
```

### Follow-Up Prompts

```text
Focus only on the slowest screen and tell me the top 3 highest-value changes to improve perceived responsiveness.
```

```text
Re-measure after fixes and compare the results against the original PI measurements.
```

## 7. `launch-readiness`

### Primary Prompt

```text
Assess whether this mobile MVP is ready for an internal beta.

Please review:
- implemented scope
- verification coverage
- unresolved UX issues
- unresolved QA findings
- security concerns
- performance concerns

End with a clear ship recommendation.
```

### Follow-Up Prompts

```text
Assume this app will be demoed tomorrow on a real device. What are the blockers versus acceptable follow-up items?
```

```text
Rewrite the result as a concise mobile release checklist for a human maintainer.
```

## Optional Mobile UI Stress Prompts

If you want extra mobile UI pressure on top of `product-ui`, try these follow-ups inside the same Waggle:

```text
Now make the create project screen work well on a very small phone and on a large tablet-like width.
```

```text
Now revise the home screen so it feels more native to iOS and Android rather than like a compressed web page.
```

```text
Now assume I will attach a mobile design reference screenshot next. Prepare the current screen structure so fidelity alignment will be easier in the next pass.
```
