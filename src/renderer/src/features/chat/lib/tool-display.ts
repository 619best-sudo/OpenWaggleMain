import { match, P } from '@diegogbrisa/ts-match'
import { toolCallTitle } from 'turing-harness/tool-titles'
import type { JsonObject } from '@shared/types/json'

type PiNativeToolName = 'read' | 'write' | 'edit' | 'bash' | 'grep' | 'find' | 'ls'

interface ToolDisplayEntry {
  readonly primaryArg: string
  readonly verbs: {
    readonly running: string
    readonly completed: string
  }
}

/**
 * Display metadata for Pi-native tools that OpenWaggle renders as UI.
 * Runtime tool availability still comes from Pi, not from this map.
 */
const PI_TOOL_DISPLAY: Record<PiNativeToolName, ToolDisplayEntry> = {
  read: {
    primaryArg: 'path',
    verbs: { running: 'Reading', completed: 'Read' },
  },
  write: {
    primaryArg: 'path',
    verbs: { running: 'Writing', completed: 'Wrote' },
  },
  edit: {
    primaryArg: 'path',
    verbs: { running: 'Editing', completed: 'Edited' },
  },
  bash: {
    primaryArg: 'command',
    verbs: { running: 'Running', completed: 'Ran' },
  },
  grep: {
    primaryArg: 'pattern',
    verbs: { running: 'Searching', completed: 'Searched' },
  },
  find: {
    primaryArg: 'pattern',
    verbs: { running: 'Finding', completed: 'Found' },
  },
  ls: {
    primaryArg: 'path',
    verbs: { running: 'Listing', completed: 'Listed' },
  },
}

function getDefaultEntry(name: string) {
  return {
    primaryArg: '',
    verbs: { running: name, completed: name },
  }
}

function isPiNativeToolName(name: string): name is PiNativeToolName {
  return name in PI_TOOL_DISPLAY
}

function getToolEntry(name: string) {
  if (isPiNativeToolName(name)) {
    return PI_TOOL_DISPLAY[name]
  }
  return getDefaultEntry(name)
}

function getToolActionText(name: string, args: JsonObject, isRunning: boolean) {
  const entry = getToolEntry(name)
  const verb = isRunning ? entry.verbs.running : entry.verbs.completed
  const label = formatToolTarget(name, args, entry.primaryArg)

  if (!label) return isRunning ? `${verb}...` : verb
  if (isRunning && name === 'bash') return `${verb} ${label}`
  return isRunning ? `${verb} ${label}...` : `${verb} ${label}`
}

function formatToolTarget(name: string, args: JsonObject, primaryArg: string) {
  // Structured tools with their own summary formatting — handled before the
  // generic match so they don't have to fit the { name, args: {...} } shape.
  if (name === 'project_memory') return formatProjectMemoryTarget(args)
  if (name === 'ask_user_question') return formatAskUserQuestionTarget(args)

  return match({ name, args })
    .with(
      { name: 'bash', args: { command: P.select('command', P.string) } },
      ({ command }) => `\`${command}\``,
    )
    .with(
      { name: 'read', args: { path: P.select('path', P.string) } },
      ({ path }) => `${path}${formatReadLineSuffix(args)}`,
    )
    .with({ name: 'grep', args: { pattern: P.select('pattern', P.string) } }, ({ pattern }) => {
      const path = typeof args.path === 'string' && args.path ? args.path : '.'
      const glob = typeof args.glob === 'string' && args.glob ? ` (${args.glob})` : ''
      return `/${pattern}/ in ${path}${glob}`
    })
    .with({ name: 'find', args: { pattern: P.select('pattern', P.string) } }, ({ pattern }) => {
      const path = typeof args.path === 'string' && args.path ? args.path : '.'
      return `${pattern} in ${path}`
    })
    .with({ name: 'ls' }, () => {
      const path = typeof args.path === 'string' && args.path ? args.path : '.'
      return path
    })
    .otherwise(() => {
      // Prefer the tool's declared primary arg when available.
      const value = primaryArg ? args[primaryArg] : undefined
      if (typeof value === 'string' && value.trim()) return value
      // Action-dispatch tools (one tool, many verbs) used to fall through to the
      // `action` scan below and print the raw enum token — "Graph Memory /
      // stats", "File Memory / search". The harness ships a label per verb;
      // that is what the user should read. It also covers the very common call
      // that OMITS `action` and lets the tool infer it.
      // Not for the Pi-native tools: those declare a primary arg, and a bare
      // `read` with no path must stay verb-only ("Reading…") rather than gain a
      // second label.
      if (!primaryArg) {
        const harnessTitle = toolCallTitle(name, args)
        if (harnessTitle) return harnessTitle
      }
      // Unknown / MCP / structured tools: surface the most informative scalar
      // field so the title carries useful detail instead of repeating the tool
      // name. Scanned in priority order.
      const informativeKeys = [
        'action',
        'key',
        'query',
        'pattern',
        'command',
        'url',
        'name',
        'path',
        'filePath',
      ]
      for (const key of informativeKeys) {
        const candidate = args[key]
        if (typeof candidate === 'string' && candidate.trim()) {
          return key === 'action' ? candidate : candidate.trim()
        }
      }
      return ''
    })
}

