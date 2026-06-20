# Website Waggle Test Prompts

Use this file to test the built-in Waggle apps on a fresh website project.

## Recommended Fresh Project Setup

Use a simple but real website project, for example:

- `Vite + React + Tailwind`
- or `Next.js + Tailwind`

Before testing, make sure the project has:

- a working local dev server such as `pnpm dev`
- a stable local URL such as `http://localhost:3000` or `http://localhost:5173`
- at least these pages or sections:
  - home page
  - pricing or features section
  - contact or signup form
  - header and footer
- one reusable button component
- one reusable card component
- an `.env.example` if the project uses env vars

## MCPs To Prepare

- `playwright`
- `chrome-devtools`

Optional:

- `postman` if the site has a form submit API you want to test
- `sql` if the website is backed by a database and you want performance inspection on queries

## Test Sequence

Run the Waggles in this order for the cleanest test pass:

1. `product-planning`
2. `web-engineer`
3. `product-ui`
4. `frontend-ui-audit`
5. `reference-image-replication`
6. `design-system-compliance`
7. `responsive-qa`
8. `qa-debug`
9. `development-qa`
10. `security-audit`
11. `performance-inspector`
12. `launch-readiness`

## 1. `product-planning`

### Primary Prompt

```text
We are starting a fresh marketing website for a developer tool called WaggleFlow.

Goal:
- ship a public homepage MVP
- explain the product clearly in under 10 seconds
- drive users to a "Start Free" CTA

The homepage should include:
- hero section
- trust bar
- features grid
- how-it-works section
- pricing teaser
- footer CTA

Please plan the MVP for this website. Keep it small and launchable. Define acceptance criteria, non-goals, risks, and recommend the next Waggle to use.
```

### Follow-Up Prompts

```text
Tighten the acceptance criteria so a UI builder can implement this without ambiguity.
```

```text
Reduce the scope further so this can be built in one focused pass on a fresh project.
```

```text
Assume we only have placeholder copy and no designer. Update the plan accordingly.
```

## 2. `web-engineer`

### Primary Prompt

```text
Plan, implement, and verify a website change in this project.

Start by reading the existing web code, routes, components, and styling approach.
If I attached a plan file, screenshot, mockup image, or UI description, use that as planning input too.

Then:
- identify which files should likely change
- identify any new files that may need to be created
- implement the real website change in the existing project structure
- if assets are needed, request one or more generated assets with explicit prompts, repo asset paths, and required output file types
- review the built code for any animation or motion work needed before final verification
- if animation work needs assets, request those too with explicit prompts, repo asset paths, and required output file types
- start or check the project locally
- verify there are no obvious compile or runtime errors
- use Playwright to inspect the changed route or section
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
This is an edit to an existing website feature. Reuse the current implementation path and avoid creating a duplicate section or route.
```

```text
Focus the next loop on matching the attached reference image more closely while keeping the page responsive and stable.
```

```text
Use the verifier step to compare both the changed section and the full page context before deciding whether the UI passes.
```

## 3. `product-ui`

### Primary Prompt

```text
Build the homepage MVP for WaggleFlow in this website project.

Requirements:
- implement the hero, trust bar, features grid, how-it-works section, pricing teaser, and footer CTA
- keep the design clean and modern for a developer audience
- use the current project styling approach and reusable primitives where possible
- make the page responsive
- if you change a specific section, the audit should review both that section and the full page

Please implement the real UI, not a mockup.
```

### Follow-Up Prompts

```text
Now improve the CTA hierarchy and make the hero copy more conversion-focused without changing the overall page structure.
```

```text
Now tighten spacing, alignment, and empty-state polish across the whole page.
```

```text
Now assume the pricing teaser must be a reusable section component because it will also appear on another route.
```

## 4. `frontend-ui-audit`

### Primary Prompt

```text
Audit the current homepage UI for visual quality and obvious breakage.

Focus on:
- spacing
- hierarchy
- CTA clarity
- copy quality
- alignment
- broken or awkward states

Capture both the hero section itself and the full page in the review.
```

### Follow-Up Prompts

```text
Focus only on the hero and pricing teaser now. Report the top 5 issues by severity.
```

```text
Re-audit after the latest fixes and tell me whether the page is ready for a demo.
```

## 5. `reference-image-replication`

### Code Setup Needed

- have one reference screenshot ready to attach
- the project should already contain the page or route where the section will be implemented

### Primary Prompt

