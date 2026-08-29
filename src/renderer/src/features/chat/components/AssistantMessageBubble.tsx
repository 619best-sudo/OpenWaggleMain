import type { SessionId } from '@shared/types/brand'
import type { UIMessage } from '@shared/types/chat-ui'
import type { JsonObject } from '@shared/types/json'
import type { SupportedModelId } from '@shared/types/llm'
import type { WaggleAgentColor } from '@shared/types/waggle'
import {
  Bot,
  Brain,
  ChevronDown,
  CornerDownRight,
  FileText,
  FolderOpen,
  GitBranch,
  Globe,
  LoaderCircle,
  type LucideIcon,
  Pencil,
  Search,
  Terminal,
  Wrench,
} from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { toolCallTitle } from 'turing-harness/tool-titles'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { looksLikeMachinePlanText } from '../lib/machine-plan-detection'
import { relativeToProject } from '../lib/project-paths'
import {
  getConcernLinesFromResultCached,
  getResultPath,
  getToolDiffData,
  getToolResultParts,
  getToolResultText,
  type LineConcern,
  READ_VIEW_MAX_HEIGHT_PX,
  RESULT_MAX_HEIGHT_PX,
} from '../lib/tool-call-block'
import { ASK_USER_QUESTION_TITLE_MAX, summarizeToolTarget } from '../lib/tool-display'
import { getToolMediaOutput, type ToolMediaOutput } from '../lib/tool-media-output'
import { useActiveProjectPath } from '../lib/use-active-project-path'
import { AgentLabel } from './AgentLabel'
import { MachinePlanStreamingPlaceholder } from './MachinePlanStreamingPlaceholder'
import { ReadFileView } from './ReadFileView'
import { StreamingText } from './StreamingText'
import { FileContentView, UnifiedDiffView } from './ToolCallBlockParts'
import { ToolMediaPreview } from './ToolMediaPreview'
import { ViewFileButton } from './ViewFileButton'

// ---- Inline tool block (matches PhaseTimelineCard ToolStrip styling) ----

