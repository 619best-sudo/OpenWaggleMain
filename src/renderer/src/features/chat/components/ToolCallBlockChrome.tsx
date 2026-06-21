import type { ReactNode } from 'react'
import {
  Check,
  ChevronRight,
  FileText,
  FolderOpen,
  GitBranch,
  Loader2,
  PencilLine,
  Search,
  Sparkles,
  SquareTerminal,
  Trash2,
  Wrench,
  X,
} from 'lucide-react'
import type { ToolCallResultPayload } from '@/features/chat/lib/tool-call-block'
import { cn } from '@/shared/lib/cn'
import { formatDuration } from '@/shared/lib/format'
import { Button } from '@/shared/ui/Button'
import type { ToolCallViewModel } from './ToolCallBlock'
import { UnifiedDiffView } from './ToolCallBlockParts'

interface ToolCallHeaderProps {
  readonly expanded: boolean
  readonly duration: number
  readonly result: ToolCallResultPayload | undefined
  readonly view: ToolCallViewModel
  readonly onBranchFromMessage?: (messageId: string) => void
  readonly onToggleExpanded: () => void
}

export function ToolCallHeader({
  expanded,
  duration,
  result,
  view,
  onBranchFromMessage,
  onToggleExpanded,
}: ToolCallHeaderProps) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/25 bg-code-card px-2 py-0.5 transition-colors hover:bg-code-card-hover">
      <Button
        variant="unstyled"
        type="button"
        aria-expanded={expanded}
        aria-label={`${view.actionText} — ${expanded ? 'collapse' : 'expand'} details`}
        onClick={onToggleExpanded}
        className="flex min-w-0 flex-1 items-center gap-2 text-[13px]"
      >
        <ToolStatusIcon view={view} result={result} />
        <ToolGlyph view={view} />
        <ToolActionLabel view={view} result={result} />
        <ToolDiffSummary view={view} />
        {duration > 0 && !view.isRunning && (
          <span className="shrink-0 text-[12px] text-text-secondary">{formatDuration(duration)}</span>
        )}
        <ChevronRight
          className={cn(
            'ml-auto size-3 shrink-0 text-text-secondary transition-transform',
            'invisible group-hover/tool:visible',
            expanded && 'visible rotate-90',
          )}
        />
      </Button>
      <BranchFromToolButton view={view} onBranchFromMessage={onBranchFromMessage} />
    </div>
  )
}

function ToolGlyph({ view }: { readonly view: ToolCallViewModel }) {
  const Icon = resolveToolIcon(view.toolName)

  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded bg-bg-secondary/70 text-text-primary/85">
      <Icon className="size-3.5" />
    </span>
  )
}

function resolveToolIcon(name: string) {
  switch (name) {
    case 'bash':
    case 'RunCommand':
      return SquareTerminal
    case 'read':
    case 'WebFetch':
      return FileText
    case 'write':
    case 'edit':
    case 'apply_patch':
      return PencilLine
    case 'glob':
    case 'LS':
      return FolderOpen
    case 'grep':
    case 'SearchCodebase':
    case 'WebSearch':
      return Search
    case 'DeleteFile':
      return Trash2
    case 'Skill':
      return Sparkles
    default:
      return Wrench
  }
}

function ToolStatusIcon({
  view,
  result,
}: {
  readonly view: ToolCallViewModel
  readonly result: ToolCallResultPayload | undefined
}) {
  if (view.isRunning) {
    return (
      <Loader2
        role="status"
        aria-label="Running"
        className="size-3.5 shrink-0 animate-spin text-text-secondary"
      />
    )
  }
  if (view.hasConcreteResult && result && !view.isError) {
    return <Check className="size-3.5 shrink-0 text-text-secondary" />
  }
  if (result && view.isError) {
    return <X className="size-3.5 text-error/80 shrink-0" />
  }
  return null
}

