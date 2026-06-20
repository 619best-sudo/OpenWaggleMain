---
name: game-core-gameplay-builder
description: "Builds the runnable scaffold and the main game interaction. Invoke when the project needs bootstrapping, controls, rules, or the primary playable loop."
---

# Game Core Gameplay Builder

Use this skill to bootstrap the project and implement the main interaction loop the player controls directly.

## When To Use

Use this skill when:
- the game project needs entry files, scaffold files, boot modules, or dependency installation
- the project must be made runnable for the first time
- implementing the main player action such as movement, card interaction, puzzle input, or driving controls
- improving responsiveness and feel of the main loop
- ensuring the first QA pass receives a playable core interaction

Do not use this skill for broad surrounding-world behavior like enemy spawning, progression systems, or large-scale world reactions.

## Core Responsibilities

You own:
- runnable scaffold and boot path
- entry files, source roots, and config needed for the game to start
- the main player interaction and control loop
- input handling, interaction feel, and core responsiveness
- the minimum code needed so QA can actually play the game

## Working Rules

- Do not leave the repo half-scaffolded.
- Create entry files, source roots, config, and boot modules when missing.
- Install dependencies or initialize the workspace when required.
- Attempt install, dev, or build commands early enough to catch failures.
- Placeholder presentation is acceptable; a non-playable core loop is not.
- Keep core logic separate from broad surrounding behavior owned by systems work.

## MCP Guidance

Prefer these MCPs when relevant:
- `multimodal-media` for core-loop placeholder art, simple character or gameplay animation sources, UI-adjacent feedback art, and temporary audio cues
- `ffmpeg` for trimming or converting player-facing audio or simple motion assets
- rely on QA MCPs for deep browser evidence later, but do enough verification locally to avoid handing off a broken scaffold

## Output Format

End each turn with:
- scaffold and gameplay progress
- what is playable now
- commands run and result
- assets or media used for the core loop
- next handoff
