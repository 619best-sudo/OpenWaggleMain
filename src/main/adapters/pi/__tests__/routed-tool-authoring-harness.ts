/**
 * Shared harness for the routed tool-authoring integration tests.
 *
 * `@mariozechner/pi-agent-core` is a transitive dependency (the app only depends
 * on `@mariozechner/pi-coding-agent`), so `loadRunAgentLoop` resolves the exact
 * patched copy the app runs against by anchoring resolution at the coding-agent
 * package.
 */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

export type JsonRecord = Record<string, unknown>

export type RunAgentLoop = (
  prompts: unknown,
  context: unknown,
  config: unknown,
  emit: (event: unknown) => Promise<void> | void,
  signal: unknown,
  streamFn: unknown,
) => Promise<unknown>

export async function loadRunAgentLoop(): Promise<RunAgentLoop> {
  // pi-coding-agent only defines the ESM `import` condition, so use ESM
  // resolution to locate it, then CJS-resolve its pi-agent-core dependency
  // (which has a plain `main`).
  const codingAgentUrl = import.meta.resolve('@mariozechner/pi-coding-agent')
  const agentCorePath = createRequire(codingAgentUrl).resolve('@mariozechner/pi-agent-core')
  const mod = await import(pathToFileURL(agentCorePath).href)
  return mod.runAgentLoop
}

export function baseConfig(beforeToolCall: () => Promise<unknown>) {
  return {
    model: {
      id: 'orchestrator',
      api: 'openai-completions',
      provider: 'turing-machine',
      baseUrl: 'http://127.0.0.1:3001/turing-machine',
    },
    convertToLlm: (messages: unknown) => messages,
    beforeToolCall,
  }
}

export function userPrompt() {
  return [{ role: 'user', content: [{ type: 'text', text: 'Edit the file.' }] }]
}

export function assistantToolCallMessage(name: string, args: JsonRecord) {
  return {
    role: 'assistant',
    content: [{ type: 'toolCall', id: 'tc1', name, arguments: args }],
    stopReason: 'toolUse',
    api: 'openai-completions',
    provider: 'turing-machine',
    model: 'orchestrator',
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
    timestamp: 1,
  }
}

export function assistantTextMessage(text: string) {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    stopReason: 'stop',
    api: 'openai-completions',
    provider: 'turing-machine',
    model: 'seed',
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
    timestamp: 3,
  }
}

export function createReadTool(recorder: JsonRecord[], fileContent: string) {
  return {
    name: 'read',
    label: 'read',
    description: 'Read a file from disk.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
      additionalProperties: false,
    },
    execute: async (_id: string, args: JsonRecord) => {
      recorder.push(args)
      return { content: [{ type: 'text', text: fileContent }], details: {} }
    },
  }
}

export function assistantStopMessage() {
  return {
    role: 'assistant',
    content: [{ type: 'text', text: 'done' }],
    stopReason: 'stop',
    api: 'openai-completions',
    provider: 'turing-machine',
    model: 'orchestrator',
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
    timestamp: 2,
  }
}

export function editToolCallMessage(args: JsonRecord) {
  return assistantToolCallMessage('edit', args)
}

/**
 * Build a fake `streamFn` for edit-tool routing: the forced routed-authoring
 * completion returns `routed` args; the first orchestrator turn returns
 * `orchestrator` args; subsequent turns stop.
 */
export function editFakeResponse(input: { routed: JsonRecord; orchestrator: JsonRecord }) {
  let orchestratorTurns = 0
  return (_model: { id: string }, _context: unknown, options?: { toolChoice?: unknown }) => {
    if (options?.toolChoice) {
      return fakeResponse(editToolCallMessage(input.routed))
    }
    orchestratorTurns += 1
    if (orchestratorTurns === 1) {
      return fakeResponse(editToolCallMessage(input.orchestrator))
    }
    return fakeResponse(assistantStopMessage())
  }
}

export function fakeResponse(finalMessage: unknown) {
  return {
    [Symbol.asyncIterator]() {
      let emitted = false
      return {
        next: async () => {
          if (emitted) {
            return { done: true, value: undefined }
          }
          emitted = true
          return { done: false, value: { type: 'done' } }
        },
      }
    },
    result: async () => finalMessage,
  }
}

export function createWriteTool(recorder: JsonRecord[]) {
  return {
    name: 'write',
    label: 'write',
    description: 'Write a file to disk.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
    execute: async (_id: string, args: JsonRecord) => {
      recorder.push(args)
      return { content: [{ type: 'text', text: 'written' }], details: {} }
    },
  }
}

// Mirrors the real `edit` tool's contract: a strict schema plus a
// `prepareArguments` hook that parses `edits` when a model sends it as a JSON
// string. Used to prove routed authoring normalizes loosely-shaped output.
export function createEditLikeTool(recorder: JsonRecord[]) {
  return {
    name: 'edit',
    label: 'edit',
    description: 'Edit a file via exact text replacement.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              oldText: { type: 'string' },
              newText: { type: 'string' },
            },
            required: ['oldText', 'newText'],
            additionalProperties: false,
          },
        },
      },
      required: ['path', 'edits'],
      additionalProperties: false,
    },
    prepareArguments: (input: JsonRecord) => {
      const args = { ...input }
      if (typeof args.edits === 'string') {
        try {
          const parsed = JSON.parse(args.edits)
          if (Array.isArray(parsed)) {
            args.edits = parsed
          }
        } catch {
          // leave as-is; validation will surface the problem
        }
      }
      return args
    },
    execute: async (_id: string, args: JsonRecord) => {
      recorder.push(args)
      return { content: [{ type: 'text', text: 'edited' }], details: {} }
    },
  }
}
