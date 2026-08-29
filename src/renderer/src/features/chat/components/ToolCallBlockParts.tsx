import type { JsonObject } from '@shared/types/json'
import { AlertCircle, Clipboard } from 'lucide-react'
import { useMemo } from 'react'
import {
  buildFencedCodeMarkdown,
  FILE_CONTENT_ARG_KEYS,
  getToolResultParts,
  getToolResultText,
  getUnifiedDiffLineClassName,
  inferLanguageFromPath,
  JSON_STRINGIFY_SPACES,
  LONG_ARGUMENT_MAX_HEIGHT_PX,
  LONG_ARGUMENT_PREVIEW_CHARS,
  type NumberedLine,
  READ_VIEW_MAX_HEIGHT_PX,
  READ_VIEW_MAX_LINES,
  RESULT_MAX_HEIGHT_PX,
  shouldHighlightCode,
  splitNumberedFileLines,
  type UnifiedDiffData,
  type UnifiedDiffLine,
} from '@/features/chat/lib/tool-call-block'
import {
  type HighlightedToken,
  useHighlightedLines,
} from '@/features/chat/lib/use-highlighted-lines'
import { useCopyToClipboard } from '@/shared/hooks/useCopyToClipboard'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { FileContentView } from './FileContentView'
import { ReadFileView } from './ReadFileView'
import { StreamingText } from './StreamingText'

export function CopyButton({ label, value }: { readonly label: string; readonly value: string }) {
  const { copied, copy } = useCopyToClipboard()
  if (!value) {
    return null
  }

  return (
    <Button
      variant="unstyled"
      type="button"
      className="inline-flex items-center gap-1 rounded border-2 border-home-border px-1.5 py-0.5 text-[10px] text-[color:var(--color-code-card-muted-text)] transition-colors hover:bg-bg-hover hover:text-[color:var(--color-code-card-label-text)]"
      onClick={(event) => {
        event.stopPropagation()
        copy(value)
      }}
    >
      <Clipboard className="size-3" />
      {copied ? 'Copied' : label}
    </Button>
  )
}

export function ToolArgs({
  name,
  args,
  rawArgs,
  path,
  hiddenArgKeys,
}: {
  name: string
  args: JsonObject
  rawArgs: string
  path: string | null
  hiddenArgKeys?: ReadonlySet<string>
}) {
  if (name === 'bash' && typeof args.command === 'string') {
    return (
      <div className="home-panel-frame-soft rounded-md bg-code-card px-3 py-2 font-mono text-[12px] text-[color:var(--color-code-card-text)]">
        <span className="select-none text-[color:var(--color-code-card-muted-text)]">$ </span>
        {args.command}
      </div>
    )
  }

  const entries = Object.entries(args).filter(([key]) => !hiddenArgKeys?.has(key))
  if (entries.length === 0) {
    return (
      <pre className="home-panel-frame-soft overflow-x-auto rounded-md bg-code-card p-2 font-mono text-[12px] text-[color:var(--color-code-card-text)]">
        {rawArgs || '{}'}
      </pre>
    )
  }

  return (
    <div className="space-y-1">
      {entries.map(([key, value]) => (
        <ToolArgValue key={key} name={key} value={value} path={path} />
      ))}
    </div>
  )
}

function ToolArgValue({
  name,
  value,
  path,
}: {
  name: string
  value: unknown
  path: string | null
}) {
  const display =
    typeof value === 'string' ? value : JSON.stringify(value, null, JSON_STRINGIFY_SPACES)
  const isLong = typeof display === 'string' && display.length > LONG_ARGUMENT_PREVIEW_CHARS
  const isPathLikeKey = name === 'path' || name.endsWith('Path')

  return (
    <div>
      <span className="text-[12px] text-[color:var(--color-code-card-label-text)]">{name}: </span>
      {isLong && typeof value === 'string' && FILE_CONTENT_ARG_KEYS.has(name) ? (
        <HighlightedFileContent
          content={value}
          language={inferLanguageFromPath(path)}
          maxHeight={LONG_ARGUMENT_MAX_HEIGHT_PX}
        />
      ) : isLong ? (
        <pre
          className="home-panel-frame-soft mt-0.5 overflow-x-auto overflow-y-auto rounded-md bg-code-card p-2 font-mono text-[12px] text-[color:var(--color-code-card-text)]"
          style={{ maxHeight: LONG_ARGUMENT_MAX_HEIGHT_PX }}
        >
          {display}
        </pre>
      ) : (
        <span
          className={cn(
            'text-[12px] font-mono text-[color:var(--color-code-card-text)]',
            isPathLikeKey && 'font-medium text-[color:var(--color-tool-call-file-text)]',
          )}
        >
          {display}
        </span>
      )}
    </div>
  )
}

function HighlightedFileContent({
  content,
  language,
  maxHeight,
}: {
  content: string
  language: string | undefined
  maxHeight: number
}) {
  if (!shouldHighlightCode(content)) {
    return (
      <div>
        <div className="mb-1 text-[11px] text-[color:var(--color-code-card-muted-text)]">
          Large file preview shown without syntax highlighting to keep the UI responsive.
        </div>
        <pre
          className="home-panel-frame-soft overflow-x-auto overflow-y-auto rounded-md bg-code-card p-2 font-mono text-[12px] text-[color:var(--color-code-card-text)] whitespace-pre-wrap break-words"
          style={{ maxHeight }}
        >
          {content}
        </pre>
      </div>
    )
  }

  return (
    <div className="tool-result-code overflow-y-auto" style={{ maxHeight }}>
      <StreamingText
        text={buildFencedCodeMarkdown(content, language)}
        className="[&_pre]:max-h-none [&_pre]:text-[12px] [&_pre]:leading-relaxed"
      />
    </div>
  )
}

export function ToolResult({
  content,
  isError,
  name,
  path,
  concernLines,
}: {
  content: unknown
  isError: boolean
  name: string
  path: string | null
  concernLines?: ReadonlySet<number>
}) {
  const displayContent = getToolResultText(content)

  if (isError) {
    return (
      <div className="rounded-md border-2 border-error/20 bg-error/5 px-3 py-2">
        <div className="flex items-start gap-2">
          <AlertCircle className="size-3.5 text-error shrink-0 mt-0.5" />
          <pre className="text-[12px] font-mono text-error whitespace-pre-wrap break-words flex-1">
            {displayContent}
          </pre>
        </div>
      </div>
    )
  }

  if (name === 'read' && displayContent) {
    // The harness concatenates the numbered bytes and its reasoning about them
    // into one block. Keep them apart: bytes in the numbered viewer, reasoning
    // behind a "Show reasoning" badge that expands prose below the file.
    const parts = getToolResultParts(content)
    return (
      <ReadFileView
        body={parts.body}
        reasoning={parts.notes}
        concernSet={concernLines}
        maxHeight={READ_VIEW_MAX_HEIGHT_PX}
        path={path}
      />
    )
  }

  return (
    <pre
      className="home-panel-frame-soft overflow-x-auto overflow-y-auto rounded-md bg-code-card p-2 font-mono text-[12px] text-[color:var(--color-code-card-text)] whitespace-pre-wrap break-words"
      style={{ maxHeight: RESULT_MAX_HEIGHT_PX }}
    >
      {displayContent}
    </pre>
  )
}

// The code/diff views live in their own module (they're a cohesive unit and this
// file was over its line budget). Re-exported so existing importers are unchanged.
export { FileContentView }
export { UnifiedDiffView } from './UnifiedDiffView'