/**
 * One-line target summary for a tool call — the useful detail shown next to the
 * tool's action chip (e.g. `` `git status` ``, `/TODO/ in src (*.ts)`,
 * `src/app.ts:10-50`). Reused by the inline tool block and the phase card so
 * both show the same per-tool detail. Returns '' when nothing meaningful can be
 * derived from the args (caller then falls back to the tool name).
 */
export function summarizeToolTarget(name: string, args: JsonObject): string {
  const entry = getToolEntry(name)
  return formatToolTarget(name, args, entry.primaryArg)
}

function formatReadLineSuffix(args: JsonObject) {
  const offset = typeof args.offset === 'number' ? args.offset : undefined
  const limit = typeof args.limit === 'number' ? args.limit : undefined
  if (offset === undefined && limit === undefined) {
    return ''
  }

  const startLine = offset ?? 1
  if (limit === undefined) {
    return `:${String(startLine)}`
  }

  return `:${String(startLine)}-${String(startLine + limit - 1)}`
}

/**
 * Short verbs used only when the call has an OPERAND to append ("Remember: use
 * Tailwind"). A bare call falls back to the harness's own label for the action
 * instead — "Get memory" said no more than the tool name beside it did.
 */
const PROJECT_MEMORY_ACTION_LABEL: Record<string, string> = {
  get: 'Get memory',
  remember: 'Remember',
  recall: 'Recall',
  set_category: 'Set category',
}

function truncate(value: string, max: number) {
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed.length > max ? `${trimmed.slice(0, Math.max(0, max - 1)).trim()}…` : trimmed
}

/**
 * Title for a `project_memory` call. Combines the action verb with its operand
 * (the remembered text, the recall query, or the category) so the chip reads
 * like "Recall \"html\"" or "Remember: use Tailwind" instead of a bare action.
 */
function formatProjectMemoryTarget(args: JsonObject): string {
  const rawAction = typeof args.action === 'string' ? args.action : ''
  const action = rawAction in PROJECT_MEMORY_ACTION_LABEL ? rawAction : ''
  const verb = action ? PROJECT_MEMORY_ACTION_LABEL[action] : 'Memory'
  // What to show when there is no operand to append: what the call DOES, from
  // the harness (it infers the action the same way the tool does).
  const bare = toolCallTitle('project_memory', args) ?? verb

  const text = typeof args.text === 'string' ? args.text.trim() : ''
  const category = typeof args.category === 'string' ? args.category.trim() : ''
  const tags = Array.isArray(args.tags)
    ? args.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    : []

  if (action === 'remember' && text) return `${verb}: ${truncate(text, 60)}`
  if (action === 'recall') {
    if (text) return `${verb} "${truncate(text, 40)}"`
    if (tags.length) return `${verb} #${tags[0]}`
    return bare
  }
  if (action === 'set_category' && category) return `${verb}: ${category}`
  // No/unknown action: infer from the operand (mirrors the tool's own inference).
  if (category) return `Set category: ${category}`
  if (text) return `Recall "${truncate(text, 40)}"`
  if (tags.length) return `Recall #${tags[0]}`
  return bare
}

/**
 * How much of the question fits in the collapsed tool chip. Exported because the
 * expanded card uses it to decide whether the question still needs restating:
 * if the header already shows it in full, repeating it below is just noise.
 */
export const ASK_USER_QUESTION_TITLE_MAX = 70

/**
 * Title for an `ask_user_question` call: a short version of the question.
 */
function formatAskUserQuestionTarget(args: JsonObject): string {
  const question = typeof args.question === 'string' ? args.question.trim() : ''
  if (!question) return ''
  return truncate(question, ASK_USER_QUESTION_TITLE_MAX)
}

interface ActionTextParams {
  readonly name: string
  readonly args: JsonObject
  readonly awaitingResult: boolean
  readonly isError: boolean
  readonly isRunning: boolean
}

export function resolveActionText(params: ActionTextParams): string {
  if (params.awaitingResult) {
    return formatStatusActionText('Requested', params.name, params.args)
  }
  if (params.isError) {
    return formatStatusActionText('Failed', params.name, params.args)
  }
  return getToolActionText(params.name, params.args, params.isRunning)
}

function formatStatusActionText(prefix: string, name: string, args: JsonObject) {
  if (typeof args.path === 'string') {
    return `${prefix} ${name} ${args.path}`
  }
  if (name === 'bash' && typeof args.command === 'string') {
    return `${prefix} ${name} \`${args.command}\``
  }
  return `${prefix} ${name}`
}
