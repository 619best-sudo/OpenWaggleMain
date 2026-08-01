import type { PendingToolPermissionRequest } from '@/features/chat/lib/tool-permission-request'
import { Button } from '@/shared/ui/Button'

interface ToolPermissionInlineCardProps {
  readonly request: PendingToolPermissionRequest
  readonly busy: boolean
  readonly error: string | null
  readonly onApprove: () => Promise<void>
  readonly onDeny: () => Promise<void>
}

const COMPLEXITY_CHIP_CLASS: Record<'low' | 'medium' | 'high', string> = {
  low: 'bg-bg-secondary/60 text-text-tertiary',
  medium: 'bg-warning/15 text-warning',
  high: 'bg-error/15 text-error',
}

const COMPLEXITY_SOURCE_LABEL: Record<string, string> = {
  'prepare-file': 'from Prepare',
  'plan-task': 'from Plan',
  // Measured by a tool that actually read the file this run (the staged `read`),
  // rather than inherited from a plan or guessed pre-flight.
  'tool-measured': 'measured from file',
  estimated: 'estimated',
}

/** A small pill showing the call's complexity rating and where it came from
 *  (inherited from Prepare's per-file rating / Plan's per-task rating, or freshly
 *  estimated). Renders nothing when the harness didn't attach a rating. */
