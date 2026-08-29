/**
 * The app's own syntax-highlighting themes.
 *
 * Replaces shiki's bundled `github-dark` / `github-light`, which were tuned for
 * GitHub's surfaces, not ours: on the code-view background (`#131317`) most of
 * github-dark's palette lands in the same low-saturation grey band, so a tool
 * expansion read as grey-on-black instead of as code.
 *
 * Rules this palette follows:
 * - THREE hues, and they are the badge hues (`--theme-badge-*`), not a palette
 *   of their own: blue for the language (keywords, storage, tags), violet for
 *   literal strings, amber for numeric and language constants. Everything
 *   structural — identifiers, functions, types, properties — is plain
 *   foreground. The surrounding UI is neutral on purpose; an eight-hue syntax
 *   theme would fight it.
 * - None of the three is green or red: the diff views own those for added and
 *   removed rows, so a token stays legible on top of an add/remove wash.
 * - Punctuation and braces are NOT grey. They sit just below the foreground so
 *   `{`/`}`/`(`/`)` read as structure without competing with identifiers.
 * - Only comments are deliberately dim. Nothing else falls below the
 *   foreground's contrast band.
 *
 * Colours are literal hex rather than `var(--theme-*)` because shiki parses and
 * blends theme colours at tokenize time. Values mirror the tokens named above;
 * keep the two in step when either changes.
 */
import type { ThemeRegistrationRaw } from 'shiki'

export const WAGGLE_CODE_THEME_DARK = 'waggle-dark'
export const WAGGLE_CODE_THEME_LIGHT = 'waggle-light'

/** The two theme names the app highlights with, as a light/dark pair. */
export type WaggleCodeThemeName = typeof WAGGLE_CODE_THEME_DARK | typeof WAGGLE_CODE_THEME_LIGHT

/** One semantic role → the TextMate scopes that should take its colour. */
interface CodeRole {
  readonly scope: readonly string[]
  readonly dark: string
  readonly light: string
  readonly fontStyle?: string
}

/**
 * Scope → colour map, shared by both themes so light and dark can never drift
 * apart in which roles they distinguish.
 *
 * Order is mostly documentation: vscode-textmate resolves by selector
 * specificity, so `support.type.property-name` beats `support.type` wherever it
 * appears in this list.
 */
const CODE_ROLES: readonly CodeRole[] = [
  {
    // Comments are the ONE role allowed to be dim.
    scope: ['comment', 'punctuation.definition.comment', 'string.comment'],
    dark: '#797984',
    // Dimmer than the light foreground but still ≥4.5:1 on the code surface AND
    // on the add/remove washes — a comment inside a changed line stays readable.
    light: '#6e676a',
    fontStyle: 'italic',
  },
  {
    // Braces, brackets, separators, accessors: warm, near-foreground, never grey.
    scope: [
      'punctuation',
      'meta.brace',
      'meta.delimiter',
      'punctuation.definition.block',
      'punctuation.definition.parameters',
      'punctuation.separator',
      'punctuation.terminator',
      'punctuation.accessor',
      'keyword.operator',
      'keyword.operator.assignment',
      'keyword.operator.arithmetic',
      'keyword.operator.comparison',
      'keyword.operator.logical',
    ],
    dark: '#a6a6ae',
    light: '#60585a',
  },
  {
    scope: [
      'keyword',
      'keyword.control',
      'keyword.other',
      'storage',
      'storage.type',
      'storage.modifier',
      'keyword.operator.new',
      'keyword.operator.expression',
      'variable.language.super',
      'variable.language.this',
    ],
    dark: '#7fb2f5',
    light: '#2b6cb0',
  },
  {
    scope: [
      'entity.name.function',
      'entity.name.function.member',
      'support.function',
      'variable.function',
      'meta.function-call',
      'meta.function-call.generic',
      'meta.decorator',
      'entity.name.label',
    ],
    dark: '#ececee',
    light: '#231d1e',
  },
  {
    scope: [
      'string',
      'string.template',
      'string.quoted',
      'string.regexp',
      'punctuation.definition.string',
      'constant.other.symbol',
    ],
    dark: '#ab93f0',
    light: '#6449bc',
  },
  {
    scope: [
      'constant.numeric',
      'constant.language',
      'constant.character',
      'constant.other',
      'support.constant',
      'keyword.other.unit',
      'constant.character.escape',
    ],
    dark: '#e3ab5c',
    light: '#98590a',
  },
  {
    scope: [
      'entity.name.type',
      'entity.name.class',
      'entity.name.namespace',
      'entity.other.inherited-class',
      'support.type',
      'support.class',
      'meta.type',
    ],
    dark: '#ececee',
    light: '#231d1e',
  },
  {
    scope: [
      'variable.other.property',
      'variable.other.member',
      'meta.object-literal.key',
      'support.type.property-name',
      'entity.other.attribute-name',
    ],
    dark: '#ececee',
    light: '#231d1e',
  },
  {
    scope: ['entity.name.tag', 'punctuation.definition.tag'],
    dark: '#7fb2f5',
    light: '#2b6cb0',
  },
  {
    scope: [
      'variable',
      'variable.other',
      'variable.other.readwrite',
      'variable.parameter',
      'meta.definition.variable.name',
    ],
    dark: '#ececee',
    light: '#231d1e',
  },
  {
    scope: ['invalid', 'invalid.illegal'],
    dark: '#ff909c',
    light: '#a52532',
  },
  // Markdown, which shows up often in read/write of docs.
  {
    scope: ['markup.heading', 'entity.name.section'],
    dark: '#7fb2f5',
    light: '#2b6cb0',
    fontStyle: 'bold',
  },
  { scope: ['markup.bold'], dark: '#ececee', light: '#231d1e', fontStyle: 'bold' },
  { scope: ['markup.italic'], dark: '#ececee', light: '#231d1e', fontStyle: 'italic' },
  {
    scope: ['markup.inline.raw', 'markup.fenced_code', 'markup.raw'],
    dark: '#ab93f0',
    light: '#6449bc',
  },
  {
    scope: ['markup.underline.link', 'string.other.link'],
    dark: '#7fb2f5',
    light: '#2b6cb0',
  },
  { scope: ['markup.list', 'punctuation.definition.list'], dark: '#a6a6ae', light: '#6a6870' },
]

/** Build one theme variant from the shared role map. */
function buildTheme(variant: 'dark' | 'light'): ThemeRegistrationRaw {
  // Mirrors --theme-code-card-text / --theme-code-view-bg for the variant.
  const fg = variant === 'dark' ? '#ececee' : '#231d1e'
  const bg = variant === 'dark' ? '#131317' : '#fcfcfd'
  return {
    name: variant === 'dark' ? WAGGLE_CODE_THEME_DARK : WAGGLE_CODE_THEME_LIGHT,
    type: variant,
    colors: { 'editor.foreground': fg, 'editor.background': bg },
    fg,
    bg,
    settings: [
      { settings: { foreground: fg, background: bg } },
      ...CODE_ROLES.map((role) => ({
        scope: [...role.scope],
        settings: {
          foreground: variant === 'dark' ? role.dark : role.light,
          ...(role.fontStyle ? { fontStyle: role.fontStyle } : {}),
        },
      })),
    ],
  }
}

export const waggleCodeThemeDark: ThemeRegistrationRaw = buildTheme('dark')
export const waggleCodeThemeLight: ThemeRegistrationRaw = buildTheme('light')
