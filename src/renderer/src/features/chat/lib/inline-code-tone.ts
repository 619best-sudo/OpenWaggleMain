/**
 * Classifies an inline `code` span so file references can be picked out.
 *
 * Two tones only:
 *
 *   path  — a file or directory reference, which takes the app's single accent
 *           so the same file reads the same colour in prose, in @mention chips
 *           and in the tool-call strip
 *   plain — everything else: flags, literals, identifiers, prose-y snippets
 *
 * Identifiers deliberately do NOT get a tone of their own. They are far too
 * common; tinting them puts a third colour in every other sentence and the
 * accent stops meaning anything.
 *
 * Deliberately conservative: anything ambiguous falls through to `plain`,
 * because a mis-tinted chip is worse than an untinted one.
 */

/** Extensions common enough that seeing one is strong evidence of a path. */
const PATH_EXTENSION =
  /\.(tsx?|jsx?|mjs|cjs|json|ya?ml|toml|md|mdx|css|scss|html|py|rb|go|rs|java|kt|swift|c|h|cpp|sh|bash|zsh|sql|lock|env|txt|svg|png|webp)$/i

export type InlineCodeTone = 'path' | 'plain'

export function inlineCodeTone(raw: string): InlineCodeTone {
  const text = raw.trim()
  if (!text || text.length > 120 || /\s/.test(text)) return 'plain'

  // A leading `-`/`--` is a CLI flag, never a path, even with slashes after it.
  if (text.startsWith('-')) return 'plain'

  const withoutAnchor = text.replace(/^\.\//, '').replace(/^\//, '')
  const looksRouted = withoutAnchor.includes('/') && !text.includes('://')
  if (looksRouted || PATH_EXTENSION.test(withoutAnchor)) {
    // `a/b` is only a path if the segments look like filenames, which rules out
    // prose fractions and `and/or`-style pairs written in code font.
    if (PATH_EXTENSION.test(withoutAnchor) || /^[\w.@-]+(\/[\w.@-]+)+\/?$/.test(withoutAnchor)) {
      return 'path'
    }
  }

  return 'plain'
}

/** The class the inline chip should carry for `tone`, or undefined for plain. */
export function inlineCodeToneClass(tone: InlineCodeTone): string | undefined {
  return tone === 'path' ? 'inline-path' : undefined
}
