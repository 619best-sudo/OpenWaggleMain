/**
 * Unified diff view with syntax-highlighted code, a pinned line-number gutter
 * and +/- marks. Renders flush inside a tool strip: only a top divider.
 */
import { useMemo } from 'react'
import {
  inferLanguageFromPath,
  type UnifiedDiffData,
  type UnifiedDiffLine,
} from '@/features/chat/lib/tool-call-block'
import { useHighlightedLines } from '@/features/chat/lib/use-highlighted-lines'
import { cn } from '@/shared/lib/cn'
import { CodeLineTokens } from './CodeLineTokens'

/** Minimum gutter width, in characters, so narrow diffs still align. */
const MIN_GUTTER_CHARS = 2

/**
 * Is this meta line the `--- a/file` / `+++ b/file` header? Those repeat the file
 * path that the tool strip's own header already shows, so they're pure noise in
 * this context and are dropped.
 */
function isDiffFileHeaderLine(content: string) {
  return content.startsWith('---') || content.startsWith('+++')
}

/** A diff line paired with the new-file line number to show in the gutter. */
interface DiffRow {
  readonly line: UnifiedDiffLine
  /** null for hunk headers and removed lines (absent from the new file). */
  readonly lineNumber: number | null
}

/**
 * Unified diff with syntax-highlighted code, a line-number gutter and +/- marks.
 *
 * Presentation rules:
 * - `--- /path` / `+++ /path` headers are dropped (the strip header names the file).
 * - `@@` hunk headers only render when there are 2+ hunks, where they actually
 *   separate regions. A single-hunk diff (e.g. a whole-file rewrite) gains nothing
 *   from `@@ -1,426 +1,426 @@`.
 * - The +/- counts live in the strip header, so there's no header row here.
 */
export function UnifiedDiffView({
  diff,
  compact = false,
  path,
}: {
  readonly diff: UnifiedDiffData
  readonly compact?: boolean
  /** File path, used to infer the language for syntax highlighting. */
  readonly path?: string | null
}) {
  const rows: readonly DiffRow[] = useMemo(() => {
    const hunkCount = diff.lines.filter(
      (line) => line.type === 'meta' && line.content.startsWith('@@'),
    ).length
    // Keep old/new line numbers in step with the hunk headers so the gutter shows
    // real file line numbers rather than a running row index.
    let newLineNumber = 0
    return diff.lines.flatMap((line): DiffRow[] => {
      if (line.type === 'meta') {
        if (isDiffFileHeaderLine(line.content)) return []
        const hunkStart = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(line.content)
        if (hunkStart?.[1]) newLineNumber = Number(hunkStart[1])
        // A lone hunk header carries no navigational value — drop it.
        return hunkCount > 1 ? [{ line, lineNumber: null }] : []
      }
      // Removed lines don't exist in the new file, so they get no new-file number.
      if (line.type === 'remove') return [{ line, lineNumber: null }]
      const lineNumber = newLineNumber
      newLineNumber += 1
      return [{ line, lineNumber }]
    })
  }, [diff.lines])

  // Tokenize with the +/- markers stripped, one input line per rendered row, so
  // tokens stay aligned. Hunk lines highlight together, preserving grammar context.
  const codeText = useMemo(
    () => rows.map(({ line }) => (line.type === 'meta' ? '' : line.content.slice(1))).join('\n'),
    [rows],
  )
  const highlighted = useHighlightedLines(codeText, inferLanguageFromPath(path ?? null))
  const gutterWidth = Math.max(
    MIN_GUTTER_CHARS,
    String(rows.reduce((max, row) => Math.max(max, row.lineNumber ?? 0), 0)).length,
  )

  return (
    <div
      className={cn(
        'diff-scroll overflow-auto border-t border-code-view-border bg-code-view-bg font-mono text-[12.5px] leading-[1.65]',
        compact && 'max-h-[320px]',
      )}
    >
      <div className="min-w-full w-max">
        {rows.map(({ line, lineNumber }, index) => {
          if (line.type === 'meta') {
            return (
              <div
                key={`${String(index)}-hunk`}
                className="whitespace-pre bg-code-view-gutter-bg px-3 py-0.5 text-code-view-gutter-text"
              >
                {line.content}
              </div>
            )
          }
          return (
            <div
              key={`${String(index)}-${line.type}`}
              className={cn(
                'flex whitespace-pre border-l-[3px]',
                // Bold left accent + saturated wash: an added/removed row reads as
                // green/red instantly, while the code keeps its syntax colours.
                line.type === 'add' && 'border-l-code-view-add-accent bg-code-view-add-bg',
                line.type === 'remove' && 'border-l-code-view-remove-accent bg-code-view-remove-bg',
                line.type === 'context' && 'border-l-transparent',
              )}
            >
              {/* Gutter: its own pinned column with its own background. */}
              <span
                className={cn(
                  'sticky left-0 z-10 shrink-0 select-none border-r border-code-view-border bg-code-view-gutter-bg px-2.5 text-right tabular-nums',
                  line.type === 'add' && 'font-semibold text-code-view-add-text',
                  line.type === 'remove' && 'font-semibold text-code-view-remove-text',
                  line.type === 'context' && 'text-code-view-gutter-text',
                )}
                style={{ minWidth: `calc(${String(gutterWidth)}ch + 1.25rem)` }}
                aria-hidden
              >
                {lineNumber ?? ''}
              </span>
              {/* The +/- mark keeps the row's semantic colour. */}
              <span
                className={cn(
                  'w-4 shrink-0 select-none pl-2 text-center font-bold',
                  line.type === 'add' && 'text-code-view-add-text',
                  line.type === 'remove' && 'text-code-view-remove-text',
                  line.type === 'context' && 'text-code-view-gutter-text',
                )}
              >
                {line.type === 'context' ? '' : line.content.slice(0, 1)}
              </span>
              {/* `font-semibold`: at 12.5px, normal-weight mono on a dark surface
                  reads washed out — the weight is what makes the syntax colours
                  land. Applied to the code cell only, so the gutter keeps its own
                  weights. */}
              <span className="pr-4 font-semibold text-[color:var(--color-code-card-text)]">
                <CodeLineTokens tokens={highlighted?.[index]} fallback={line.content.slice(1)} />
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
