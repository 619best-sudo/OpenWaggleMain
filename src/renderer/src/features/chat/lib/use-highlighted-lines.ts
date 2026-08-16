/**
 * Per-line syntax highlighting for the tool-call file/diff views.
 *
 * The file and diff views render their own gutter, per-line tints (write
 * additions, mark_concern_lines highlights) and diff +/- backgrounds, so they
 * can't use the whole-block shiki path the markdown renderer uses. This hook
 * returns shiki's TOKENS grouped by line instead of HTML, so a caller keeps full
 * control of each row's layout while still colouring the code itself.
 *
 * Tokenizing in ONE call (rather than line by line) preserves multi-line grammar
 * context — block comments and template literals stay correctly coloured across
 * line boundaries. Callers therefore pass the largest slice they can afford:
 * `codeToTokens` is SYNCHRONOUS and scales with input, measured at ~360ms for
 * 1,000 lines and ~710ms for 2,000. Handing it a whole file froze the renderer
 * for most of a second the moment a tool strip was expanded — with a run
 * streaming, that is the stall. The views window their rows, so they pass the
 * visible window (plus its overscan) and re-tokenize as it moves; the cost
 * becomes a few ms, and the only loss is grammar context from constructs that
 * begin far above the window.
 *
 * Colours are DUAL-THEME: with `defaultColor: false` shiki emits BOTH colours as
 * `--shiki-light` / `--shiki-dark` custom properties and no inline `color`. Rules
 * in globals.css pick one per `html[data-theme]`, so highlighting follows the app
 * theme without re-tokenizing on every theme change. Leaving shiki's default on
 * would put the light colour in an inline `color` that outranks those rules — the
 * dark theme then rendered light-palette code on a dark surface.
 */
import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import {
  ensureLanguage,
  getHighlighter,
  type HighlightLanguage,
} from '@/shared/lib/shiki/highlighter'
import {
  WAGGLE_CODE_THEME_DARK,
  WAGGLE_CODE_THEME_LIGHT,
} from '@/shared/lib/shiki/waggle-code-theme'

/** Shiki theme pair matching the app's light/dark themes. */
const THEME_PAIR = { light: WAGGLE_CODE_THEME_LIGHT, dark: WAGGLE_CODE_THEME_DARK } as const

export interface HighlightedToken {
  readonly content: string
  /** Inline style carrying `--shiki-light` + `--shiki-dark` (never `color`). */
  readonly style?: CSSProperties
}

/** One entry per line of the input, in order. */
export type HighlightedLines = readonly (readonly HighlightedToken[])[]

/**
 * Tokenize `code` for `language`. Returns null until the highlighter has loaded,
 * when no language could be resolved, or if highlighting fails — callers fall
 * back to rendering plain text, so a null result is always safe.
 */
export function useHighlightedLines(
  code: string,
  language: HighlightLanguage | undefined,
): HighlightedLines | null {
  const [lines, setLines] = useState<HighlightedLines | null>(null)

  useEffect(() => {
    if (!language || !code) {
      setLines(null)
      return
    }

    let cancelled = false
    void ensureLanguage(language)
      .then(async (ready) => {
        if (!ready) return null
        return await getHighlighter()
      })
      .then((highlighter) => {
        if (cancelled) return
        if (!highlighter) {
          // No grammar for this language — render plain text.
          setLines(null)
          return
        }
        const { tokens } = highlighter.codeToTokens(code, {
          lang: language,
          themes: THEME_PAIR,
          // `defaultColor: false` is LOAD-BEARING. By default shiki writes the
          // light colour as an inline `color`, which outranks any stylesheet
          // selector — so the dark-theme swap silently lost and the whole block
          // rendered in LIGHT colours on a dark surface (identifiers at #231d1e,
          // i.e. near-invisible). With it off, shiki emits only `--shiki-light`
          // / `--shiki-dark` custom properties and the CSS in globals.css picks
          // the right one.
          defaultColor: false,
        })
        setLines(
          tokens.map((lineTokens) =>
            lineTokens.map((token) => ({
              content: token.content,
              ...(token.htmlStyle ? { style: token.htmlStyle } : {}),
            })),
          ),
        )
      })
      .catch(() => {
        // Highlighting is decorative — fall back to plain text.
        if (!cancelled) setLines(null)
      })

    return () => {
      cancelled = true
    }
  }, [code, language])

  return lines
}
