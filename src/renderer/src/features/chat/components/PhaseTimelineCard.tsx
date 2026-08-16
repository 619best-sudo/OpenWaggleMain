import type { PendingUserQuestionRequest } from '@shared/types/user-question'
import { useEffect, useMemo, useState } from 'react'
import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { relativeToProject } from '@/features/chat/lib/project-paths'
import { parseToolArgs } from '@/features/chat/lib/tool-args'
import {
  getConcernLinesFromResultCached,
  getResultError,
  getResultPath,
  getToolDiffData,
  type LineConcern,
  READ_VIEW_MAX_HEIGHT_PX,
  type ToolCallResultPayload,
} from '@/features/chat/lib/tool-call-block'
import { summarizeToolTarget } from '@/features/chat/lib/tool-display'
import { getToolMediaOutput } from '@/features/chat/lib/tool-media-output'
import { useActiveProjectPath } from '@/features/chat/lib/use-active-project-path'
import { cn } from '@/shared/lib/cn'
import { safeMarkdownComponents } from '@/shared/lib/markdown-link-components'
import { safeMarkdownRehypePlugins, safeMarkdownUrlTransform } from '@/shared/lib/markdown-safety'
import { Button } from '@/shared/ui/Button'
import { Textarea } from '@/shared/ui/Textarea'
import type { ChatRow, PhaseTimelinePhaseRow, PhaseTimelineToolDetail } from '../lib/types-chat-row'
import { FileContentView, ToolArgs, ToolResult, UnifiedDiffView } from './ToolCallBlockParts'
import { ToolMediaPreview } from './ToolMediaPreview'
import { UserQuestionCard } from './UserQuestionCard'

interface PhaseTimelineCardProps {
  row: Extract<ChatRow, { type: 'phase' }>
  pendingUserQuestionRequest?: PendingUserQuestionRequest | null
  onResolveUserQuestion?: (resolution: {
    request: NonNullable<PhaseTimelinePhaseRow['pendingUserQuestion']>
    answer: string
  }) => Promise<void>
}

