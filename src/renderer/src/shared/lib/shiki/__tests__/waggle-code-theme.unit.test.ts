/**
 * Guards the contract the app's syntax theme exists to provide: the tool-call
 * code views must show DISTINCT, high-contrast hues per role, with punctuation
 * and braces coloured (not grey) and only comments dim. Regressions here look
 * like "the code block is grey-on-black again".
 */
import { createHighlighter, createJavaScriptRegexEngine } from 'shiki'
import { describe, expect, it } from 'vitest'
import {
  WAGGLE_CODE_THEME_DARK,
  WAGGLE_CODE_THEME_LIGHT,
  waggleCodeThemeDark,
  waggleCodeThemeLight,
} from '../waggle-code-theme'

const SAMPLE = 'export const foo = { bar: 42, baz: "hi" } // note'

/** Colour of the first token whose text equals `content`, uppercased by shiki. */
function colorOf(
  tokens: readonly (readonly { content: string; color?: string }[])[],
  content: string,
): string | undefined {
  return tokens
    .flat()
    .find((token) => token.content === content)
    ?.color?.toUpperCase()
}

async function tokenize(theme: typeof WAGGLE_CODE_THEME_DARK | typeof WAGGLE_CODE_THEME_LIGHT) {
  const highlighter = await createHighlighter({
    themes: [waggleCodeThemeDark, waggleCodeThemeLight],
    langs: ['typescript'],
    engine: createJavaScriptRegexEngine(),
  })
  const { tokens } = highlighter.codeToTokens(SAMPLE, { lang: 'typescript', theme })
  highlighter.dispose()
  return tokens
}

describe.each([WAGGLE_CODE_THEME_DARK, WAGGLE_CODE_THEME_LIGHT])('%s', (theme) => {
  it('colours braces and punctuation, not just identifiers', async () => {
    const tokens = await tokenize(theme)
    const brace = colorOf(tokens, '{')
    const plain = colorOf(tokens, ' foo ')

    expect(brace).toBeDefined()
    // Braces read as structure: their own colour, distinct from plain text.
    expect(brace).not.toBe(plain)
  })

  it('gives each syntax role a distinct hue', async () => {
    const tokens = await tokenize(theme)
    const roles = [
      colorOf(tokens, 'const'), // keyword
      colorOf(tokens, '42'), // number
      colorOf(tokens, '"hi"'), // string
      colorOf(tokens, 'bar'), // property
      colorOf(tokens, '{'), // punctuation
      colorOf(tokens, '// note'), // comment
    ]

    expect(roles.every((color) => !!color)).toBe(true)
    expect(new Set(roles).size).toBe(roles.length)
  })
})
