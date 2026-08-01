/**
 * Shared per-line token renderer for the tool-call code views.
 *
 * `useHighlightedLines` tokenizes a file/diff once with a light+dark shiki theme
 * pair; each token carries BOTH colours as `--shiki-light` / `--shiki-dark`
 * custom properties and no inline `color`. The `code-token` class is what selects
 * between them (see globals.css), so colours follow the app theme without
 * re-tokenizing.
 */
import type { HighlightedToken } from '@/features/chat/lib/use-highlighted-lines'

/** Characters of token text mixed into token keys. */
const TOKEN_KEY_CHARS = 8

/**
 * Render one line's shiki tokens as coloured spans. Falls back to `fallback`
 * (plain text) when the highlighter hasn't produced tokens for this line.
 *
 * `code-token` is what applies the colour: the span's inline style only carries
 * the `--shiki-light` / `--shiki-dark` custom properties, and globals.css picks
 * one per theme.
 */
export function CodeLineTokens({
  tokens,
  fallback,
}: {
  tokens: readonly HighlightedToken[] | undefined
  fallback: string
}) {
  if (!tokens || tokens.length === 0) {
    return <>{fallback || ' '}</>
  }
  return (
    <>
      {tokens.map((token, index) => (
        <span
          key={`${String(index)}-${token.content.slice(0, TOKEN_KEY_CHARS)}`}
          className="code-token"
          style={token.style}
        >
          {token.content}
        </span>
      ))}
    </>
  )
}