const PHASE_REMARK_PLUGINS = [remarkGfm]
const UNIX_PATH_PATTERN = /(^|[\s(])((?:\/[\w.-]+)+)/gm

const phaseMarkdownComponents: Components = {
  ...safeMarkdownComponents,
  p: ({ children }) => (
    <p className="my-0 text-[14px] leading-[1.72] text-text-primary">{children}</p>
  ),
  ol: ({ children }) => (
    <ol className="my-0 list-decimal pl-5 text-[14px] leading-[1.72] text-text-primary space-y-1.5">
      {children}
    </ol>
  ),
  ul: ({ children }) => (
    <ul className="my-0 list-disc pl-5 text-[14px] leading-[1.72] text-text-primary space-y-1.5">
      {children}
    </ul>
  ),
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-text-primary">{children}</strong>,
  em: ({ children }) => <em className="italic text-text-primary/90">{children}</em>,
  code: ({ children, className }) => (
    <code
      className={cn(
        'rounded-[6px] border border-border/35 bg-bg-secondary/70 px-1.5 py-0.5 font-mono text-[0.92em] text-text-primary',
        className,
      )}
    >
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-[10px] border border-border/35 bg-bg-secondary/20 p-3 text-[13px] leading-[1.65]">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-0 border-l-2 border-border/45 pl-3 text-text-primary/88">
      {children}
    </blockquote>
  ),
}

function normalizePhaseMarkdown(text: string) {
  return text
    .trim()
    .replace(/(\S)\s+(\d+\.\s)/g, '$1\n$2')
    .replace(UNIX_PATH_PATTERN, (_, prefix: string, filePath: string) => `${prefix}\`${filePath}\``)
    .replace(/(?<!`)(<\/?[A-Za-z][^>\n]*>)(?!`)/g, '`$1`')
}

function MarkdownBlock({ content, className }: { content: string; className?: string }) {
  return (
    <div
      className={cn(
        'max-w-none break-words [overflow-wrap:anywhere] text-text-primary',
        'flex flex-col gap-3',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={PHASE_REMARK_PLUGINS}
        rehypePlugins={safeMarkdownRehypePlugins}
        urlTransform={safeMarkdownUrlTransform}
        components={phaseMarkdownComponents}
      >
        {normalizePhaseMarkdown(content)}
      </ReactMarkdown>
    </div>
  )
}

function statusLabel(phase: PhaseTimelinePhaseRow) {
  return phase.label
}

function fallbackPhaseSummary(phase: PhaseTimelinePhaseRow) {
  if (phase.status === 'running') {
    return undefined
  }
  if (phase.id === 'perform') {
    return phase.status === 'failed'
      ? 'Implementation ended without a rendered summary. Review the tool activity above for the attempted changes and any failure details.'
      : 'Implementation completed. Review the tool activity above for the applied file changes.'
  }
  if (phase.id === 'perfect') {
    return phase.status === 'failed'
      ? 'Verification finished without a rendered summary. Review the tool activity above for the checks that led to the failed verdict.'
      : 'Verification completed. Review the tool activity above for the checks that determined the final verdict.'
  }
  return undefined
}

function parseToolPath(argumentsString: string | undefined) {
  if (!argumentsString) return null
  try {
    const parsed = JSON.parse(argumentsString) as { path?: unknown; query?: unknown }
    if (typeof parsed.path === 'string' && parsed.path.trim().length > 0) return parsed.path.trim()
    if (typeof parsed.query === 'string' && parsed.query.trim().length > 0)
      return parsed.query.trim()
    return null
  } catch {
    return null
  }
}

function getActionLabel(toolName: string) {
  if (toolName === 'read' || toolName === 'cat') return 'READ'
  if (toolName === 'write') return 'WRITE'
  if (toolName === 'edit') return 'EDIT'
  if (toolName === 'ls') return 'LS'
  if (toolName === 'grep' || toolName === 'find') return 'SEARCH'
  if (toolName === 'mark_concern_lines') return 'CONCERN'
  if (toolName === 'run_command' || toolName === 'execute') return 'RUN'
  return toolName.toUpperCase()
}

function getToolTone(toolName: string) {
  if (toolName === 'read' || toolName === 'cat') {
    return 'bg-sky-500/10 text-sky-500'
  }
  return 'bg-text-tertiary/10 text-text-secondary'
}

function toToolResultPayload(tool: PhaseTimelineToolDetail): ToolCallResultPayload | undefined {
  if (!tool.toolResult) {
    return undefined
  }
  return {
    content: tool.toolResult.content,
    state: tool.toolResult.state,
    ...(tool.toolResult.sourceMessageId
      ? { sourceMessageId: tool.toolResult.sourceMessageId }
      : {}),
  }
}

/** Resolve a tool's absolute file path: prefer the harness `details.path` on a
 *  successful result (read/mark_concern_lines write it there), fall back to the
 *  `path`/`query` arg. Used to correlate a read with its mark_concern_lines. */
function resolveToolPath(tool: PhaseTimelineToolDetail): string | null {
  const result = toToolResultPayload(tool)
  if (result) {
    const detailsPath = getResultPath(result.content)
    if (detailsPath) return detailsPath
  }
  return parseToolPath(tool.toolCall?.arguments)
}

/** Build a path → concerns map from a phase's mark_concern_lines tool results,
 *  and return the list of tools with those calls filtered out (they're shown
 *  only as highlights on the matching read, never as their own row). */
function collectConcernsAndVisibleTools(tools: readonly PhaseTimelineToolDetail[]): {
  concernsByPath: Map<string, LineConcern>
  visibleTools: readonly PhaseTimelineToolDetail[]
} {
  const concernsByPath = new Map<string, LineConcern>()
  const visibleTools: PhaseTimelineToolDetail[] = []
  for (const tool of tools) {
    if (tool.toolName === 'mark_concern_lines') {
      const result = toToolResultPayload(tool)
      const concern = result ? getConcernLinesFromResultCached(result.content) : null
      if (concern) {
        // Last-write-wins: a later call refines the concern set for a path.
        concernsByPath.set(concern.path, concern)
      }
      // Either way, a mark_concern_lines call never renders as its own row.
      continue
    }
    visibleTools.push(tool)
  }
  return { concernsByPath, visibleTools }
}

const FILE_VIEW_TOOLS = new Set(['read', 'write', 'edit'])

function ToolStrip({
  tool,
  concernLines,
}: {
  tool: PhaseTimelineToolDetail
  concernLines?: readonly number[]
}) {
  const projectPath = useActiveProjectPath()
  const pathOrQuery = parseToolPath(tool.toolCall?.arguments)
  const action = getActionLabel(tool.toolName)
  const parsedArgs = useMemo(
    () => parseToolArgs(tool.toolCall?.arguments ?? '{}'),
    [tool.toolCall?.arguments],
  )
  // Title: the tool's target relativized to the open repo, or a short arg
  // summary. Never repeats the tool name (the chip already shows the verb).
  const display = useMemo(() => {
    if (pathOrQuery) {
      const isCommand = tool.toolName === 'bash' || tool.toolName === 'bash_readonly'
      return isCommand ? pathOrQuery : relativeToProject(projectPath, pathOrQuery)
    }
    return summarizeToolTarget(tool.toolName, parsedArgs) || tool.toolName
  }, [pathOrQuery, projectPath, tool.toolName, parsedArgs])
  const result = useMemo(() => toToolResultPayload(tool), [tool])
  const diff = useMemo(
    () => (result ? getToolDiffData(result.content, tool.toolName, parsedArgs) : null),
    [parsedArgs, result, tool.toolName],
  )
  const resultError = useMemo(() => getResultError(result), [result])
  const media = useMemo(() => (result ? getToolMediaOutput(result.content) : null), [result])
  const hasExpandableDetails =
    tool.toolName === 'read' ||
    tool.toolName === 'write' ||
    tool.toolName === 'edit' ||
    diff !== null ||
    !!resultError ||
    !!media
  // read/write/edit default to expanded (the file/diff view is the point of the
  // card). Other tools (ls, grep, bash, ...) stay collapsed until clicked.
  const [expanded, setExpanded] = useState(
    hasExpandableDetails && FILE_VIEW_TOOLS.has(tool.toolName),
  )
  const concernSet = useMemo(
    () => (concernLines?.length ? new Set(concernLines) : undefined),
    [concernLines],
  )
  // For write: show the written content itself as an all-additions file view.
  const writeContent = useMemo(() => {
    if (tool.toolName !== 'write') return null
    const raw = parsedArgs.content
    return typeof raw === 'string' ? raw : null
  }, [parsedArgs.content, tool.toolName])

  return (
    <div className="group">
      <div className="rounded-[14px] border border-border/40 bg-bg-primary/75 p-[1.5px]">
        <div className="rounded-[12px] border border-border/45 bg-bg-secondary/[0.18]">
          <button
            type="button"
            aria-expanded={hasExpandableDetails ? expanded : undefined}
            onClick={() => {
              if (hasExpandableDetails) {
                setExpanded((value) => !value)
              }
            }}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2 text-left font-mono text-[12px] text-text-secondary transition-colors',
              hasExpandableDetails && 'cursor-pointer hover:bg-bg-secondary/35',
              !hasExpandableDetails && 'cursor-default',
            )}
          >
            {action && (
              <span
                className={cn(
                  'px-1.5 py-0.5 rounded-[6px] font-semibold uppercase tracking-[0.08em] text-[10px]',
                  getToolTone(tool.toolName),
                )}
              >
                {action}
              </span>
            )}
            {/* The filename sizes to its content (not flex-1) so the +/- counts sit
                directly beside it rather than being pushed to the far right. */}
            <span className="min-w-0 truncate text-text-primary/88">{display}</span>
            {diff && (
              <span className="flex items-center gap-1.5 text-[11px] font-medium tabular-nums shrink-0">
                {diff.additions > 0 && (
                  <span
                    aria-label={`${String(diff.additions)} lines added`}
                    title={`${String(diff.additions)} lines added`}
                    className="rounded-full bg-success/10 px-1.5 py-0.5 text-success"
                  >
                    +{diff.additions}
                  </span>
                )}
                {diff.deletions > 0 && (
                  <span
                    aria-label={`${String(diff.deletions)} lines removed`}
                    title={`${String(diff.deletions)} lines removed`}
                    className="rounded-full bg-error/10 px-1.5 py-0.5 text-error"
                  >
                    -{diff.deletions}
                  </span>
                )}
              </span>
            )}
            {/* Absorbs the remaining width, keeping the status indicator right-aligned. */}
            <span className="flex-1" />
            {tool.status === 'running' && (
              <span className="animate-pulse text-text-tertiary">...</span>
            )}
          </button>

          {expanded && hasExpandableDetails && (
            // Flush: the code card spans the strip's full width with no
            // horizontal or bottom inset.
            <div>
              <div>
                {media ? (
                  <div className="px-3 pb-3">
                    <ToolMediaPreview output={media} />
                  </div>
                ) : (
                  <>
                    {diff && diff.lines.length > 0 && (
                      <div>
                        <UnifiedDiffView diff={diff} compact path={pathOrQuery} />
                      </div>
                    )}

                    {tool.toolName === 'read' && result && (
                      <div>
                        <ToolResult
                          content={result.content}
                          isError={!!resultError}
                          name={tool.toolName}
                          path={pathOrQuery}
                          concernLines={concernSet}
                        />
                      </div>
                    )}

                    {tool.toolName === 'write' &&
                      writeContent != null &&
                      !(diff && diff.lines.length > 0) && (
                        // The real unified diff (rendered above) is preferred; only
                        // fall back to the drafted content when no diff is available.
                        <div>
                          <FileContentView
                            content={writeContent}
                            variant="additions"
                            maxHeight={READ_VIEW_MAX_HEIGHT_PX}
                            path={pathOrQuery}
                          />
                        </div>
                      )}

                    {tool.toolName === 'edit' &&
                      tool.toolCall &&
                      !(diff && diff.lines.length > 0) && (
                        <div className="px-3 pb-3">
                          <ToolArgs
                            name={tool.toolName}
                            args={parsedArgs}
                            rawArgs={tool.toolCall.arguments}
                            path={pathOrQuery}
                          />
                        </div>
                      )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function isPlanReviewRequest(
  request: PendingUserQuestionRequest | null | undefined,
): request is PendingUserQuestionRequest & { kind: 'plan_review' } {
  return request?.kind === 'plan_review'
}

function PlanReviewActions({
  request,
  onResolveUserQuestion,
}: {
  request: PendingUserQuestionRequest & { kind: 'plan_review' }
  onResolveUserQuestion?: (resolution: {
    request: PendingUserQuestionRequest
    answer: string
  }) => Promise<void>
}) {
  const [busyDecision, setBusyDecision] = useState<'approve' | 'edit' | 'reject' | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editFeedback, setEditFeedback] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setBusyDecision(null)
    setEditMode(false)
    setEditFeedback('')
    setError(null)
  }, [request.phase, request.question])

  async function submit(answer: string, decision: 'approve' | 'edit' | 'reject') {
    if (!onResolveUserQuestion) return
    setBusyDecision(decision)
    setError(null)
    try {
      await onResolveUserQuestion({ request, answer })
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError))
      setBusyDecision(null)
    }
  }

  return (
    <div className="mt-3 rounded-[12px] border border-border/35 bg-bg-primary/55 p-3">
      <div className="text-[14px] font-medium leading-[1.5] text-text-primary">Review Plan</div>
      <div className="mt-1 text-[14px] leading-[1.5] text-text-secondary">
        Approve to start implementation, edit to regenerate the plan, or reject to stop here.
      </div>

      {editMode ? (
        <div className="mt-3 flex flex-col gap-3">
          <Textarea
            value={editFeedback}
            onChange={(event) => setEditFeedback(event.target.value)}
            placeholder={request.placeholder ?? 'Describe what should change in the plan'}
            className="min-h-[88px]"
            resize="vertical"
            disabled={busyDecision !== null}
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              radius="full"
              disabled={busyDecision !== null}
              onClick={() => {
                setEditMode(false)
                setError(null)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
              size="sm"
              radius="full"
              disabled={busyDecision !== null}
              onClick={() => {
                const feedback = editFeedback.trim()
                if (!feedback) {
                  setError('Describe what should change in the plan.')
                  return
                }
                void submit(`__PLAN_EDIT__ ${feedback}`, 'edit')
              }}
            >
              {busyDecision === 'edit' ? 'Updating plan...' : 'Submit edit'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            radius="full"
            disabled={busyDecision !== null}
            onClick={() => {
              void submit('__PLAN_APPROVE__', 'approve')
            }}
          >
            {busyDecision === 'approve' ? 'Approving...' : 'Approve'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            radius="full"
            disabled={busyDecision !== null}
            onClick={() => {
              setEditMode(true)
              setError(null)
            }}
          >
            Edit Plan
          </Button>
          <Button
            variant="ghost"
            size="sm"
            radius="full"
            disabled={busyDecision !== null}
            onClick={() => {
              void submit('__PLAN_REJECT__', 'reject')
            }}
          >
            {busyDecision === 'reject' ? 'Rejecting...' : 'Reject'}
          </Button>
        </div>
      )}

      {error ? <div className="mt-2 text-[14px] leading-[1.5] text-error">{error}</div> : null}
    </div>
  )
}

function PlanList({
  planJson,
  pendingPlanReviewRequest,
  onResolveUserQuestion,
}: {
  planJson: unknown
  pendingPlanReviewRequest?: (PendingUserQuestionRequest & { kind: 'plan_review' }) | null
  onResolveUserQuestion?: (resolution: {
    request: PendingUserQuestionRequest
    answer: string
  }) => Promise<void>
}) {
  if (!Array.isArray(planJson)) return null
  const visibleItems = planJson.filter((item) => item && typeof item === 'object')
  if (visibleItems.length === 0) return null
  const showNumbers = visibleItems.length > 1

  return (
    <div className="rounded-[16px] border border-border/40 bg-bg-primary/75 p-[1.5px]">
      <div className="rounded-[14px] border border-border/45 bg-bg-secondary/[0.18] px-4 py-3.5">
        <div className="mb-2 text-[14px] font-medium leading-[1.5] text-text-primary">
          Execution Plan
        </div>
        <div className="flex flex-col gap-3">
          {planJson.map((item: any, i) => {
            if (!item || typeof item !== 'object') return null
            return (
              <div key={item.id || i} className="flex flex-col gap-1">
                <div
                  className={cn(
                    'flex items-start text-[14px] leading-[1.5] text-text-primary',
                    showNumbers ? 'gap-2' : 'gap-0',
                  )}
                >
                  {showNumbers ? (
                    <span className="w-4 shrink-0 text-text-tertiary">{i + 1}.</span>
                  ) : null}
                  <span className="min-w-0 flex-1">
                    {String(item.title || item.summary || 'Step')}
                  </span>
                </div>
                {item.summary && item.summary !== item.title && (
                  <MarkdownBlock
                    content={String(item.summary)}
                    className={cn(
                      'text-text-secondary [&_p]:text-[14px] [&_p]:leading-[1.5] [&_p]:text-text-secondary [&_ol]:text-[14px] [&_ol]:leading-[1.5] [&_ol]:text-text-secondary [&_ul]:text-[14px] [&_ul]:leading-[1.5] [&_ul]:text-text-secondary',
                      showNumbers && 'pl-6',
                    )}
                  />
                )}
                {Array.isArray(item.files) && item.files.length > 0 && (
                  <div
                    className={cn(
                      'flex flex-wrap items-center gap-1.5 pt-0.5 text-[14px] leading-[1.5] text-text-tertiary',
                      showNumbers && 'pl-6',
                    )}
                  >
                    <span className="mr-1">Files</span>
                    {item.files.map((file: unknown, index: number) =>
                      typeof file === 'string' ? (
                        <code
                          key={`${String(item.id || i)}-file-${String(index)}`}
                          className="rounded-sm bg-bg-secondary/70 px-1.5 py-0.5 font-mono text-[14px] leading-[1.5] text-text-secondary"
                        >
                          {file}
                        </code>
                      ) : null,
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {pendingPlanReviewRequest ? (
          <PlanReviewActions
            request={pendingPlanReviewRequest}
            onResolveUserQuestion={onResolveUserQuestion}
          />
        ) : null}
      </div>
    </div>
  )
}

/** Multi-plan output (PLANS_JSON): several plans run in an explicit execution
 *  order, each owning ordered tasks. Renders plans in execution order. */
function PlanSetList({ planSet }: { planSet: unknown }) {
  if (!planSet || typeof planSet !== 'object') return null
  const plans = (planSet as { plans?: unknown }).plans
  if (!Array.isArray(plans) || plans.length === 0) return null
  const orderRaw = (planSet as { executionOrder?: unknown }).executionOrder
  const order = Array.isArray(orderRaw)
    ? orderRaw.filter((id): id is string => typeof id === 'string')
    : []
  const byId = new Map<string, any>()
  for (const plan of plans) {
    if (plan && typeof plan === 'object' && typeof (plan as any).id === 'string')
      byId.set((plan as any).id, plan)
  }
  const ordered = order.length
    ? [
        ...order.map((id) => byId.get(id)).filter(Boolean),
        ...plans.filter((p: any) => !order.includes(p?.id)),
      ]
    : plans

  return (
    <div className="rounded-[16px] border border-border/40 bg-bg-primary/75 p-[1.5px]">
      <div className="rounded-[14px] border border-border/45 bg-bg-secondary/[0.18] px-4 py-3.5">
        <div className="mb-2 text-[14px] font-medium leading-[1.5] text-text-primary">
          Execution Plan{ordered.length > 1 ? ` · ${ordered.length} plans` : ''}
        </div>
        <div className="flex flex-col gap-4">
          {ordered.map((plan: any, planIndex: number) => {
            if (!plan || typeof plan !== 'object') return null
            const tasks = Array.isArray(plan.tasks) ? plan.tasks : []
            return (
              <div key={plan.id || planIndex} className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[14px] font-medium leading-[1.5] text-text-primary">
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-bg-secondary/70 px-1.5 text-[12px] text-text-tertiary">
                    {planIndex + 1}
                  </span>
                  <span className="min-w-0 flex-1">{String(plan.title || plan.id || 'Plan')}</span>
                  {typeof plan.repo === 'string' && plan.repo ? (
                    <code className="rounded-sm bg-bg-secondary/70 px-1.5 py-0.5 font-mono text-[12px] text-text-secondary">
                      {plan.repo}
                    </code>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2 pl-7">
                  {tasks.map((task: any, taskIndex: number) => {
                    if (!task || typeof task !== 'object') return null
                    return (
                      <div key={task.id || taskIndex} className="flex flex-col gap-1">
                        <div className="flex items-start gap-2 text-[14px] leading-[1.5] text-text-primary">
                          <span className="w-4 shrink-0 text-text-tertiary">{taskIndex + 1}.</span>
                          <span className="min-w-0 flex-1">
                            {String(task.title || task.summary || 'Step')}
                          </span>
                          {typeof task.complexity === 'string' ? (
                            <span className="shrink-0 rounded-sm bg-bg-secondary/70 px-1.5 py-0.5 text-[12px] text-text-tertiary">
                              {task.complexity}
                            </span>
                          ) : null}
                        </div>
                        {task.summary && task.summary !== task.title ? (
                          <MarkdownBlock
                            content={String(task.summary)}
                            className="pl-6 text-text-secondary [&_p]:text-[14px] [&_p]:leading-[1.5] [&_p]:text-text-secondary"
                          />
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Perfect's tech-stack QA plan: the checks it derived + ran, with pass/fail. */
function QaPlanList({ qaPlan }: { qaPlan: unknown }) {
  if (!qaPlan || typeof qaPlan !== 'object') return null
  const checks = (qaPlan as { checks?: unknown }).checks
  if (!Array.isArray(checks) || checks.length === 0) return null
  const stack = (qaPlan as { stack?: unknown }).stack

  return (
    <div className="rounded-[16px] border border-border/40 bg-bg-primary/75 p-[1.5px]">
      <div className="rounded-[14px] border border-border/45 bg-bg-secondary/[0.18] px-4 py-3.5">
        <div className="mb-2 text-[14px] font-medium leading-[1.5] text-text-primary">
          QA Plan{typeof stack === 'string' && stack ? ` · ${stack}` : ''}
        </div>
        <div className="flex flex-col gap-2">
          {checks.map((check: any, index: number) => {
            if (!check || typeof check !== 'object') return null
            const passed = check.passed === true
            const failed = check.passed === false
            return (
              <div key={check.id || index} className="flex flex-col gap-0.5">
                <div className="flex items-start gap-2 text-[14px] leading-[1.5] text-text-primary">
                  <span className="w-4 shrink-0" aria-hidden>
                    {passed ? '✓' : failed ? '✗' : '•'}
                  </span>
                  <span className="min-w-0 flex-1">{String(check.description || 'Check')}</span>
                  {typeof check.method === 'string' ? (
                    <span className="shrink-0 rounded-sm bg-bg-secondary/70 px-1.5 py-0.5 text-[12px] text-text-tertiary">
                      {check.method}
                    </span>
                  ) : null}
                </div>
                {typeof check.evidence === 'string' && check.evidence ? (
                  <span className="pl-6 text-[13px] leading-[1.5] text-text-tertiary">
                    {check.evidence}
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function PendingQuestionCard({
  request,
  onResolveUserQuestion,
}: {
  request: PendingUserQuestionRequest | null | undefined
  onResolveUserQuestion?: (resolution: {
    request: PendingUserQuestionRequest
    answer: string
  }) => Promise<void>
}) {
  if (!request) return null
  return (
    <UserQuestionCard
      request={request}
      onSubmit={async (answer) => {
        if (!onResolveUserQuestion) return
        await onResolveUserQuestion({ request, answer })
      }}
      helperText="Answer here to resume this plan."
    />
  )
}

export function PhaseTimelineCard({
  row,
  pendingUserQuestionRequest,
  onResolveUserQuestion,
}: PhaseTimelineCardProps) {
  const phase = row.phase
  const livePendingQuestion =
    pendingUserQuestionRequest?.phase === phase.id ? pendingUserQuestionRequest : null
  const effectivePendingQuestion = phase.pendingUserQuestion ?? livePendingQuestion ?? undefined
  // A plan_review always gets the inline Approve / Edit / Reject card (with its own
  // in-card comment box), never the plain UserQuestionCard text input. Don't gate
  // this on `phase.planJson` being present: the live synthetic pending-question row
  // and planSet-based plans have no `planJson`, and gating on it would drop the
  // review to a bare input box.
  const pendingPlanReview = isPlanReviewRequest(effectivePendingQuestion)
    ? effectivePendingQuestion
    : null
  const pendingClarification = pendingPlanReview ? null : effectivePendingQuestion
  const summaryContent = phase.summary ?? fallbackPhaseSummary(phase)

  const { concernsByPath, visibleTools } = useMemo(
    () => collectConcernsAndVisibleTools(phase.tools),
    [phase.tools],
  )

  return (
    <section
      className="flex flex-col gap-2.5"
      data-phase-card={phase.id}
      aria-label={`${phase.label} phase`}
    >
      <div className="flex items-center gap-2">
        <h3
          className={cn(
            'text-[14px] font-semibold text-text-primary',
            phase.status === 'running' && 'animate-pulse',
          )}
        >
          {statusLabel(phase)}
        </h3>
      </div>

      {visibleTools.length > 0 && (
        <div className="flex flex-col gap-3">
          {visibleTools.map((tool) => {
            const toolPath = resolveToolPath(tool)
            const concern = toolPath ? concernsByPath.get(toolPath) : undefined
            return <ToolStrip key={tool.toolCallId} tool={tool} concernLines={concern?.lines} />
          })}
        </div>
      )}

      {phase.planSet ? (
        <div>
          <PlanSetList planSet={phase.planSet} />
        </div>
      ) : phase.planJson ? (
        <div>
          <PlanList
            planJson={phase.planJson}
            pendingPlanReviewRequest={pendingPlanReview}
            onResolveUserQuestion={onResolveUserQuestion}
          />
        </div>
      ) : null}

      {phase.qaPlan ? (
        <div>
          <QaPlanList qaPlan={phase.qaPlan} />
        </div>
      ) : null}

      {/* When planJson is present the review actions render inside PlanList next to
          the plan. Otherwise (live pending-question row / planSet plans) render the
          same inline Approve / Edit / Reject card here so the review never degrades
          to a plain text input. */}
      {pendingPlanReview && !phase.planJson ? (
        <PlanReviewActions
          request={pendingPlanReview}
          onResolveUserQuestion={onResolveUserQuestion}
        />
      ) : null}

      <PendingQuestionCard
        request={pendingClarification}
        onResolveUserQuestion={onResolveUserQuestion}
      />

      {summaryContent && (
        <MarkdownBlock
          content={summaryContent}
          className="[&_p]:text-[14px] [&_p]:leading-[1.65] [&_ol]:text-[14px] [&_ol]:leading-[1.65] [&_ul]:text-[14px] [&_ul]:leading-[1.65]"
        />
      )}
    </section>
  )
}
