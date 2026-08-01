/**
 * Guards the contract `useHighlightedLines` depends on: shiki's `codeToTokens`
 * must return one token array PER LINE, coloured, for the theme/languages the
 * app preloads. The tool-call file and diff views align those lines 1:1 with the
 * rows they render, so a shape change here would silently drop highlighting.
 */
import { createHighlighter, createJavaScriptRegexEngine } from 'shiki'
import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME } from '@/shared/lib/shiki/highlighter'
import {
  WAGGLE_CODE_THEME_DARK,
  WAGGLE_CODE_THEME_LIGHT,
  waggleCodeThemeDark,
  waggleCodeThemeLight,
} from '@/shared/lib/shiki/waggle-code-theme'

describe('codeToTokens line contract', () => {
  it('returns one coloured token line per source line', async () => {
    const highlighter = await createHighlighter({
      themes: [waggleCodeThemeDark],
      langs: ['typescript'],
      engine: createJavaScriptRegexEngine(),
    })

    const code = ['const a = 1', '// note', 'function f() {}'].join('\n')
    const { tokens } = highlighter.codeToTokens(code, {
      lang: 'typescript',
      theme: DEFAULT_THEME,
    })

    // One entry per line — this is what keeps tokens aligned to rendered rows.
    expect(tokens).toHaveLength(3)
    // Tokens carry colours, which is the whole point of highlighting.
    expect(tokens[0]?.some((token) => !!token.color)).toBe(true)
    // The keyword and the identifier are separate tokens (not one flat string).
    expect(tokens[0]?.length).toBeGreaterThan(1)
    // Reassembling a line's tokens reproduces the original source exactly, so no
    // characters are lost or duplicated when rendering token spans.
    expect(tokens[1]?.map((token) => token.content).join('')).toBe('// note')

    highlighter.dispose()
  })

  it('resolves html (used by index.html reads/edits) to real tokens', async () => {
    const highlighter = await createHighlighter({
      themes: [waggleCodeThemeDark],
      langs: ['html'],
      engine: createJavaScriptRegexEngine(),
    })

    const { tokens } = highlighter.codeToTokens('<div class="solar-system"></div>', {
      lang: 'html',
      theme: DEFAULT_THEME,
    })

    expect(tokens).toHaveLength(1)
    expect(tokens[0]?.some((token) => !!token.color)).toBe(true)

    highlighter.dispose()
  })

  /**
   * The dual-theme call MUST pass `defaultColor: false`. Without it shiki writes
   * the light colour into an inline `color`, which outranks the `.code-token`
   * rules in globals.css — so the dark theme rendered light-palette code on a
   * dark surface (identifiers at #231d1e on #131317, i.e. invisible).
   */
  it('emits both theme colours as custom properties and no inline color', async () => {
    const highlighter = await createHighlighter({
      themes: [waggleCodeThemeDark, waggleCodeThemeLight],
      langs: ['typescript'],
      engine: createJavaScriptRegexEngine(),
    })

    const { tokens } = highlighter.codeToTokens('Object.keys(planetData)', {
      lang: 'typescript',
      themes: { light: WAGGLE_CODE_THEME_LIGHT, dark: WAGGLE_CODE_THEME_DARK },
      defaultColor: false,
    })

    const styles = tokens.flat().map((token) => token.htmlStyle ?? {})
    expect(styles.length).toBeGreaterThan(0)
    for (const style of styles) {
      // An inline `color` here would beat the stylesheet and pin ONE theme.
      expect(style).not.toHaveProperty('color')
      expect(style).toHaveProperty('--shiki-light')
      expect(style).toHaveProperty('--shiki-dark')
    }

    // And the two palettes really do differ, so the swap is observable: plain
    // identifiers are near-black in light and near-white in dark.
    const identifier = tokens.flat().find((token) => token.content === 'Object')?.htmlStyle
    expect(identifier?.['--shiki-light']?.toUpperCase()).toBe('#231D1E')
    expect(identifier?.['--shiki-dark']?.toUpperCase()).toBe('#ECECEE')

    highlighter.dispose()
  })
})
