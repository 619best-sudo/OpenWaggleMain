/**
 * Line-numbered, scrollable view of a file — used for `read` results (with
 * mark_concern_lines highlights) and for `write` drafts (all-additions tint).
 *
 * Renders its own gutter as a PINNED column with its own background, plus
 * per-row tints, so it can't use the whole-block shiki path (one monolithic
 * <pre>, no per-line treatments). It takes shiki's tokens grouped by line and
 * colours each row itself. Renders flush inside a tool strip: only a top divider.
 */
import { useMemo } from 'react'
import {
  inferLanguageFromPath,
  type NumberedLine,
  READ_VIEW_MAX_LINES,
  splitNumberedFileLines,
} from '@/features/chat/lib/tool-call-block'
import {
  type HighlightedToken,
  useHighlightedLines,
} from '@/features/chat/lib/use-highlighted-lines'
import { cn } from '@/shared/lib/cn'
import { CodeLineTokens } from './CodeLineTokens'

/** Minimum gutter width, in characters, so narrow files still align. */
const MIN_GUTTER_CHARS = 2
/** Characters of line text mixed into React keys to keep them stable. */
const KEY_TEXT_CHARS = 16

type FileContentViewVariant = 'default' | 'additions'

/**
 * Fixed-height, scrollable, line-numbered view of a file. Used for read
 * results (with concern-line highlights from mark_concern_lines) and for write
 * results (every line shown as an addition, i.e. green-tinted).
 *
 * Renders its own gutter + per-line backgrounds, so it can't use the whole-block
 * shiki path (that emits one monolithic <pre> and can't carry per-line
 * treatments). Instead it takes shiki's TOKENS grouped by line and colours each
 * row itself — syntax highlighting AND per-line tints. A large-file guard keeps
 * the UI responsive.
 */
export function FileContentView({
  content,
  variant,
  concernSet,
  maxHeight,
  path,
}: {
  content: string
  variant: FileContentViewVariant
  concernSet?: ReadonlySet<number>
  maxHeight: number
  /** File path, used to infer the language for syntax highlighting. */
  path?: string | null
}) {
  // Memoize on `content` — splitting and re-joining a large file on every render
  // (including every parent re-render while a run streams) is wasted work.
  const lines = useMemo(() => splitNumberedFileLines(content), [content])
  // Highlight the file body (line-number prefixes stripped) so tokens line up
  // 1:1 with the rows rendered below.
  const codeText = useMemo(() => lines.map((line) => line.text).join('\n'), [lines])
  const highlighted = useHighlightedLines(codeText, inferLanguageFromPath(path ?? null))

  if (lines.length > READ_VIEW_MAX_LINES) {
    return (
      <div>
        <div className="mb-1 text-[12px] text-[color:var(--color-code-card-muted-text)]">
          Large file ({String(lines.length)} lines) shown without line highlighting to keep the UI
          responsive.
        </div>
        <pre
          className="home-panel-frame-soft overflow-x-auto overflow-y-auto rounded-md bg-code-card p-2 font-mono text-[13px] font-semibold text-[color:var(--color-code-card-text)] whitespace-pre-wrap break-words"
          style={{ maxHeight }}
        >
          {content}
        </pre>
      </div>
    )
  }

  const gutterWidth = Math.max(
    MIN_GUTTER_CHARS,
    String(lines[lines.length - 1]?.number ?? lines.length).length,
  )

  return (
    <div
      // `diff-scroll` gives the thin scrollbars used elsewhere; scrolling is on
      // BOTH axes so long lines and long files are always reachable.
      className="diff-scroll overflow-auto border-t border-code-view-border bg-code-view-bg font-mono text-[12.5px] leading-[1.65]"
      style={{ maxHeight }}
    >
      <div className="min-w-full w-max">
        {lines.map((line, index) => (
          <FileViewLine
            key={`${String(line.number)}-${line.text.slice(0, KEY_TEXT_CHARS)}`}
            line={line}
            variant={variant}
            isConcern={!!concernSet?.has(line.number)}
            gutterWidth={gutterWidth}
            tokens={highlighted?.[index]}
          />
        ))}
      </div>
    </div>
  )
}

function FileViewLine({
  line,
  variant,
  isConcern,
  gutterWidth,
  tokens,
}: {
  line: NumberedLine
  variant: FileContentViewVariant
  isConcern: boolean
  gutterWidth: number
  tokens?: readonly HighlightedToken[]
}) {
  const rowClassName = cn(
    'group/line flex whitespace-pre border-l-[3px] border-l-transparent',
    // A `write` draft is all-new content, so every row gets the added treatment.
    variant === 'additions' && 'border-l-code-view-add-accent bg-code-view-add-bg',
    isConcern && 'border-l-code-view-concern-accent bg-code-view-concern-bg',
  )
  // The gutter is its OWN column with its own background, pinned with `sticky`
  // so the line numbers stay visible while the code scrolls horizontally.
  const gutterClassName = cn(
    'sticky left-0 z-10 shrink-0 select-none border-r border-code-view-border bg-code-view-gutter-bg px-2.5 text-right tabular-nums text-code-view-gutter-text',
    variant === 'additions' && 'font-semibold text-code-view-add-text',
    isConcern && 'font-semibold text-code-view-concern-accent',
  )
  return (
    <div className={rowClassName}>
      <span
        className={gutterClassName}
        style={{ minWidth: `calc(${String(gutterWidth)}ch + 1.25rem)` }}
        aria-hidden
      >
        {String(line.number)}
      </span>
      {/* `font-semibold`: at 12.5px, normal-weight mono on a dark surface reads
          washed out — the weight is what makes the syntax colours land. Applied
          to the code cell only, so the gutter keeps its own weights. */}
      <span className="pl-3 pr-4 font-semibold text-[color:var(--color-code-card-text)]">
        <CodeLineTokens tokens={tokens} fallback={line.text} />
      </span>
    </div>
  )
}
