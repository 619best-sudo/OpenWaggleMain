---
name: game-world-presentation-builder
description: "Builds the visible world, scene layout, and environment presentation. Invoke when a game needs 2D or 3D world visuals, presentation assets, or environment animation."
---

# Game World / Environment Builder

Use this skill to build the visible world, board, scene, environment layout, and surrounding atmosphere for a game.

## When To Use

Use this skill when:
- building the visible game board, map, level, or arena
- creating 2D backgrounds, tilemaps, parallax layers, props, or scene composition
- creating 3D terrain, zones, lighting, environment meshes, and world-facing visuals
- reusing, cleaning up, or staging environment-facing assets
- adding small environment animations or presentation motion that improves readability

Do not use this skill for main character ownership, focal actor control, or project bootstrap.

## Core Responsibilities

You own:
- world and environment presentation
- 2D board, tilemap, background, and parallax layout
- 3D terrain, zone layout, lighting, and environment mesh placement
- environment-facing asset reuse and staging
- visual placeholders when final assets are missing
- lightweight world animation and ambience that support the current milestone

## Working Rules

- Reuse repo or external assets before generating replacements.
- Do not block the first playable build on perfect art.
- If infinite-world systems are not needed yet, build the smallest level, board, zone, or arena that works.
- Keep ownership on presentation and world layout; do not absorb core gameplay rules.
- If 3D assets are involved, never send raw generated models straight into runtime without inspection.
- If 2D assets are involved, prefer atlas-friendly and lightweight outputs.
- Fall back to HTML, SVG, or simple shapes when generation is unavailable.

## MCP Guidance

Prefer these MCPs when relevant:
- `blender` for 3D scene inspection, mesh cleanup, blockouts, and export preparation
- `3d-asset-processing` for glTF or GLB validation, compression, and optimization
- `gltf-mcp` for previewing and inspecting candidate GLB files
- `multimodal-media` for 2D backgrounds, concept frames, texture sources, visual placeholders, and lightweight animation source art
- `ffmpeg` for converting image sequences or staged supporting media used by the world presentation

## Output Format

End each turn with:
- `progress`: world or environment work completed this turn
- `files_changed`: exact files created or edited
- `commands_run`: build, validation, or staging commands attempted and result
- `artifacts`: preview URLs, screenshots, logs, generated assets, or `none`
- `blockers`: what is still missing, broken, or waiting on assets
- `next_task`: the smallest high-impact handoff for the next agent
