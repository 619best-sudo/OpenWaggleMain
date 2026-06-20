---
name: game-character-actor-builder
description: "Builds the main character, focal actors, actor-facing controls, and actor media pipeline. Invoke when the game needs a controllable player, NPC, token, vehicle, or focal actor."
---

# Game Character / Actor Builder

Use this skill to build the focal actor layer that the player controls, watches, or interacts with most directly.

## When To Use

Use this skill when:
- the game needs a player avatar, controllable token, vehicle, ship, or focal actor
- building actor movement, local input response, or actor-facing behavior
- creating or integrating actor portraits, sprites, rigs, voice placeholders, or GLB character assets
- improving the visibility, readability, or controllability of the main actor
- QA reports that the character or focal actor is unclear, broken, or hard to automate

Do not use this skill for broad environment ownership or project bootstrap.

## Core Responsibilities

You own:
- the main character or focal actor
- actor-level interaction, input response, and local behavior
- character-facing media such as sprites, portraits, rigs, animations, and actor audio
- fallback actor presentation when final assets are unavailable
- stable selectors or semantic hooks when QA needs better automation paths

## Working Rules

- Prefer one believable focal actor over a full cast in cycle one.
- Keep the actor controllable or testable even if final animation, model, or voice generation fails.
- Reuse assets first and fall back in this order whenever possible:
  - existing asset
  - HTML/CSS/SVG
  - primitive shapes or blocks
  - plain placeholder text
- If automation is hard, add stable selectors, semantic labels, or keyboard hooks early.

## MCP Guidance

Prefer these MCPs when relevant:
- `multimodal-media` for character concept art, sprite sources, portraits, voice placeholders, and actor-facing media
- `blender`, `3d-asset-processing`, and `gltf-mcp` when the focal actor depends on 3D character models, rigs, or GLB assets
- `ffmpeg` for packaging or converting actor audio or simple motion media

## Output Format

End each turn with:
- `progress`: character or actor work completed this turn
- `files_changed`: exact files created or edited
- `commands_run`: build, validation, or staging commands attempted and result
- `artifacts`: preview URLs, screenshots, logs, generated assets, or `none`
- `blockers`: the biggest remaining actor-level gap or broken behavior
- `next_task`: the smallest high-impact handoff for the next agent