function toolActionLabel(name: string) {
  const lower = name.toLowerCase()
  if (lower === 'read' || lower === 'cat') return 'READ'
  if (lower === 'write') return 'WRITE'
  if (lower === 'edit') return 'EDIT'
  if (lower === 'bash' || lower === 'bash_readonly') return 'RUN'
  if (lower === 'ls') return 'LS'
  if (lower === 'grep' || lower === 'find') return 'SEARCH'
  // MCP tools are namespaced `mcp__<server>__<tool>`; show the tool segment
  // (Title-Cased) instead of the whole ugly uppercased identifier.
  if (lower.startsWith('mcp__')) {
    const segments = name.split('__')
    const toolSegment = segments[segments.length - 1]
    if (toolSegment) {
      return toolSegment
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim()
    }
  }
  // Unknown native tools: Title-Case the snake/kebab name instead of shouting
  // it in caps (avoids echoing the same identifier twice, once as the chip).
  return name
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

function mediaActionLabel(media: ToolMediaOutput | null): string | null {
  if (!media) return null
  if (media.kind === 'image') return 'IMAGE'
  if (media.kind === 'video') return 'VIDEO'
  if (media.kind === 'audio') return 'AUDIO'
  if (media.kind === 'html') return 'HTML'
  return null
}

/**
 * Tool → badge appearance: an icon plus a tone.
 *
 * The badge is the one element in the transcript allowed to carry colour, so it
 * does the categorising work that would otherwise leak into the text around it.
 * Grouping is by KIND of side effect, not by individual tool — two tools that
 * do the same thing must never look different — and the icon carries the
 * meaning on its own, so the tone is reinforcement rather than the only signal.
 */
interface ToolBadge {
  readonly icon: LucideIcon
  readonly tone: string
}

const BADGE_READ: ToolBadge = { icon: FileText, tone: 'bg-badge-blue-bg text-badge-blue-text' }
const BADGE_LIST: ToolBadge = { icon: FolderOpen, tone: 'bg-badge-teal-bg text-badge-teal-text' }
const BADGE_EDIT: ToolBadge = { icon: Pencil, tone: 'bg-badge-amber-bg text-badge-amber-text' }
const BADGE_RUN: ToolBadge = { icon: Terminal, tone: 'bg-badge-green-bg text-badge-green-text' }
const BADGE_SEARCH: ToolBadge = { icon: Search, tone: 'bg-badge-violet-bg text-badge-violet-text' }
const BADGE_WEB: ToolBadge = { icon: Globe, tone: 'bg-badge-blue-bg text-badge-blue-text' }
const BADGE_AGENT: ToolBadge = { icon: Bot, tone: 'bg-badge-violet-bg text-badge-violet-text' }
const BADGE_OTHER: ToolBadge = { icon: Wrench, tone: 'bg-badge-neutral-bg text-badge-neutral-text' }

const TOOL_BADGES = new Map<string, ToolBadge>([
  ['read', BADGE_READ],
  ['cat', BADGE_READ],
  ['notebookread', BADGE_READ],
  ['ls', BADGE_LIST],
  ['tree', BADGE_LIST],
  ['glob', BADGE_LIST],
  ['write', BADGE_EDIT],
  ['edit', BADGE_EDIT],
  ['multiedit', BADGE_EDIT],
  ['notebookedit', BADGE_EDIT],
  ['bash', BADGE_RUN],
  ['bash_readonly', BADGE_RUN],
  ['terminal', BADGE_RUN],
  ['grep', BADGE_SEARCH],
  ['find', BADGE_SEARCH],
  ['search', BADGE_SEARCH],
  ['webfetch', BADGE_WEB],
  ['websearch', BADGE_WEB],
  ['task', BADGE_AGENT],
  ['agent', BADGE_AGENT],
  ['workflow', BADGE_AGENT],
])

function toolBadge(name: string): ToolBadge {
  const lower = name.toLowerCase()
  // MCP tools are all external calls, whatever the server names them.
  if (lower.startsWith('mcp__')) return BADGE_WEB
  return TOOL_BADGES.get(lower) ?? BADGE_OTHER
}

/**
 * Cache keyed on the args STRING identity: the stream reducer preserves part
 * (and therefore arguments-string) identity for every part it does not touch,
 * so a completed tool call's args object is stable across stream ticks. Without
 * this cache the args of EVERY tool call — including `write`/`edit` calls whose
 * args embed whole files — were JSON.parse'd again on every tick of the active
 * message's re-render.
 */
const pathByArgsString = new Map<string, string | null>()

function parsePathFromArgs(args: string): string | null {
  const cached = pathByArgsString.get(args)
  if (cached !== undefined) return cached
  let parsedPath: string | null = null
  try {
    const parsed = JSON.parse(args) as Record<string, unknown>
    if (typeof parsed.path === 'string' && parsed.path.trim()) parsedPath = parsed.path.trim()
    else if (typeof parsed.command === 'string' && parsed.command.trim()) {
      parsedPath = parsed.command.trim()
    }
  } catch {
    // A FAILED parse is never cached. While a tool's arguments stream in they
    // are partial JSON that always fails to parse, and each delta produces a
    // brand-new (longer) string — caching those would key the map on every
    // intermediate prefix and retain all of them. For a large `write` that is
    // thousands of entries whose keys sum to hundreds of megabytes, which is
    // GC pressure, not a cache.
    return null
  }
  // Only complete, parseable args reach here, so entries are bounded by the
  // number of tool calls made this app lifetime, and only tiny path strings are
  // retained — never the parsed bodies.
  if (pathByArgsString.size > 4096) pathByArgsString.clear()
  pathByArgsString.set(args, parsedPath)
  return parsedPath
}

/**
 * Normalize a path for concern correlation. `read` and `mark_concern_lines` may
 * pass slightly different strings for the same file (relative vs absolute,
 * trailing slash); collapse those so a lookup matches. Lowercased so matching is
 * case-insensitive (paths are code, but the model's casing is consistent enough
 * that this only helps, never hurts).
 */
function normalizeConcernPath(p: string): string {
  return p
    .replace(/[\\/]+$/, '')
    .trim()
    .toLowerCase()
}

function toolDiffLineCount(
  args: string,
  toolName: string,
  resultContent: unknown,
): { add: number; del: number } | null {
  try {
    const parsedArgs =
      typeof args === 'string'
        ? (() => {
            try {
              return JSON.parse(args)
            } catch {
              return {}
            }
          })()
        : {}
    const diff = getToolDiffData(resultContent, toolName, parsedArgs)
    if (!diff?.lines?.length) return null
    return { add: diff.additions ?? 0, del: diff.deletions ?? 0 }
  } catch {
    return null
  }
}

const FILE_VIEW_TOOLS = new Set(['read', 'write', 'edit'])
/** Tools whose result is a shell transcript rather than a file. */
const TERMINAL_TOOLS = new Set(['bash', 'bash_readonly', 'terminal'])

/**
 * Shell output.
 *
 * Rendered as a plain transcript — no line numbers, no gutter — because that is
 * what it is. Numbering it would make it look like source, which is the same
 * confusion the read view's note strip below exists to prevent.
 */
function TerminalOutputView({ output }: { readonly output: string }) {
  const text = output.trim()
  if (!text) {
    return (
      <div className="border-t border-code-view-border px-3 py-2 text-[11px] text-text-muted">
        No output
      </div>
    )
  }
  return (
    <pre
      className="diff-scroll overflow-auto border-t border-code-view-border bg-code-view-bg px-3 py-2 font-mono text-[12.5px] leading-[1.55] whitespace-pre-wrap break-words text-[color:var(--color-code-card-text)]"
      style={{ maxHeight: RESULT_MAX_HEIGHT_PX }}
    >
      {text}
    </pre>
  )
}

/** Shared empty args object, so the streaming path allocates nothing per delta. */
const EMPTY_ARGS: JsonObject = Object.freeze({})

function InlineToolBlockImpl({
  toolName,
  args,
  state,
  output,
  error,
  concern,
}: {
  readonly toolName: string
  readonly args: string
  readonly state: string
  readonly output?: unknown
  readonly error?: string
  readonly concern?: LineConcern
}) {
  const isStreaming = state === 'input-streaming' || state === 'executing'
  const isError = state === 'error' || !!error
  const isDone = state === 'complete'
  const lower = toolName.toLowerCase()
  const projectPath = useActiveProjectPath()
  // Arguments arrive as a growing string (`part.arguments + delta`) while the
  // model writes the call, and only `input-streaming` carries that partial
  // state — every other state is set from a complete, stringified input.
  //
  // Partial JSON can never parse, but `JSON.parse` still scans the WHOLE string
  // before throwing. Parsing on every delta is therefore O(n²) in the argument
  // size, on the main thread, for the entire time a tool is "working" — which
  // for a `write` carrying a large file body is the choppiness itself. Skip the
  // parse until the arguments are complete; the fallbacks below already render
  // exactly what a failed parse produced, so nothing is lost visually.
  const argsStreaming = state === 'input-streaming'
  const parsedArgs = useMemo(
    () => (argsStreaming ? EMPTY_ARGS : safeParseArgs(args)),
    [argsStreaming, args],
  )
  // Title shown next to the action chip: the tool's target (file path, command,
  // pattern, …) relativized to the open repo, falling back to a short arg
  // summary. Never repeats the tool name — the chip already shows the verb.
  const title = useMemo(() => {
    const rawPath = argsStreaming ? null : parsePathFromArgs(args)
    if (rawPath) {
      // `path` is a real file path → relativize; `command` is a shell command
      // (no relativization needed, but it's stored under the same field).
      const isCommand = lower === 'bash' || lower === 'bash_readonly'
      return isCommand ? rawPath : relativeToProject(projectPath, rawPath)
    }
    // Falls back to the harness's label for the call ("Analyze an image or
    // video") — never to the raw tool name.
    return summarizeToolTarget(lower, parsedArgs) || toolCallTitle(toolName, parsedArgs) || ''
  }, [args, argsStreaming, lower, parsedArgs, projectPath, toolName])
  // Raw target path (unrelativized) — used to infer the syntax-highlighting
  // language for the file/diff bodies.
  const filePath = useMemo(
    () => (argsStreaming ? null : parsePathFromArgs(args)),
    [argsStreaming, args],
  )
  // Target for the header's "View file" pill: read/write/edit only. A read
  // prefers the path the HARNESS resolved (`details.path`) over the raw arg —
  // the two can differ (relative args resolve against the run's cwd).
  const viewFilePath = useMemo(
    () =>
      FILE_VIEW_TOOLS.has(lower) ? ((output ? getResultPath(output) : null) ?? filePath) : null,
    [filePath, lower, output],
  )
  const diff = useMemo(
    () => (output ? toolDiffLineCount(args, toolName, output) : null),
    [args, toolName, output],
  )
  const fullDiff = useMemo(
    () => (output ? getToolDiffData(output, lower, parsedArgs) : null),
    [output, lower, parsedArgs],
  )
  // A read result is file bytes FIRST and any harness commentary after it —
  // as separate blocks, or concatenated in the harness's single text block.
  // Keep them apart: the bytes go to the numbered viewer, the commentary to
  // the reasoning section below the file (collapsed behind its badge).
  const readParts = useMemo(
    () => (lower === 'read' && output ? getToolResultParts(output) : null),
    [lower, output],
  )
  // Shell output — a transcript, not source. Shown on demand, never auto-opened.
  const terminalOutput = useMemo(
    () => (TERMINAL_TOOLS.has(lower) && output != null ? getToolResultText(output) : null),
    [lower, output],
  )
  const writeContent = useMemo(() => {
    if (lower !== 'write') return null
    const raw = parsedArgs.content
    return typeof raw === 'string' ? raw : null
  }, [lower, parsedArgs.content])
  const concernSet = useMemo(
    () => (concern?.lines.length ? new Set(concern.lines) : undefined),
    [concern],
  )
  // Media/HTML tool outputs render as a preview instead of (or alongside) the
  // file-view path. Detected from the tool's result payload shape.
  //
  // write/edit are excluded on purpose: their result is a FILE CHANGE, and the
  // diff below is the body the user wants. Letting a media match win means
  // writing `index.html` replaces a +437-line diff with a preview card — which
  // is strictly less information about what the agent just did.
  //
  // read is excluded for the symmetric reason: its result is the file's SOURCE
  // text, and the numbered FileContentView below is the body the user wants.
  // Without this exclusion, reading an `.html` file lets getToolMediaOutput
  // treat `details.path` as an HTML media reference, so a page-preview card
  // (HtmlPreview) renders in place of the source — and when the path is outside
  // the active project the preview resolves to nothing, so the read appears
  // EMPTY. Reads of `.ts`/`.py`/etc. never matched media in the first place,
  // which is why only HTML reads were broken.
  const media = useMemo(
    () =>
      output && lower !== 'read' && lower !== 'write' && lower !== 'edit'
        ? getToolMediaOutput(output)
        : null,
    [output, lower],
  )
  // ask_user_question: surface the question + options (and the user's selected
  // answer once the run resumes) in an expandable body.
  const askUserDetail = useMemo(
    () => (lower === 'ask_user_question' ? extractAskUserDetail(parsedArgs, output) : null),
    [lower, parsedArgs, output],
  )

  // A tool strip must stay openable whenever it produced a response. During a
  // run, the response is streamed inline (output is populated); after a run
  // completes and the session is hydrated, the response is recovered from the
  // persisted tool-result. In both cases we need the strip to remain expandable
  // so the tool response is never hidden — even if our specific body parsers
  // (file body / diff) can't make sense of an unusual payload shape, the user
  // can still open it to inspect the raw result.
  const hasBody =
    (lower === 'read' && output != null) ||
    (lower === 'write' && (writeContent != null || output != null)) ||
    (lower === 'edit' && output != null) ||
    !!terminalOutput ||
    !!media ||
    askUserHasContent(askUserDetail)
  // read/write/edit, media, and ask_user_question tools default expanded; other
  // tools — shell runs included — stay header-only until clicked.
  //
  // A FAILED call is never auto-expanded whatever the tool: its body is an error
  // payload, not the file view the expansion was meant to show, and a run that
  // hits several failures in a row unrolls into a wall of them.
  const autoExpands = !isError && (FILE_VIEW_TOOLS.has(lower) || !!media || !!askUserDetail)
  const [expanded, setExpanded] = useState(autoExpands && hasBody)
  // `useState`'s initializer only runs once, at first mount. For a tool whose
  // "default expanded" signal arrives AFTER mount — a screenshot/media tool,
  // whose `media` is null until `tool_execution_end` streams the result — the
  // block mounts collapsed and then never re-evaluates the initializer, so the
  // image stays hidden behind the header until the run completes and the
  // session re-hydrates (which re-mounts the block with `media` already set).
  // read/write/edit are unaffected because FILE_VIEW_TOOLS makes them expand at
  // mount regardless of when output arrives.
  //
  // Track whether the user has manually toggled, and the body-signal we already
  // auto-expanded for, so the FIRST appearance of an expandable body opens it —
  // without fighting a user who deliberately collapsed it.
  const userToggledRef = useRef(false)
  const autoExpandedBodyRef = useRef(false)
  useEffect(() => {
    if (userToggledRef.current) return
    if (autoExpandedBodyRef.current) return
    if (!hasBody) return
    if (!autoExpands) return
    autoExpandedBodyRef.current = true
    setExpanded(true)
  }, [hasBody, autoExpands])

  const mediaLabel = mediaActionLabel(media)
  const showAction = mediaLabel ?? toolActionLabel(toolName)
  const badge = toolBadge(toolName)

  return (
    // ONE frame, not two. This used to be an outer bordered box with 1.5px of
    // padding wrapped around an inner bordered box — which drew a second border
    // and left a 1-2px band of page colour between the two, visible all the way
    // around every expanded code view. The elevated edge now comes from the
    // frame's ring (border + inner highlight), so the code sits flush against
    // the card it lives in.
    <div
      className={cn(
        'home-panel-frame-soft overflow-hidden rounded-[12px]',
        isError ? 'border-error/40 bg-error/8' : 'border-border bg-bg-secondary',
      )}
    >
      <div>
        {/* Header row. The expand toggle has to be the BUTTON and the "View
            file" pill its SIBLING — the whole header used to be one <button>,
            and a nested button is invalid HTML. flex-1 keeps the toggle
            spanning the row, so the pill sits at the extreme right. Only the
            row is a flex container; the error line and body below it are
            normal block siblings again. */}
        <div className="flex items-center">
          <button
            type="button"
            aria-expanded={hasBody ? expanded : undefined}
            onClick={() => {
              if (hasBody) {
                userToggledRef.current = true
                setExpanded((value) => !value)
              }
            }}
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left text-[11px]',
              hasBody ? 'cursor-pointer' : 'cursor-default',
            )}
          >
            {showAction && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-[6px] px-1.5 py-0.5',
                  'text-[10px] font-semibold uppercase tracking-[0.08em]',
                  badge.tone,
                )}
              >
                <badge.icon className="size-3 shrink-0" strokeWidth={2.25} />
                {showAction}
              </span>
            )}
            {/* The filename sizes to its content (not flex-1) so the +/- counts sit
              directly beside it rather than being pushed to the far right. */}
            <span className="min-w-0 truncate font-mono text-text-secondary">
              {title || toolName}
            </span>
            {isDone && diff && (
              <span className="flex items-center gap-1.5 text-[10px] font-medium tabular-nums shrink-0">
                {diff.add > 0 && <span className="text-diff-add-text">+{diff.add}</span>}
                {diff.del > 0 && <span className="text-diff-remove-text">-{diff.del}</span>}
              </span>
            )}
            {/* Disclosure sits to the RIGHT of the name, so the row reads badge →
              target → control. Leading it pushed every badge and filename one
              notch right and left a ragged empty column on the strips that have
              no body to open. It follows the +/- counts rather than splitting
              them off the filename they describe. */}
            {hasBody && (
              <ChevronDown
                className={cn(
                  'size-3 shrink-0 text-text-muted transition-transform',
                  !expanded && '-rotate-90',
                )}
              />
            )}
            {/* Absorbs the remaining width, keeping status indicators right-aligned. */}
            <span className="flex-1" />
            {isStreaming && (
              <LoaderCircle className="size-3 shrink-0 animate-spin text-text-muted" />
            )}
            {isError && <span className="text-[10px] text-error shrink-0">Failed</span>}
          </button>
          {viewFilePath && <ViewFileButton path={viewFilePath} className="mr-2.5" />}
        </div>
        {isError && error ? (
          <div className="px-3 pb-2 text-[10px] text-error font-mono truncate">{error}</div>
        ) : null}

        {expanded && hasBody && (
          <div>
            {media ? (
              <div className="px-3 pb-3">
                <ToolMediaPreview output={media} />
              </div>
            ) : askUserDetail ? (
              <div className="px-3 pb-3">
                <AskUserQuestionBody detail={askUserDetail} />
              </div>
            ) : (
              <>
                {lower === 'read' && output != null && (
                  <ReadFileView
                    body={readParts?.body || getToolResultText(output)}
                    reasoning={readParts?.notes ?? ''}
                    concernSet={concernSet}
                    maxHeight={READ_VIEW_MAX_HEIGHT_PX}
                    path={filePath}
                  />
                )}
                {terminalOutput != null && <TerminalOutputView output={terminalOutput} />}
                {lower === 'write' &&
                  (fullDiff && fullDiff.lines.length > 0 ? (
                    // Real unified diff from the tool result (previous file vs the
                    // bytes written) — the accurate view, including authored writes.
                    <UnifiedDiffView diff={fullDiff} compact path={filePath} />
                  ) : writeContent != null ? (
                    // No result diff yet (still streaming) — show the drafted
                    // content as all-additions so there's always a body to open.
                    <FileContentView
                      content={writeContent}
                      variant="additions"
                      maxHeight={READ_VIEW_MAX_HEIGHT_PX}
                      path={filePath}
                    />
                  ) : output != null ? (
                    // Result arrived but carried no diff (unusual) — surface the raw
                    // response instead of an empty body.
                    <FileContentView
                      content={getToolResultText(output)}
                      variant="default"
                      maxHeight={READ_VIEW_MAX_HEIGHT_PX}
                    />
                  ) : null)}
                {lower === 'edit' &&
                  output != null &&
                  (fullDiff && fullDiff.lines.length > 0 ? (
                    <UnifiedDiffView diff={fullDiff} compact path={filePath} />
                  ) : (
                    // Parser couldn't build a diff (unusual payload shape) — still
                    // surface the raw response so it isn't hidden.
                    <FileContentView
                      content={getToolResultText(output)}
                      variant="default"
                      maxHeight={READ_VIEW_MAX_HEIGHT_PX}
                    />
                  ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Memoized so a completed tool strip (e.g. a finished `read` of a large file)
 * does not re-render on every stream event. The active assistant message gets a
 * fresh object reference on each token / tool start-end, which re-renders its
 * bubble and — without this memo — every InlineToolBlock beneath it, including
 * the O(fileLines) FileContentView line tree for reads. Props (`toolName`,
 * `args`, `state`, `output`, `concern`) are referentially stable for an
 * unchanged tool call, so the shallow compare holds and completed strips bail
 * out. The only store read inside is `useActiveProjectPath` (the repo root used
 * to relativize the title path), which is stable for a given session and only
 * changes on a session switch that remounts the transcript anyway.
 */
const InlineToolBlock = memo(InlineToolBlockImpl)

function safeParseArgs(args: string): JsonObject {
  try {
    const parsed = JSON.parse(args)
    return parsed && typeof parsed === 'object' ? (parsed as JsonObject) : {}
  } catch {
    return {}
  }
}

interface AskUserOption {
  readonly label: string
  readonly description?: string
  readonly recommended?: boolean
}

interface AskUserAnswer {
  readonly text?: string
  readonly attachmentCount: number
}

interface AskUserDetail {
  readonly question: string
  readonly reason?: string
  readonly options: readonly AskUserOption[]
  readonly answer?: AskUserAnswer
}

/**
 * Normalize one entry of `args.options`, which the agent may write either way.
 *
 * The schema accepts a bare string OR `{label, description, recommended}` — the
 * object form is the one the agent is told to prefer, because a label alone
 * makes the user do the thinking. This used to filter to `typeof === 'string'`,
 * so every richly-described question rendered as an EMPTY options list in the
 * transcript: the live card showed the trade-offs, and the replay showed
 * nothing. Reading both forms is what keeps the two views telling the same story.
 */
function toAskUserOption(entry: unknown): AskUserOption | null {
  if (typeof entry === 'string') {
    const label = entry.trim()
    return label ? { label } : null
  }
  if (!entry || typeof entry !== 'object') return null
  const o = entry as Record<string, unknown>
  const raw = o.label ?? o.value ?? o.title
  const label = typeof raw === 'string' ? raw.trim() : ''
  if (!label) return null
  const description =
    typeof o.description === 'string' && o.description.trim() ? o.description.trim() : undefined
  return {
    label,
    ...(description ? { description } : {}),
    ...(o.recommended === true ? { recommended: true } : {}),
  }
}

/**
 * Pull the question, options, and (once the run resumes) the user's selected
 * answer out of an `ask_user_question` tool call. The answer is the tool's
 * result text — the harness returns the user's response as the tool result so
 * the conversation continues in the same context.
 */
function extractAskUserDetail(args: JsonObject, output: unknown): AskUserDetail | null {
  const question = typeof args.question === 'string' ? args.question.trim() : ''
  if (!question) return null
  const reason =
    typeof args.reason === 'string' && args.reason.trim() ? args.reason.trim() : undefined
  const options = Array.isArray(args.options)
    ? args.options.map(toAskUserOption).filter((o): o is AskUserOption => o !== null)
    : []
  const answerRaw = output ? getToolResultText(output).trim() : ''
  return { question, reason, options, answer: parseAskUserAnswer(answerRaw) }
}

/**
 * The `ask_user_question` result is written for the MODEL, not the reader: it
 * re-states the question and the reason so the LLM keeps its bearings when the
 * answer lands many turns later. The card shows both already, so strip that
 * envelope and keep only what the user actually said.
 */
function parseAskUserAnswer(raw: string): AskUserAnswer | undefined {
  if (!raw) return undefined
  let text: string | undefined
  let attachmentCount = 0
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('(clarification for:')) continue
    if (trimmed.startsWith('Reason this was needed:')) continue
    if (trimmed.startsWith('The user attached ')) continue
    if (trimmed.startsWith('- ')) {
      attachmentCount += 1
      continue
    }
    // "User answered with a file and no text." carries no words to show.
    if (/^User answered with .+ and no text\.$/.test(trimmed)) continue
    const answered = trimmed.match(/^User answered:\s*(.*)$/)
    const value = answered ? (answered[1]?.trim() ?? '') : trimmed
    if (!value || value === '(empty)') continue
    text = text ? `${text}\n${value}` : value
  }
  if (!text && attachmentCount === 0) return undefined
  return { ...(text ? { text } : {}), attachmentCount }
}

/**
 * Whether the expanded card would show anything the header doesn't. A short
 * question that was answered inline needs no drawer at all.
 */
function askUserHasContent(detail: AskUserDetail | null): boolean {
  if (!detail) return false
  return (
    !!detail.answer ||
    !!detail.reason ||
    detail.options.length > 0 ||
    detail.question.length > ASK_USER_QUESTION_TITLE_MAX
  )
}

/**
 * The answered card is a two-line exchange: the question, then what the user
 * said. Everything else the tool result carries — the restated question, the
 * agent's justification, the list of options once one was chosen — is context
 * the model needs and the reader has already seen, so it stays out of the UI.
 */
function AskUserQuestionBody({ detail }: { readonly detail: AskUserDetail }) {
  const { answer } = detail
  // The collapsed header is the question, so restate it only when it was long
  // enough to get cut off there.
  const showQuestion = detail.question.length > ASK_USER_QUESTION_TITLE_MAX
  const attachmentNote = answer?.attachmentCount
    ? `${answer.attachmentCount} file${answer.attachmentCount === 1 ? '' : 's'} attached`
    : null

  return (
    <div className="rounded-[12px] border border-border/40 bg-bg-secondary/30 px-3.5 py-3">
      {showQuestion ? (
        <div className="text-[13px] leading-[1.5] text-text-primary">{detail.question}</div>
      ) : null}

      {/* Why the agent had to ask only matters while it is still waiting. */}
      {!answer && detail.reason ? (
        <div
          className={cn('text-[12px] leading-[1.5] text-text-secondary', showQuestion && 'mt-1')}
        >
          {detail.reason}
        </div>
      ) : null}

      {!answer && detail.options.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {detail.options.map((option) => (
            <span
              key={option.label}
              title={option.description}
              className="rounded-[8px] border border-border/35 bg-bg-primary/60 px-2 py-1 text-[12px] leading-[1.4] text-text-secondary"
            >
              {option.label}
              {option.recommended ? (
                <span className="ml-1 text-[10px] leading-[1.4] text-accent">· Recommended</span>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}

      {answer ? (
        <div className={cn('flex gap-2', showQuestion && 'mt-2')}>
          <CornerDownRight className="mt-[4px] size-3.5 shrink-0 text-text-tertiary" />
          <div className="min-w-0">
            {answer.text ? (
              <div className="whitespace-pre-wrap break-words text-[13px] leading-[1.5] text-text-primary">
                {answer.text}
              </div>
            ) : null}
            {attachmentNote ? (
              <div
                className={cn(
                  'text-[11px] leading-[1.5] text-text-tertiary',
                  answer.text && 'mt-1',
                )}
              >
                {attachmentNote}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export interface WaggleInfo {
  agentLabel: string
  agentColor: WaggleAgentColor
}

function BranchFromMessageButton({
  messageId,
  onBranchFromMessage,
  className,
}: {
  readonly messageId: string
  readonly onBranchFromMessage: (messageId: string) => void
  readonly className: string
}) {
  return (
    <Button
      variant="unstyled"
      type="button"
      title="Branch from message"
      onClick={() => onBranchFromMessage(messageId)}
      className={className}
    >
      <GitBranch className="size-3.5" />
    </Button>
  )
}

/**
 * Renders an assistant text part. While streaming, a machine-mode plan arrives as
 * raw JSON that the transcript replaces with the timeline card once persisted;
 * show a placeholder instead of flashing that JSON. After streaming ends the
 * normal content renders, so nothing is permanently hidden if it wasn't a plan.
 */
function AssistantTextPart({
  content,
  isStreaming,
}: {
  readonly content: string
  readonly isStreaming: boolean
}) {
  if (isStreaming && looksLikeMachinePlanText(content)) {
    return <MachinePlanStreamingPlaceholder />
  }
  // Left-align the plain narration with the tool/thinking blocks' content edge.
  // Those blocks inset their content (border + horizontal padding) by ~13px,
  // so match that here — otherwise the text reads a hair further left and the
  // turn looks ragged.
  return (
    <StreamingText text={content} isStreaming={isStreaming} className="prose-reading pl-[13px]" />
  )
}

/** Reasoning is context, not the answer — it never grows past this many lines. */
const REASONING_MAX_LINES = 5
/** Must match the `leading-[1.5]` on the body; the height cap is derived from it. */
const REASONING_LINE_HEIGHT = 1.5

/**
 * The reasoning text itself, capped at {@link REASONING_MAX_LINES}.
 *
 * A long chain of thought used to push the answer — and every tool call after
 * it — off the screen, so the transcript scrolled past the parts you actually
 * came for. Short reasoning still renders at its natural height; only the
 * overlong case becomes a scroller. The cap is in `em`, so it tracks the body's
 * own font size rather than a pixel number that drifts when the type scale moves.
 */
function ReasoningBody({
  content,
  isStreaming,
  className,
  textClassName,
}: {
  readonly content: string
  readonly isStreaming: boolean
  readonly className?: string
  readonly textClassName?: string
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)

  // A capped thinking block used to `overscroll-contain`, which stopped the
  // wheel dead at its edge instead of handing it back to the transcript. It
  // chains now; the transcript's delegated `useChainedWheel` covers the case
  // CSS cannot — Chromium latching a gesture to the scroller it began on.

  // Pin to the newest text while it streams, so a capped block reads as live
  // thinking instead of a frozen first five lines.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !isStreaming || content.length === 0) return
    el.scrollTop = el.scrollHeight
  }, [content, isStreaming])

  return (
    // Padding lives on the frame, not the scroller, so the cap measures five
    // lines of text rather than five lines minus the padding (`border-box`).
    <div className={className}>
      <div
        ref={scrollRef}
        className="diff-scroll overflow-y-auto text-[12px] leading-[1.5]"
        style={{ maxHeight: `${REASONING_MAX_LINES * REASONING_LINE_HEIGHT}em` }}
      >
        <div ref={contentRef}>
          <StreamingText text={content} isStreaming={isStreaming} className={textClassName} />
        </div>
      </div>
    </div>
  )
}

/**
 * Renders a reasoning/thinking block.
 *
 * Visibility policy, derived from real persisted data: when reasoning is on,
 * the model narrates its pre-tool intent INSIDE the reasoning channel (e.g.
 * "Let me read the project memory to find the relevant files"), and the turn's
 * only content is `[reasoning, tool-call]` with no `text` part. If we collapsed
 * that reasoning, the user would see a silent wall of tool chips with no
 * narration at all — exactly the "boring app" problem. So:
 *
 *   - Tool-bearing turn (hasToolCall): the reasoning IS the narration → show it
 *     visibly, inline, in muted prose. Still togglable to hide.
 *   - Pure-answer turn (no tool call): the turn carries a `text` part that is
 *     the answer; the reasoning is auxiliary → render it as a collapsed
 *     "Thinking" chip that expands on click, and auto-expand only while
 *     streaming so the user can watch it think.
 *
 * `userToggled` records an explicit click so the streaming-driven auto-expand
 * on pure-answer turns doesn't fight a manual choice.
 */
function ReasoningBlock({
  content,
  isStreaming,
  hasToolCall,
}: {
  readonly content: string
  readonly isStreaming: boolean
  readonly hasToolCall: boolean
}) {
  // Tool-bearing turns: reasoning is the narration → always visible. Pure-answer
  // turns: collapsed chip, auto-open while streaming unless the user toggled.
  const [open, setOpen] = useState(hasToolCall)
  const [userToggled, setUserToggled] = useState(false)

  useEffect(() => {
    if (hasToolCall) return // tool-bearing turns are always open; ignore streaming
    if (!userToggled) {
      setOpen(isStreaming)
    }
  }, [isStreaming, userToggled, hasToolCall])

  const toggle = () => {
    setUserToggled(true)
    setOpen((prev) => !prev)
  }

  // Tool-bearing turn: render the narration inline as muted prose (no chip),
  // with a small "thinking" label so it reads as the agent's voice, not the
  // final answer. Collapsible to keep control with the user.
  if (hasToolCall) {
    return (
      <div className="rounded-[10px] border border-border/20 bg-bg-secondary/[0.08]">
        <button
          type="button"
          onClick={toggle}
          className="flex w-full items-center gap-1.5 px-2.5 py-1 text-[10px] text-text-muted/80 hover:text-text-secondary transition-colors"
          aria-expanded={open}
          aria-label={open ? 'Hide reasoning' : 'Show reasoning'}
        >
          <Brain className="size-3 shrink-0" />
          <span className="uppercase tracking-wide font-medium">
            {open ? 'thinking' : 'show thinking'}
          </span>
          {!open && <ChevronDown className="size-3 shrink-0" />}
        </button>
        {open && content.trim() ? (
          <ReasoningBody
            content={content}
            isStreaming={isStreaming}
            className="px-3 pb-2 pt-0.5"
            textClassName="text-text-muted italic"
          />
        ) : null}
      </div>
    )
  }

  // Pure-answer turn: collapsed "Thinking" chip, auto-expand while streaming.
  return (
    <div className="rounded-[12px] border border-border/30 bg-bg-secondary/[0.12]">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] text-text-muted hover:text-text-secondary transition-colors"
        aria-expanded={open}
      >
        <Brain className="size-3.5 shrink-0" />
        <span className="font-medium">Thinking</span>
        {isStreaming ? (
          <LoaderCircle className="size-3 shrink-0 animate-spin" />
        ) : (
          <ChevronDown
            className={cn('size-3 shrink-0 transition-transform', open ? 'rotate-180' : 'rotate-0')}
          />
        )}
      </button>
      {open && content.trim() ? (
        <ReasoningBody
          content={content}
          isStreaming={isStreaming}
          className="border-t border-border/20 px-3 pb-2.5 pt-0.5"
          textClassName="text-text-muted"
        />
      ) : null}
    </div>
  )
}

interface AssistantMessageBubbleProps {
  message: UIMessage
  isStreaming?: boolean
  isRunActive?: boolean
  assistantModel?: SupportedModelId
  sessionId: SessionId | null
  waggle?: WaggleInfo
  hideAgentLabel?: boolean
  onBranchFromMessage?: (messageId: string) => void
}

export function AssistantMessageBubble({
  message,
  isStreaming,
  isRunActive: _isRunActive,
  assistantModel: _assistantModel,
  sessionId: _sessionId,
  waggle,
  hideAgentLabel,
  onBranchFromMessage,
}: AssistantMessageBubbleProps) {
  // Render parts IN ORDER so narration interleaves naturally with tool calls
  // (e.g. "I need to read this" → READ block → "The file has X"). The previous
  // implementation bucketed text/call/result into three separate groups, which
  // lost the model's natural ordering and made turns read as a flat wall of
  // tool calls.
  //
  // Tool-result dedup: a `tool-result` whose `toolCallId` is covered by a
  // paired `tool-call` part is skipped (its output is shown on the call block
  // itself). Orphan results (no matching call) still render standalone.
  const toolCallIds = useMemo(
    () =>
      new Set(
        message.parts
          .filter(
            (part): part is Extract<UIMessage['parts'][number], { type: 'tool-call' }> =>
              part.type === 'tool-call',
          )
          .map((part) => part.id),
      ),
    [message.parts],
  )

  // On live streams the tool-call part carries `output` directly. On hydrated
  // sessions the call part has no output — the result lives on the paired
  // `tool-result` part (which the dedup below skips from rendering). Index
  // those results by toolCallId so we can feed them back into the call block
  // and still render the diff / file body for a reloaded session.
  const toolResultByCallId = useMemo(() => {
    const map = new Map<string, unknown>()
    for (const part of message.parts) {
      if (part.type !== 'tool-result') continue
      map.set(part.toolCallId, part.content)
    }
    return map
  }, [message.parts])

  // mark_concern_lines calls never render as their own row — their result is
  // folded onto the matching read's file view as line highlights. Build a
  // path → concerns map from all such tool-call parts in this message.
  //
  // Keying: the model passes the SAME path string to `read` and
  // `mark_concern_lines`, so we correlate by that raw arg path (normalized for
  // trailing slashes / case). We can't rely on the read's resolved `details.path`
  // because pi's ReadToolDetails carries no path field.
  const concernsByPath = useMemo(() => {
    const map = new Map<string, LineConcern>()
    for (const part of message.parts) {
      if (part.type !== 'tool-call') continue
      if (part.name !== 'mark_concern_lines') continue
      const concern = part.output ? getConcernLinesFromResultCached(part.output) : null
      if (concern) {
        // Index under every form we might look up by: the resolved path the tool
        // returned AND the raw arg path the model passed. Parsed only once a
        // concern exists — until then the call may still be streaming, and this
        // memo re-runs on every delta of the message.
        const argPath = parsePathFromArgs(part.arguments)
        map.set(normalizeConcernPath(concern.path), concern)
        if (argPath) map.set(normalizeConcernPath(argPath), concern)
      }
    }
    return map
  }, [message.parts])

  const renderableParts = message.parts.map((part, index) => {
    if (part.type === 'text' && part.content.trim()) {
      return (
        <AssistantTextPart
          key={`${message.id}-text-${String(index)}`}
          content={part.content}
          isStreaming={!!isStreaming}
        />
      )
    }
    if (part.type === 'thinking' && part.content.trim()) {
      return (
        <ReasoningBlock
          key={`${message.id}-thinking-${String(index)}`}
          content={part.content}
          isStreaming={!!isStreaming}
          hasToolCall={toolCallIds.size > 0}
        />
      )
    }
    if (part.type === 'tool-call') {
      // mark_concern_lines is folded onto reads as highlights, never its own row.
      if (part.name === 'mark_concern_lines') return null
      // Correlate this call with a concern entry by the raw path arg the model
      // passed (the same string it passed to mark_concern_lines). pi's read
      // details carry no path, so the arg path is the source of truth here.
      // Same reason as inside the block: while a call's arguments stream in they
      // are partial JSON, so this parse can only fail — after scanning the whole
      // (growing) string, on every delta. A streaming call has no concern
      // highlights to correlate yet in any case.
      const argPath = part.state === 'input-streaming' ? null : parsePathFromArgs(part.arguments)
      const concern = argPath ? concernsByPath.get(normalizeConcernPath(argPath)) : undefined
      // Hydrated sessions: the call part has no `output`, so fall back to the
      // paired tool-result part's content (same payload shape) to recover the
      // diff / file body.
      const output = part.output ?? toolResultByCallId.get(part.id)
      return (
        <InlineToolBlock
          key={`${message.id}-tc-${part.id ?? String(index)}`}
          toolName={part.name}
          args={part.arguments}
          state={part.state}
          output={output}
          concern={concern}
        />
      )
    }
    if (part.type === 'tool-result' && !toolCallIds.has(part.toolCallId)) {
      // Orphan mark_concern_lines results are also hidden (they only carry a
      // concerns payload that's folded onto reads). Detect by shape, since the
      // tool-result part has no toolName field.
      if (getConcernLinesFromResultCached(part.content)) return null
      const isError = part.state === 'error' || !!part.error
      const resultText =
        part.error ||
        (typeof part.content === 'string' ? part.content.split('\n')[0]?.slice(0, 160) : undefined)
      return (
        <div
          key={`${message.id}-tr-${part.toolCallId ?? String(index)}`}
          className={cn(
            'rounded-[12px] border px-3 py-1.5 text-[11px] font-mono',
            isError
              ? 'border-red-500/30 bg-red-500/5 text-red-400'
              : 'border-border/45 bg-bg-secondary/[0.12] text-text-muted',
          )}
        >
          <span className="line-clamp-2 break-all">
            {resultText || (isError ? 'Error' : 'Done')}
          </span>
        </div>
      )
    }
    return null
  })

  return (
    <div className="group/assistant-msg relative w-full">
      {hideAgentLabel && onBranchFromMessage ? (
        <BranchFromMessageButton
          messageId={message.id}
          onBranchFromMessage={onBranchFromMessage}
          className="absolute right-0 top-0 opacity-0 group-hover/assistant-msg:opacity-100 transition-opacity text-text-muted hover:text-text-secondary"
        />
      ) : null}
      <div className="flex flex-col gap-2">
        {!hideAgentLabel ? (
          <div className="flex items-center justify-between gap-2">
            <AgentLabel waggle={waggle} />
            {onBranchFromMessage ? (
              <BranchFromMessageButton
                messageId={message.id}
                onBranchFromMessage={onBranchFromMessage}
                className="ml-auto opacity-0 group-hover/assistant-msg:opacity-100 transition-opacity text-text-muted hover:text-text-secondary"
              />
            ) : null}
          </div>
        ) : null}

        {renderableParts}
      </div>
    </div>
  )
}
