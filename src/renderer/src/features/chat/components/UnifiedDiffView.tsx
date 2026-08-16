/**
 * Unified diff view with syntax-highlighted code, a pinned line-number gutter
 * and +/- marks. Renders flush inside a tool strip: only a top divider.
 */
import { memo, useMemo } from 'react'
import {
  inferLanguageFromPath,
  type UnifiedDiffData,
  type UnifiedDiffLine,
} from '@/features/chat/lib/tool-call-block'
import { useHighlightedLines } from '@/features/chat/lib/use-highlighted-lines'
import { useWindowedRows } from '@/features/chat/lib/use-windowed-rows'
import { cn } from '@/shared/lib/cn'
import { CodeLineTokens } from './CodeLineTokens'

/** Minimum gutter width, in characters, so narrow diffs still align. */
const MIN_GUTTER_CHARS = 2
/**
 * Row height in px, applied as an explicit `lineHeight` below. Windowing maps a
 * scroll offset to a row index, so every row must be exactly this tall — which
 * is also why the hunk-header row carries no extra vertical padding.
 */
const LINE_HEIGHT_PX = 20.625
/** Height of the compact diff viewport, matching `max-h-[320px]` below. */
const COMPACT_VIEWPORT_PX = 320
/** Gutter (1.25) + mark column (1.5) + code-cell padding (1), in rem. */
const ROW_PADDING_REM = 3.75

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
function UnifiedDiffViewImpl({
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

  const gutterWidth = Math.max(
    MIN_GUTTER_CHARS,
    String(rows.reduce((max, row) => Math.max(max, row.lineNumber ?? 0), 0)).length,
  )

  // Windowing — see useWindowedRows. A whole-file `write`/`edit` produces a diff
  // with a row per line of the file, each carrying a sticky gutter.
  const { scrollRef, onScroll, firstRow, lastRow, topSpacerPx, bottomSpacerPx } = useWindowedRows(
    rows.length,
    LINE_HEIGHT_PX,
    COMPACT_VIEWPORT_PX,
  )
  // Taken over ALL rows so the horizontal scroll extent does not change as rows
  // window in and out; the font is monospace, so characters map to `ch` exactly.
  const longestRowChars = useMemo(
    () => rows.reduce((widest, row) => Math.max(widest, row.line.content.length), 0),
    [rows],
  )
  // Windowing needs a scrolling viewport to read an offset from. Without
  // `compact` this container has no max height, so it never scrolls and
  // `scrollTop` stays 0 — windowing would then hide every row past the first
  // screenful with no way to reach them. Render the lot in that case.
  const windowed = compact
  const visibleRows = windowed ? rows.slice(firstRow, lastRow) : rows
  const firstVisibleRowIndex = windowed ? firstRow : 0

  // Tokenize with the +/- markers stripped, one input line per RENDERED row, so
  // tokens stay aligned. Only the rendered window is tokenized: `codeToTokens`
  // is synchronous and a whole-file diff cost hundreds of ms on expand.
  const windowCodeText = useMemo(
    () =>
      visibleRows.map(({ line }) => (line.type === 'meta' ? '' : line.content.slice(1))).join('\n'),
    [visibleRows],
  )
  const highlighted = useHighlightedLines(windowCodeText, inferLanguageFromPath(path ?? null))

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className={cn(
        'diff-scroll overflow-auto border-t border-code-view-border bg-code-view-bg font-mono text-[12.5px]',
        compact && 'max-h-[320px]',
      )}
      style={{ lineHeight: `${String(LINE_HEIGHT_PX)}px` }}
    >
      <div
        className="min-w-full w-max"
        style={{
          minWidth: `calc(${String(gutterWidth + longestRowChars)}ch + ${String(ROW_PADDING_REM)}rem)`,
        }}
      >
        {/* Spacers stand in for the un-rendered rows, so the scrollbar reflects
            the whole diff and scroll position maps to the right row. */}
        <div style={{ height: windowed ? topSpacerPx : 0 }} aria-hidden />
        {visibleRows.map(({ line, lineNumber }, windowIndex) => {
          const index = firstVisibleRowIndex + windowIndex
          if (line.type === 'meta') {
            return (
              <div
                key={`${String(index)}-hunk`}
                className="whitespace-pre bg-code-view-gutter-bg px-3 text-code-view-gutter-text"
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
                <CodeLineTokens
                  tokens={highlighted?.[windowIndex]}
                  fallback={line.content.slice(1)}
                />
              </span>
            </div>
          )
        })}
        <div style={{ height: windowed ? bottomSpacerPx : 0 }} aria-hidden />
      </div>
    </div>
  )
}

/**
 * Memoized for the same reason as FileContentView: the active assistant message
 * re-renders on every stream event, and this subtree is one row per diff line.
 */
export const UnifiedDiffView = memo(UnifiedDiffViewImpl)