function ComplexityChip({ request }: { request: PendingToolPermissionRequest }) {
  const rating = request.complexityRating
  if (rating !== 'low' && rating !== 'medium' && rating !== 'high') return null
  const source = request.complexitySource
    ? COMPLEXITY_SOURCE_LABEL[request.complexitySource]
    : undefined
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium leading-[1.4] ${COMPLEXITY_CHIP_CLASS[rating]}`}
      title={
        source ? `Estimated complexity: ${rating} (${source})` : `Estimated complexity: ${rating}`
      }
    >
      {rating}
      {source ? <span className="font-normal opacity-70">· {source}</span> : null}
    </span>
  )
}

// Verb chosen from the tool's input shape so the prompt reads naturally:
// "run" for shell commands, "access" for file paths, and a per-action verb
// ("read" / "update" / "delete") for structured tools like project_memory.
const ACTION_VERB: Record<string, string> = {
  get: 'read',
  read: 'read',
  list: 'read',
  search: 'read',
  query: 'read',
  fetch: 'read',
  set: 'update',
  put: 'update',
  update: 'update',
  write: 'update',
  create: 'update',
  add: 'update',
  patch: 'update',
  delete: 'delete',
  remove: 'delete',
  clear: 'delete',
  reset: 'delete',
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Hard cap on the summarized target.
 *
 * The card is one line of a question, not a data view. Some tools take genuinely
 * large arguments — `create_plan` gets a `context` holding every relevant file and
 * prior finding — and without a cap that argument renders as a wall of text where
 * the question should be.
 */
const MAX_TARGET_CHARS = 160
/** Cap per field in the key/value fallback, so one long field can't crowd out the rest. */
const MAX_VALUE_CHARS = 60
/** How many fields the key/value fallback lists. */
const MAX_FALLBACK_FIELDS = 3

/** Collapse whitespace and cut to `max`, marking the cut with an ellipsis. */
function truncate(value: string, max: number) {
  const collapsed = value.replace(/\s+/g, ' ').trim()
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed
}

/**
 * Argument names whose value is the meaningful subject of the call, best first.
 *
 * Identifier-ish keys come before prose keys: a tool carrying both a `path` and a
 * `description` is better summarized by the path. Prose keys are here so a tool
 * whose only real argument is a sentence (`create_plan`'s `task`) still gets a
 * readable summary instead of falling through to the key/value dump.
 */
const SUBJECT_KEYS = [
  'query',
  'pattern',
  'name',
  'key',
  'url',
  'file',
  'filePath',
  'path',
  'task',
  'prompt',
  'question',
  'instruction',
]

// Human-readable summary of a structured tool input, falling back to key/value
// pairs instead of raw JSON. Returns null when nothing useful can be shown.
function describeStructuredInput(input: PendingToolPermissionRequest['input']): string | null {
  const action = isString(input.action) ? input.action.toLowerCase() : null

  // project_memory / memory / knowledge tools: describe the memory operation.
  if (action) {
    const verb = ACTION_VERB[action] ?? 'use'
    const target = isString(input.key)
      ? ` "${input.key.trim()}"`
      : isString(input.name)
        ? ` "${input.name.trim()}"`
        : ''
    return `${verb}${target ? ` ${target} from` : ''} project memory`.replace(/\s+/g, ' ').trim()
  }

  // Generic structured input: surface the single most relevant field. Doing this
  // BEFORE the key/value fallback is what keeps a tool with one big argument
  // (`create_plan`: a short `task` plus a huge `context`) readable.
  for (const key of SUBJECT_KEYS) {
    const value = input[key]
    if (isString(value)) {
      return `${key}: ${value.trim()}`
    }
  }

  // Last resort: compact key/value list, never raw JSON, every value capped.
  const entries = Object.entries(input)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(
      ([key, value]) =>
        `${key}: ${truncate(typeof value === 'string' ? value : String(value), MAX_VALUE_CHARS)}`,
    )
  if (entries.length === 0) return null
  return entries.slice(0, MAX_FALLBACK_FIELDS).join(', ')
}

function describeInput(request: PendingToolPermissionRequest): { verb: string; target: string } {
  const input = request.input
  if (isString(input.command)) {
    return { verb: 'run', target: input.command.trim().replace(/\s+/g, ' ') }
  }
  const pathValue = isString(input.path)
    ? input.path
    : isString(input.filePath)
      ? input.filePath
      : ''
  if (pathValue) {
    return { verb: 'access', target: pathValue.trim() }
  }
  const structured = describeStructuredInput(input)
  if (structured) {
    return { verb: 'use', target: structured }
  }
  return { verb: 'continue', target: '' }
}

function renderPermissionPrompt(request: PendingToolPermissionRequest) {
  const { verb, target } = describeInput(request)
  const trimmedTarget = target.trim()

  if (trimmedTarget.length === 0) {
    return (
      <>
        Allow <span className="font-semibold text-text-primary">{request.toolName}</span> to
        continue?
      </>
    )
  }

  // Capped here rather than at each producer so EVERY path — command, path, and
  // structured input alike — is bounded. The full value stays in the tooltip.
  const shown = truncate(trimmedTarget, MAX_TARGET_CHARS)
  const wasTruncated = shown !== trimmedTarget

  return (
    <>
      Allow <span className="font-semibold text-text-primary">{request.toolName}</span> to {verb}{' '}
      <span
        className="inline-block max-w-full break-words rounded-[6px] border border-border/40 bg-bg-primary/80 px-1.5 py-0.5 align-bottom font-mono text-[14px] font-medium leading-[1.5] text-text-primary shadow-[0_1px_1px_rgba(0,0,0,0.02)] dark:shadow-none"
        {...(wasTruncated ? { title: trimmedTarget } : {})}
      >
        {shown}
      </span>
      ?
    </>
  )
}

export function ToolPermissionInlineCard({
  request,
  busy,
  error,
  onApprove,
  onDeny,
}: ToolPermissionInlineCardProps) {
  const prompt = renderPermissionPrompt(request)

  return (
    <div className="relative overflow-hidden rounded-[18px] bg-bg-primary p-[3px] shadow-sm ring-1 ring-border/40">
      <div className="flex items-center justify-between gap-3 rounded-[15px] bg-bg-secondary/20 px-3.5 py-2.5 ring-1 ring-inset ring-border/20">
        <div className="min-w-0 flex-1 text-[14px] leading-[1.5] text-text-secondary">{prompt}</div>
        <div className="flex shrink-0 items-center gap-1.5">
          <ComplexityChip request={request} />
          <Button
            variant="ghost"
            size="sm"
            className="h-[32px] rounded-full px-3.5 text-[14px] font-medium hover:bg-bg-hover hover:text-text-primary"
            onClick={() => void onDeny()}
            disabled={busy}
          >
            Deny
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="h-[32px] rounded-full px-3.5 text-[14px] font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
            onClick={() => void onApprove()}
            disabled={busy}
          >
            {busy ? 'Approving...' : 'Approve'}
          </Button>
        </div>
      </div>
      {error ? (
        <div className="mt-1.5 px-3 pb-1 text-[14px] leading-[1.5] text-error">{error}</div>
      ) : null}
    </div>
  )
}
