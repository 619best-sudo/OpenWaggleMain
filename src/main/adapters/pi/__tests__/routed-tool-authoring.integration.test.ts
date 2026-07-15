/**
 * Integration test for the patched pi-agent-core routed-authoring path.
 *
 * Drives the real `runAgentLoop` with a fake `streamFn` and asserts that when
 * `beforeToolCall` returns a routing directive with `authorFinalArgs: true`, the
 * tool executes with arguments authored by the ROUTED model — not the
 * orchestrator's proposed arguments — and that the routed output is normalized
 * exactly like a first-class tool call.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import {
  assistantStopMessage,
  assistantTextMessage,
  assistantToolCallMessage,
  baseConfig,
  createEditLikeTool,
  createReadTool,
  createWriteTool,
  editFakeResponse,
  fakeResponse,
  type JsonRecord,
  loadRunAgentLoop,
  type RunAgentLoop,
  userPrompt,
} from './routed-tool-authoring-harness'

const routeReauthor = async () => ({ route: { model: 'tencent/hy3', authorFinalArgs: true } })

let runAgentLoop: RunAgentLoop

beforeAll(async () => {
  runAgentLoop = await loadRunAgentLoop()
})

describe('routed tool authoring (patched pi-agent-core loop)', () => {
  it('executes a routed mutation with arguments authored by the routed model', async () => {
    const executedArgs: JsonRecord[] = []
    const modelsSeen: string[] = []
    let orchestratorTurns = 0

    const streamFn = (
      model: { id: string },
      _context: unknown,
      options?: { toolChoice?: unknown },
    ) => {
      modelsSeen.push(model.id)
      if (options?.toolChoice) {
        return fakeResponse(
          assistantToolCallMessage('write', { path: '/file.ts', content: 'ROUTED' }),
        )
      }
      orchestratorTurns += 1
      if (orchestratorTurns === 1) {
        // Orchestrator only proposes an intent (deliberately different content).
        return fakeResponse(
          assistantToolCallMessage('write', { path: '/file.ts', content: 'ORCHESTRATOR' }),
        )
      }
      return fakeResponse(assistantStopMessage())
    }

    const executedArgsTool = createWriteTool(executedArgs)
    await runAgentLoop(
      userPrompt(),
      { systemPrompt: 'You are a coding agent.', messages: [], tools: [executedArgsTool] },
      baseConfig(routeReauthor),
      async () => {},
      undefined,
      streamFn,
    )

    // The applied payload came from the routed model, not the orchestrator.
    expect(executedArgs).toEqual([{ path: '/file.ts', content: 'ROUTED' }])
    // The routed-authoring completion ran on the routed model id.
    expect(modelsSeen).toContain('tencent/hy3')
  })

  it('executes with orchestrator arguments when the route does not re-author', async () => {
    const executedArgs: JsonRecord[] = []
    let orchestratorTurns = 0

    const streamFn = (
      _model: { id: string },
      _context: unknown,
      options?: { toolChoice?: unknown },
    ) => {
      if (options?.toolChoice) {
        throw new Error('routed authoring should not run when authorFinalArgs is false')
      }
      orchestratorTurns += 1
      if (orchestratorTurns === 1) {
        return fakeResponse(
          assistantToolCallMessage('write', { path: '/file.ts', content: 'ORCHESTRATOR' }),
        )
      }
      return fakeResponse(assistantStopMessage())
    }

    const noReauthor = async () => ({
      route: { model: 'bytedance-seed/seed-2.0-mini', authorFinalArgs: false },
    })
    await runAgentLoop(
      userPrompt(),
      {
        systemPrompt: 'You are a coding agent.',
        messages: [],
        tools: [createWriteTool(executedArgs)],
      },
      baseConfig(noReauthor),
      async () => {},
      undefined,
      streamFn,
    )

    expect(executedArgs).toEqual([{ path: '/file.ts', content: 'ORCHESTRATOR' }])
  })

  it('normalizes routed edit output sent as stringified JSON via prepareArguments', async () => {
    const executedArgs: JsonRecord[] = []

    // Routed model emits `edits` as a JSON string (the Opus/GLM quirk the real
    // edit tool documents). Without prepareArguments this fails validation.
    const streamFn = editFakeResponse({
      routed: { path: '/index.html', edits: JSON.stringify([{ oldText: 'old', newText: 'new' }]) },
      orchestrator: { path: '/index.html', edits: [{ oldText: 'a', newText: 'b' }] },
    })

    await runAgentLoop(
      userPrompt(),
      {
        systemPrompt: 'You are a coding agent.',
        messages: [],
        tools: [createEditLikeTool(executedArgs)],
      },
      baseConfig(routeReauthor),
      async () => {},
      undefined,
      streamFn,
    )

    // The stringified edits were parsed into a real array and executed.
    expect(executedArgs).toEqual([
      { path: '/index.html', edits: [{ oldText: 'old', newText: 'new' }] },
    ])
  })

  it('strips schema-unknown keys (e.g. description) from routed edit output', async () => {
    const executedArgs: JsonRecord[] = []

    // Routed model adds a stray `description` field the strict schema forbids.
    const streamFn = editFakeResponse({
      routed: {
        path: '/index.html',
        edits: [{ oldText: 'old', newText: 'new' }],
        description: 'update the heading',
      },
      orchestrator: { path: '/index.html', edits: [{ oldText: 'a', newText: 'b' }] },
    })

    await runAgentLoop(
      userPrompt(),
      {
        systemPrompt: 'You are a coding agent.',
        messages: [],
        tools: [createEditLikeTool(executedArgs)],
      },
      baseConfig(routeReauthor),
      async () => {},
      undefined,
      streamFn,
    )

    // The stray `description` was dropped; the edit executed with valid args.
    expect(executedArgs).toEqual([
      { path: '/index.html', edits: [{ oldText: 'old', newText: 'new' }] },
    ])
  })

  it('runs seed reasoning over the read result and augments it, orchestrator still executes the read', async () => {
    const executedArgs: JsonRecord[] = []
    const modelsSeen: string[] = []
    let orchestratorTurns = 0

    const streamFn = (
      model: { id: string },
      _context: unknown,
      _options?: { toolChoice?: unknown },
    ) => {
      modelsSeen.push(model.id)
      // Post-execution reasoning runs on the routed (seed) model — a plain text
      // completion, distinguishable from the orchestrator by model id.
      if (model.id === 'bytedance-seed/seed-2.0-mini') {
        return fakeResponse(assistantTextMessage('SEED ANALYSIS of the file'))
      }
      orchestratorTurns += 1
      if (orchestratorTurns === 1) {
        return fakeResponse(assistantToolCallMessage('read', { path: '/index.html' }))
      }
      return fakeResponse(assistantStopMessage())
    }

    const routeRead = async () => ({
      route: {
        id: 'read',
        model: 'bytedance-seed/seed-2.0-mini',
        authorFinalArgs: false,
        reasonOverResult: true,
      },
    })

    // Capture the finalized (augmented) read result off the event stream.
    let readResultJson = ''
    const emit = async (event: unknown) => {
      if (
        event &&
        typeof event === 'object' &&
        'type' in event &&
        event.type === 'tool_execution_end'
      ) {
        readResultJson = JSON.stringify(event)
      }
    }

    await runAgentLoop(
      userPrompt(),
      {
        systemPrompt: 'You are a coding agent.',
        messages: [],
        tools: [createReadTool(executedArgs, 'FILE CONTENT LINE')],
      },
      baseConfig(routeRead),
      emit,
      undefined,
      streamFn,
    )

    // The orchestrator executed the read with its own arguments (deterministic fs read).
    expect(executedArgs).toEqual([{ path: '/index.html' }])
    // Seed was hit for the reasoning phase.
    expect(modelsSeen).toContain('bytedance-seed/seed-2.0-mini')
    // The result the orchestrator sees keeps the file content AND seed's analysis.
    expect(readResultJson).toContain('FILE CONTENT LINE')
    expect(readResultJson).toContain('SEED ANALYSIS of the file')
  })
})
