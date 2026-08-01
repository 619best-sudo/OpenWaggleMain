import { resolve, isAbsolute } from 'node:path'
import type { AgentToolResult, ExtensionContext, ToolDefinition } from '@mariozechner/pi-coding-agent'

/**
 * mark_concern_lines — a custom agent tool that lets the model flag the specific
 * lines of a file it just read that matter for the task. The renderer folds each
 * result onto the matching read's file view as line highlights (see
 * AssistantMessageBubble's concernsByPath). It is read-only, never mutates
 * state, and returns only a short confirmation string + structured details.
 *
 * Mirrors the shape of the turing-harness `mark_concern_lines` tool so the same
 * renderer correlation (`details.path` / `details.lines` / `details.why`) works.
 */

export interface MarkConcernLinesDetails {
  readonly path: string
  readonly lines: readonly number[]
  readonly why?: string
}

// `ToolDefinition`'s `parameters` is typed as a TypeBox `TSchema`, but at
// runtime pi only reads it as a plain JSON-schema object (additionalProperties
// / properties) and forwards it to the provider verbatim — it does not use
// TypeBox symbols. To avoid adding a direct `typebox` dependency to the app,
// model the schema as a plain object and cast it to the expected field type.
type ToolParameters = ToolDefinition extends { parameters: infer P } ? P : never

const markConcernLinesParameters = {
  type: 'object',
  additionalProperties: false,
  properties: {
    path: { type: 'string', description: 'File path (absolute, or relative to cwd). Must match a file you just read.' },
    lines: {
      type: 'array',
      description: '1-based line numbers that matter for the task.',
      items: { type: 'number', minimum: 1 },
      minItems: 1,
    },
    why: { type: 'string', description: 'Optional one-line reason: why these lines matter.' },
  },
  required: ['path', 'lines'],
} as unknown as ToolParameters

function resolvePath(cwd: string, rawPath: string): string {
  const trimmed = rawPath.trim()
  return isAbsolute(trimmed) ? trimmed : resolve(cwd, trimmed)
}

function normalizeLines(raw: readonly unknown[]): number[] {
  const seen = new Set<number>()
  const out: number[] = []
  for (const value of raw) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) continue
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out.sort((a, b) => a - b)
}

export const markConcernLinesToolDefinition: ToolDefinition = {
  name: 'mark_concern_lines',
  label: 'Mark Concern Lines',
  description:
    'Flag the specific lines of a file you just read that matter for the task (the lines a change targets, or the evidence behind a finding). Call it right after `read` when specific lines stand out; skip it when the whole file is relevant or nothing does.',
  promptSnippet: 'mark_concern_lines(path, lines, why?) — flag the specific lines of a file you just read that matter for the task (highlighted in the UI). Skip when nothing stands out.',
  promptGuidelines: [
    'After `read`, if SPECIFIC lines of that file matter for the task, call `mark_concern_lines` with those lines so they surface as highlights. Pass an optional `why`. Skip it when the whole file is relevant or nothing stands out — do not call it for every read.',
  ],
  parameters: markConcernLinesParameters,
  async execute(
    _toolCallId: string,
    params: { path?: string; lines?: readonly number[]; why?: string },
    _signal: AbortSignal | undefined,
    _onUpdate: ((partialResult: AgentToolResult<unknown>) => void) | undefined,
    ctx: ExtensionContext,
  ): Promise<AgentToolResult<MarkConcernLinesDetails>> {
    const cwd = ctx?.cwd ?? process.cwd()
    const path = resolvePath(cwd, params?.path ?? '')
    const lines = normalizeLines(Array.isArray(params?.lines) ? params.lines : [])
    if (!path || path === resolve(cwd)) {
      return {
        content: [{ type: 'text', text: 'mark_concern_lines: missing required argument "path".' }],
        details: { path, lines: [] },
      }
    }
    if (lines.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'mark_concern_lines: no valid line numbers provided. Pass a non-empty "lines" array of positive integers.',
          },
        ],
        details: { path, lines: [] },
      }
    }
    const why = typeof params?.why === 'string' && params.why.trim() ? params.why.trim() : undefined
    const details: MarkConcernLinesDetails = why ? { path, lines, why } : { path, lines }
    return {
      content: [
        { type: 'text', text: `Marked ${String(lines.length)} concern line(s) in ${path}: ${lines.join(',')}.` },
      ],
      details,
    }
  },
}