```text
I am attaching a reference image for a website hero section.

Please replicate that hero section in the actual homepage of this project as closely as possible while staying consistent with the current styling system.

Match:
- layout
- spacing rhythm
- visual hierarchy
- button emphasis
- text grouping

Explain any justified deviations from the image.
```

### Follow-Up Prompts

```text
Reduce the visual mismatch further, especially in spacing and text grouping.
```

```text
Keep the same structure but make it feel more native to this project's existing design language.
```

## 5. `design-system-compliance`

### Primary Prompt

```text
Review the homepage and make sure it feels native to the rest of the product or website.

Focus on:
- primitive reuse
- spacing consistency
- typography rhythm
- button and card consistency
- avoiding one-off styling
```

### Follow-Up Prompts

```text
List the top design-system violations first, then apply only the highest-value fixes.
```

```text
Assume this page will become the style reference for future marketing pages. Tighten the system quality accordingly.
```

## 6. `responsive-qa`

### Primary Prompt

```text
Stress-test this homepage for responsive issues.

Check:
- small mobile widths
- tablet widths
- large desktop widths
- long feature titles
- long pricing copy
- overflowing buttons or cards

Report clipping, overflow, awkward wrapping, and layout instability.
```

### Follow-Up Prompts

```text
Focus only on the hero, features grid, and pricing teaser. Fix the highest-severity responsive issues.
```

```text
Now test with very long copy in headings and button labels and report what breaks.
```

## 7. `qa-debug`

### Code Setup Needed

Introduce or keep one known bug for testing, for example:

- CTA button scroll target is wrong
- mobile nav does not close after link click
- pricing cards overflow on narrow screens
- contact form success state never appears

### Primary Prompt

```text
There is a website bug in this project:
- on small screens the pricing cards overflow horizontally
- the CTA section also looks cramped below 360px width

Reproduce the issue, isolate the root cause, fix it, and verify the result.
```

### Follow-Up Prompts

```text
Now verify whether the same root cause also affects the features grid or footer CTA.
```

```text
Add the smallest meaningful regression protection if the fix still feels fragile.
```

## 8. `development-qa`

### Primary Prompt

```text
Create and execute a structured QA plan for this website homepage.

Cover:
- navigation
- hero CTA behavior
- responsive behavior
- pricing teaser behavior
- contact or signup form behavior
- visible console or request failures

Use the built-in QA format with structured test cases and report all issues found.
```

### Follow-Up Prompts

```text
Add more coverage for keyboard navigation, form validation, and error states, then run the new cases.
```

```text
Re-run only the failed or blocked cases after the latest fixes.
```

## 9. `security-audit`

### Code Setup Needed

Good targets to include in the test fixture:

- a contact form handler
- one `.env.example`
- analytics or tracking config
- one place where user input is rendered or submitted

### Primary Prompt

```text
Run a security audit of this website project.

Check for:
- leaked secrets or unsafe env handling
- unsafe client exposure
- insecure form handling
- sensitive logging
- weak validation
- obvious security risks in any public-facing flows

Apply safe hardening where appropriate and end with the structured security report.
```

### Follow-Up Prompts

```text
Focus specifically on the contact form, client-side env usage, and any analytics or tracking configuration.
```

```text
Re-run the audit after hardening and tell me what remains unresolved.
```

## 10. `performance-inspector`

### Code Setup Needed

Useful test data:

- several large feature cards or images
- a form submit or API request
- fonts or assets large enough to create measurable web performance work

### Primary Prompt

```text
Run a performance inspection of this website project.

Focus on:
- homepage load path
- hero rendering
- image and font cost
- request waterfalls
- script cost
- form submit latency if applicable

Use the structured performance format with PI-* measurements, baseline vs observed, and a top 3 optimization plan.
```

### Follow-Up Prompts

```text
Focus only on above-the-fold performance and tell me the top 3 changes that would improve perceived load time the most.
```

```text
Re-measure after fixes and compare the new results against the previous PI measurements.
```

## 11. `launch-readiness`

### Primary Prompt

```text
Assess whether this website homepage work is ready to ship.

Please review:
- what changed
- what was verified
- unresolved UI issues
- unresolved QA findings
- security concerns
- performance risks

End with a clear ship recommendation.
```

### Follow-Up Prompts

```text
Assume this page is going live tomorrow. What are the remaining blockers versus acceptable follow-up items?
```

```text
Rewrite the result as a concise launch checklist for a human maintainer.
```
