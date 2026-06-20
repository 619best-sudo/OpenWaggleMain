---
name: game-loop-contract-governor
description: "Defines game-cycle handoffs, QA gates, artifacts, fallback rules, and failure routing. Invoke when coordinating multi-agent game loops or tightening QA evidence."
---

# Game Loop Contract Governor

Use this skill to enforce a shared operating contract across the game waggle so agents hand off structured work instead of vague summaries.

## When To Use

Use this skill when:
- coordinating a multi-agent game build loop
- tightening the first-cycle expectation so QA receives a runnable build
- forcing agents to report artifacts, commands, evidence, and blockers in a consistent format
- improving repair routing after QA findings
- preventing asset failures or missing polish from blocking a playable build

Do not use this skill as a replacement for skeleton, world, character, or QA execution work.

## Contract Goals

The game loop should produce:
- a runnable, testable build as early as possible
- structured handoffs between agents
- explicit evidence for build, browser, and asset claims
- repeatable QA results with screenshots and logs
- focused repair loops instead of broad replanning

## Shared Handoff Packet

Every non-QA turn should end with all of the following:
- `progress`: what was built or changed this turn
- `files_changed`: exact files created, edited, or intentionally skipped
- `commands_run`: relevant install, build, test, or dev commands and their result
- `artifacts`: preview URLs, screenshots, logs, generated assets, or `none`
- `blockers`: what is still broken or unknown
- `next_task`: the smallest high-impact handoff for the next agent

If an agent has no real evidence, it must say so directly instead of implying success.

## First-Cycle QA Gate

The first QA pass should reject the cycle unless the build has:
- a runnable project or a successful relevant build command
- real scaffold files and entry files where the stack requires them
- a visible play surface such as a board, scene, arena, or level
- a controllable core interaction
- minimal supporting systems required to test the loop

Polish, perfect assets, and advanced content are not required for the first QA pass.

## Artifact Rules

Whenever possible, track:
- screenshot file paths or names
- console log summaries or file paths
- build or dev command output summary
- preview URL if a server is running
- generated asset names and whether they are staged, approved, or placeholder

Use concrete artifact names instead of vague phrases like "captured evidence".

## Placeholder And Fallback Policy

- Reuse existing repo or external assets before generating replacements.
- Treat generated assets as staged inputs until validated.
- If asset generation fails, prefer placeholders over blocking the cycle.
- Prefer this fallback ladder when possible: existing asset -> HTML/CSS/SVG -> primitive shapes or blocks -> plain placeholder text.
- If a placeholder is used, say so clearly and mark whether it should be upgraded later.
- Do not fail the first cycle only because final art, audio, or animation is missing.

## Failure Categories

QA and follow-up planning should classify failures as one or more of:
- `bootstrap`
- `environment-presentation`
- `character-actor`
- `asset-pipeline`
- `performance`
- `qa-evidence`

This classification should drive the next repair loop.

## Routing Rules

- If the app does not install, build, boot, or open: route to skeleton/prototype first.
- If the app opens but the play surface is broken or unreadable: route to world/environment.
- If the main character, focal actor, or actor control is broken: route to character/actor.
- If automation is fragile because controls are hard to target: route to character/actor or skeleton/prototype with selector requirements.
- If logs point to model, texture, audio, or media problems: route to the relevant builder with asset notes.
- If the build basically works, spend later cycles on polish, performance, UX clarity, and asset upgrades.

## QA Output Contract

QA should end with:
- `loop_verdict`: `approved`, `another cycle required`, or `cut scope now`
- `failure_categories`
- `top_blockers`
- `evidence_reviewed`
- `screenshots`
- `logs`
- `exact_next_cycle`

## Builder Reminder

Builders should not hand QA:
- a package manifest without entry files
- a partial scaffold with no playable surface
- unvalidated generated 3D assets in runtime
- vague claims like "should work" without any command or artifact evidence
