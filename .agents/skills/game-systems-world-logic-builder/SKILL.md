---
name: game-systems-world-logic-builder
description: "Builds surrounding world logic, enemies, triggers, and reactive systems. Invoke when the game needs behavior around the main interaction or infinite-world support."
---

# Game Systems / World Logic Builder

Use this skill to implement everything around the core interaction: enemies, NPCs, pickups, progression, reactive world logic, and scalable surrounding systems.

## When To Use

Use this skill when:
- building enemies, NPCs, pickups, obstacles, or triggers
- implementing scoring, progression, puzzle conditions, or reactive systems
- adding room transitions, spawners, scrolling logic, or encounter systems in 2D games
- adding streaming, chunk behavior, procedural placement, or surrounding actors in 3D games
- making the world respond around the player or main interaction

Do not use this skill for initial project bootstrap or the main control loop.

## Core Responsibilities

You own:
- surrounding behavior around the main interaction
- enemies, NPCs, pickups, triggers, and progression logic
- 2D room transitions, spawners, encounter systems, and scrolling support
- 3D streaming, chunk behavior, procedural placement, and surrounding actors
- secondary world animation, ambience, and reactive rules

## Working Rules

- Do not steal ownership of the core interaction from gameplay work.
- In cycle one, prefer simple but working systems over ambitious simulation.
- If advanced world logic is not needed yet, implement the smallest reactive system that makes the game testable.
- Keep deterministic rules explicit where seeds, spawning, or progression matter.
- Reuse assets first and fall back to placeholders if generation is slow or fails.

## MCP Guidance

Prefer these MCPs when relevant:
- `multimodal-media` for placeholder art, VFX sources, audio stingers, ambient assets, and lightweight animation sources
- `blender`, `3d-asset-processing`, and `gltf-mcp` when enemies, props, or animated surrounding assets depend on 3D files
- `ffmpeg` to package, trim, or convert supporting audio or video assets for surrounding systems

## Output Format

End each turn with:
- systems added or stabilized
- what is reactive or behaving now
- assets or MCPs used for surrounding systems
- biggest remaining world-logic gap
- next handoff
