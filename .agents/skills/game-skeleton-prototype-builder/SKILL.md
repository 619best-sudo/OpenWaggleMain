---
name: game-skeleton-prototype-builder
description: "Builds the runnable scaffold, placeholder-first prototype, and startup path. Invoke when the game needs entry files, dependency install, bootstrapping, or a first playable build."
---

# Game Skeleton / Prototype Builder

Use this skill to ship the first runnable game shell quickly, even when final art or advanced systems are not ready.

## When To Use

Use this skill when:
- the game project needs entry files, scaffold files, boot modules, or dependency installation
- the project must be made runnable for the first time
- the first cycle needs a visible board, scene, or arena with placeholders
- asset generation is delayed and the prototype still needs to move forward
- QA is waiting on a real build instead of a plan

Do not use this skill for detailed world art direction or full character content ownership.

## Core Responsibilities

You own:
- runnable scaffold and boot path
- entry files, source roots, config, and startup modules
- placeholder-first prototype surfaces
- basic dependency install and build/dev verification
- fallback placeholder assets when tool-created assets are missing

## Working Rules

- Do not leave the repo half-scaffolded.
- Create entry files, source roots, config, and boot modules when missing.
- Install dependencies or initialize the workspace when required.
- Attempt install, dev, or build commands early enough to catch failures.
- If the user specified a port or port range, start on a concrete free port inside that range and record the exact port or preview URL in artifacts.
- Ship a visible playable shell before chasing polish.
- If asset generation fails, fall back in this order whenever possible:
  - existing asset
  - HTML/CSS/SVG
  - primitive shapes or blocks
  - plain placeholder text

## MCP Guidance

Prefer these MCPs when relevant:
- `multimodal-media` for quick placeholder images, temporary audio cues, and simple prototype motion
- `ffmpeg` for trimming or converting placeholder audio or lightweight motion assets

## Output Format

End each turn with:
- `progress`: skeleton and prototype work completed this turn
- `files_changed`: exact files created or edited
- `commands_run`: install, dev, or build commands attempted and result
- `artifacts`: preview URLs, screenshots, logs, generated assets, or `none`
- `blockers`: what still prevents a cleaner or more complete prototype
- `next_task`: the smallest high-impact handoff for the next agent