function ToolActionLabel({
  view,
  result,
}: {
  readonly view: ToolCallViewModel
  readonly result: ToolCallResultPayload | undefined
}) {
  return (
    <span
      className={cn(
        'truncate',
        view.isRunning && 'text-text-primary/82',
        view.hasConcreteResult && result && !view.isError && 'text-text-primary/82',
        result && view.isError && 'text-error/80',
      )}
    >
      {renderHighlightedActionText(view)}
    </span>
  )
}

function renderHighlightedActionText(view: ToolCallViewModel): ReactNode {
  if (view.isError) {
    return view.actionText
  }

  if (view.toolName === 'bash') {
    const commandMatch = view.actionText.match(/`[^`]+`/)
    if (commandMatch) {
      return highlightSegment(view.actionText, commandMatch[0], 'font-mono text-warning')
    }
  }

  if (view.path) {
    return highlightSegment(view.actionText, view.path, 'font-medium text-info')
  }

  return view.actionText
}

function highlightSegment(text: string, segment: string, className: string): ReactNode {
  const start = text.indexOf(segment)
  if (start < 0) {
    return text
  }

  const end = start + segment.length
  return (
    <>
      {text.slice(0, start)}
      <span className={className}>{segment}</span>
      {text.slice(end)}
    </>
  )
}

function ToolDiffSummary({ view }: { readonly view: ToolCallViewModel }) {
  if (!view.diff) {
    return null
  }
  return (
    <span className="flex shrink-0 items-center gap-2 text-[12px]">
      {view.diff.additions > 0 && (
        <span
          aria-label={`${String(view.diff.additions)} lines added`}
          title={`${String(view.diff.additions)} lines added`}
          className="rounded-full bg-success/10 px-1.5 py-0.5 font-medium tabular-nums text-success"
        >
          +{view.diff.additions}
        </span>
      )}
      {view.diff.deletions > 0 && (
        <span
          aria-label={`${String(view.diff.deletions)} lines removed`}
          title={`${String(view.diff.deletions)} lines removed`}
          className="rounded-full bg-error/10 px-1.5 py-0.5 font-medium tabular-nums text-error"
        >
          -{view.diff.deletions}
        </span>
      )}
    </span>
  )
}

function BranchFromToolButton({
  view,
  onBranchFromMessage,
}: {
  readonly view: ToolCallViewModel
  readonly onBranchFromMessage?: (messageId: string) => void
}) {
  if (!view.branchSourceMessageId || !onBranchFromMessage) {
    return null
  }
  return (
    <Button
      variant="unstyled"
      type="button"
      title="Branch from tool result"
      onClick={() => onBranchFromMessage(view.branchSourceMessageId ?? '')}
      className="opacity-0 text-text-secondary transition-opacity hover:text-text-primary group-hover/tool:opacity-100 focus:opacity-100"
    >
      <GitBranch className="size-3.5" />
    </Button>
  )
}

export function CollapsedToolPreview({
  view,
  expanded,
}: {
  readonly view: ToolCallViewModel
  readonly expanded: boolean
}) {
  if (expanded) {
    return null
  }
  return (
    <>
      {view.inlineDiffVisible && view.diff && (
        <div className="mt-1">
          <UnifiedDiffView diff={view.diff} compact />
        </div>
      )}
      {view.liveOutputPreview && <ToolPreview text={view.liveOutputPreview} tone="muted" />}
      {view.failedOutputPreview && <ToolPreview text={view.failedOutputPreview} tone="error" />}
    </>
  )
}

function ToolPreview({ text, tone }: { readonly text: string; readonly tone: 'muted' | 'error' }) {
  return (
    <pre
      className={cn(
        'mt-1 overflow-hidden rounded-md px-3 py-2 text-[12px] font-mono whitespace-pre-wrap break-words',
        tone === 'error'
          ? 'max-h-[160px] border border-error/15 bg-error/5 text-error'
          : 'max-h-[120px] border border-border/10 bg-code-card text-text-primary/78',
      )}
    >
      {text}
    </pre>
  )
}
