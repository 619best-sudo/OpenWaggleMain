/**
 * Declarative tool → model routing registry.
 *
 * A route assigns a tool (or category of tools) to a specific execution model
 * and declares whether that model must *author the final tool arguments* before
 * the tool executes (`authorFinalArgs`).
 *
 * Routing semantics (see the runtime `beforeToolCall` handling in the patched
 * pi-agent-core `agent-loop.js`). A route can request either or both of two
 * routed-model phases around the orchestrator's tool call:
 *
 *  - `authorFinalArgs: true` — PRE-execution authoring. The orchestrator only
 *    proposes a tool *intent*; the routed model re-authors the final, executable
 *    arguments in a forced single-tool completion, and the tool executes with
 *    those arguments. This is the ownership model for mutation tools: the
 *    assigned model — not the orchestrator — authors the payload that gets
 *    applied.
 *  - `reasonOverResult: true` — POST-execution reasoning. The tool executes
 *    normally (deterministically / with the orchestrator's arguments); then the
 *    routed model reads and reasons over the tool result, and its analysis is
 *    appended to the result the orchestrator sees. This is the ownership model
 *    for reads: the orchestrator still executes the fs read, but a cheaper
 *    specialist model does the reading/reasoning.
 *
 * When both flags are `false` the tool executes with the orchestrator's own
 * arguments and result — the route only records the intended model. Flip either
 * flag to opt a route into a routed phase; no architectural change is required.
 *
 * To add a new per-tool / per-category rule, extend `resolveToolRoute` (ordered,
 * first match wins) or the category sets below. Everything downstream reads the
 * route through `resolveToolRoute`, so the registry is the single source of truth.
 */

const DEFAULT_TOOL_EXECUTION_MODEL = 'poolside/laguna-xs-2.1'
const READ_TOOL_EXECUTION_MODEL = 'bytedance-seed/seed-2.0-mini'
const CODE_EDITING_TOOL_EXECUTION_MODEL = 'tencent/hy3'

const READ_TOOL_NAMES = new Set(['read'])
const CODE_EDITING_TOOL_NAMES = new Set(['edit', 'write', 'patch', 'multiedit'])

export interface ToolExecutionRoute {
  /** The model responsible for this tool. */
  readonly model: string
  /**
   * When `true`, the routed model authors the final tool arguments before the
   * tool executes (see module docs). When `false`, the orchestrator's arguments
   * are used as-is.
   */
  readonly authorFinalArgs: boolean
  /**
   * When `true`, the routed model reasons over the tool result after execution
   * and its analysis is appended to the result (see module docs). When `false`,
   * the tool result is returned unchanged.
   */
  readonly reasonOverResult: boolean
  /** Stable identifier for the matched route (useful for logging/tests). */
  readonly id: 'read' | 'editing' | 'default'
}

export function normalizeToolName(toolName: string) {
  return toolName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

export function isReadTool(toolName: string) {
  return READ_TOOL_NAMES.has(normalizeToolName(toolName))
}

export function isCodeEditingTool(toolName: string) {
  const normalized = normalizeToolName(toolName)
  if (CODE_EDITING_TOOL_NAMES.has(normalized)) {
    return true
  }

  return normalized.includes('edit') || normalized.includes('write') || normalized.includes('patch')
}

/**
 * Resolve the full routing decision for a tool. First match wins.
 *
 * - Read tools: the orchestrator executes the read; seed reasons over the result
 *   (`reasonOverResult`). No argument re-authoring (the path is trivial).
 * - Mutation tools: the routed model authors the final arguments
 *   (`authorFinalArgs`) — correctness-critical, the routed model owns the payload.
 * - Everything else: a model assignment with no routed phase. Flip a flag to opt
 *   a route into a routed phase.
 */
export function resolveToolRoute(toolName: string): ToolExecutionRoute {
  if (isReadTool(toolName)) {
    return {
      id: 'read',
      model: READ_TOOL_EXECUTION_MODEL,
      authorFinalArgs: false,
      reasonOverResult: true,
    }
  }

  if (isCodeEditingTool(toolName)) {
    return {
      id: 'editing',
      model: CODE_EDITING_TOOL_EXECUTION_MODEL,
      authorFinalArgs: true,
      reasonOverResult: false,
    }
  }

  return {
    id: 'default',
    model: DEFAULT_TOOL_EXECUTION_MODEL,
    authorFinalArgs: false,
    reasonOverResult: false,
  }
}

/** Back-compat helper: the model assigned to a tool, ignoring authoring policy. */
export function resolveToolExecutionModel(toolName: string) {
  return resolveToolRoute(toolName).model
}

/**
 * Argument keys the runtime uses to detect the earliest safe cut point when a
 * routed-author tool is streaming: once a `target` key (the destination) is
 * present and a `payload` key (the heavy content) has begun, the orchestrator
 * stream can be interrupted and the routed model asked to author the payload.
 */
const EARLY_AUTHOR_TARGET_KEYS = ['path', 'filePath', 'file_path'] as const
const EARLY_AUTHOR_PAYLOAD_KEYS = [
  'content',
  'edits',
  'patch',
  'newText',
  'new_string',
  'oldText',
  'old_string',
] as const

export interface EarlyToolAuthoringPlan {
  readonly targetKeys: readonly string[]
  readonly payloadKeys: readonly string[]
}

/**
 * The early-catch plan for a tool, or null when it should not be caught early.
 * Only tools whose route authors the final arguments are eligible — those are the
 * tools where the orchestrator's payload would be discarded anyway.
 */
export function resolveEarlyToolAuthoringPlan(toolName: string): EarlyToolAuthoringPlan | null {
  if (!resolveToolRoute(toolName).authorFinalArgs) {
    return null
  }
  return {
    targetKeys: [...EARLY_AUTHOR_TARGET_KEYS],
    payloadKeys: [...EARLY_AUTHOR_PAYLOAD_KEYS],
  }
}

export const TOOL_EXECUTION_MODEL_ROUTES = {
  default: DEFAULT_TOOL_EXECUTION_MODEL,
  read: READ_TOOL_EXECUTION_MODEL,
  editing: CODE_EDITING_TOOL_EXECUTION_MODEL,
} as const
