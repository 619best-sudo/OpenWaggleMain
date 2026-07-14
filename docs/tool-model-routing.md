# Tool Model Routing And Pi Patch Notes

This document explains how OpenWaggle routes tool execution to different models, which Pi library patches make that possible, and why the final fix required patching the installed transport layer instead of only changing app code.

## Goal

Use different executor models for different tool categories while keeping the orchestrator on Turing Machine:

- Orchestrator model: `turing-machine/turing-machine`
- Default tool/script model: `poolside/laguna-xs-2.1`
- Read model: `bytedance-seed/seed-2.0-mini`
- Code editing model: `tencent/hy3`

The backend Turing Machine API already supports concrete model overrides. The important rule is:

- If OpenWaggle sends `model: 'turing-machine'`, backend falls back to the default OpenRouter model.
- If OpenWaggle sends a concrete model like `tencent/hy3`, backend forwards that exact model to OpenRouter.

## Current OpenWaggle Flow

### 1. Tool name -> executor model

OpenWaggle decides the tool execution model in:

- `src/main/adapters/pi/tool-model-route.ts`

Current routing:

- `read` -> `bytedance-seed/seed-2.0-mini`
- `edit`, `write`, `patch`, `multiedit` -> `tencent/hy3`
- everything else, including `bash` and script-like tools -> `poolside/laguna-xs-2.1`

### 2. Guarded tool requests surface the chosen model

OpenWaggle attaches the routed model during the Pi `beforeToolCall` permission/request flow in:

- `src/main/adapters/pi/tool-permission-request-extension.ts`

Important behavior:

- In `ask` mode, the synthesized tool request includes `request.model`.
- In `allow-all` mode, there is no permission modal, so OpenWaggle queues the tool model immediately with `registerApprovedToolExecutionModel(...)`.

### 3. Approved tool model is stored for the next real request

OpenWaggle stores the next tool execution model in:

- `src/main/adapters/pi/tool-execution-model-state.ts`

This file now does two things:

- keeps a short-lived in-process queue of approved tool models
- exposes a one-shot global consumer on `globalThis.__openwaggleConsumeToolExecutionModel`

That global exists specifically so the patched Pi transport can consume the next tool model at the final request boundary.

### 4. Turing Machine provider payload can still override model in app code

OpenWaggle also tries to override the provider payload in:

- `src/main/adapters/pi/turing-machine-tool-selection-extension.ts`

This remains useful, but it was not enough by itself for the live path that actually sent requests in practice.

## Why Library Patches Were Needed

The app-level routing was correct, but runtime debugging showed the final OpenRouter traffic still used Laguna for every tool call.

The root problem was that there are multiple handoff points:

1. Pi `beforeToolCall`
2. OpenWaggle permission/resume handling
3. Pi provider request preparation
4. actual HTTP transport that posts to Turing Machine backend
5. backend request body sent to OpenRouter

Changing only steps 1-3 was not sufficient. The final transport path could still send the active orchestrator/default model unless the concrete tool model was applied at the last mile.

## Patch Responsibilities

### `@mariozechner/pi-agent-core@0.70.2`

Tracked in:

- `patches/@mariozechner__pi-agent-core@0.70.2.patch`

Why it exists:

- Pi core originally did not support request-first tool handling in the way OpenWaggle needed.

What it adds:

- `beforeToolCall` can return a request envelope
- tool execution can be short-circuited into a synthesized tool result
- `request.model`, `request.permission`, and `request.metadata` are preserved in the synthesized result

Why this matters:

- it enables OpenWaggle to pause local execution and carry a host-selected model hint through the tool request flow

### `@mariozechner/pi-coding-agent@0.70.2`

Tracked in:

- `patches/@mariozechner__pi-coding-agent@0.70.2.patch`

Why it exists:

- the coding-agent package needed to expose the richer tool-call result shape from the patched core

What it adds:

- `ToolCallEventResult` now supports `request`, `content`, `details`, `isError`, and `terminate`
- agent-session plumbing preserves the hook result so OpenWaggle can consume the request-first tool flow

Why this matters:

- without this patch, OpenWaggle cannot reliably surface tool requests with model hints through the coding-agent layer

### `@mariozechner/pi-ai@0.70.2`

Tracked in:

- `patches/@mariozechner__pi-ai@0.70.2.patch`

Why it exists:

- this patch fixes the real last-mile problem
- runtime debugging showed that correct tool-model routing in OpenWaggle still did not guarantee that the final HTTP request to Turing Machine backend used the concrete tool model

What it adds:

- immediately before the `openai-completions` transport posts to the backend, it consumes `globalThis.__openwaggleConsumeToolExecutionModel()`
- if a queued concrete tool model exists, it replaces `params.model` for that request
- it also logs the final Pi-side request model during debugging

Why this matters:

- this is the final guardrail that makes the actual backend-bound request use `read`/`edit`/`bash` models instead of collapsing back to Laguna

## Backend Side

Backend lives outside this repo, but the important file is:

- `../backend/src/turing-machine/turing-machine.service.ts`

Behavior to remember:

- `resolveUpstreamModel()` only falls back to the default model when input model is the semantic alias `turing-machine`
- any concrete model is forwarded to OpenRouter unchanged

For debugging, backend now logs:

- incoming DTO model
- resolved upstream model
- final `requestBody.model`

That makes it possible to prove what was actually sent to OpenRouter, not just what OpenWaggle intended to send.

## Important Failure Mode

If a future regression shows "everything still uses Laguna", do not stop at the permission/request layer. Check all of these in order:

1. `tool-model-route.ts` chose the expected tool model
2. `tool-permission-request-extension.ts` attached or queued that model
3. `agent-handler.ts` preserved the model through permission resolution
4. `turing-machine-tool-selection-extension.ts` saw the correct Turing Machine payload
5. `@mariozechner/pi-ai` final transport applied the one-shot global override
6. backend `turing-machine.service.ts` received the concrete model and sent the same `requestBody.model` upstream

If step 5 is skipped or removed, the symptom can return even when the earlier logs look correct.

## Why The Global One-Shot Consumer Exists

The global consumer is intentionally narrow and one-shot:

- it only applies to the next backend-bound request
- it is TTL-based and consumes the value once
- it avoids changing the orchestrator model
- it gives the patched Pi transport a reliable bridge from OpenWaggle app state to the final request body

This is a pragmatic integration seam between OpenWaggle and patched Pi packages.

## Verification Checklist

When changing this area, verify all of the following:

1. Orchestrator remains `turing-machine/turing-machine`
2. `read` goes to `bytedance-seed/seed-2.0-mini`
3. code editing goes to `tencent/hy3`
4. `bash` or script-style execution goes to `poolside/laguna-xs-2.1`
5. backend `requestBody.model` matches the intended tool model
6. `package.json` still contains all three tracked patches under `patchedDependencies`

## Files To Read First Next Time

- `src/main/adapters/pi/tool-model-route.ts`
- `src/main/adapters/pi/tool-permission-request-extension.ts`
- `src/main/adapters/pi/tool-execution-model-state.ts`
- `src/main/ipc/agent-handler.ts`
- `src/main/adapters/pi/turing-machine-tool-selection-extension.ts`
- `patches/@mariozechner__pi-agent-core@0.70.2.patch`
- `patches/@mariozechner__pi-coding-agent@0.70.2.patch`
- `patches/@mariozechner__pi-ai@0.70.2.patch`
- `../backend/src/turing-machine/turing-machine.service.ts`
