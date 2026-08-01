/**
 * The app's own syntax-highlighting themes.
 *
 * Replaces shiki's bundled `github-dark` / `github-light`, which were tuned for
 * GitHub's surfaces, not ours: on the code-view background (`#131317`) most of
 * github-dark's palette lands in the same low-saturation grey band, so a tool
 * expansion read as grey-on-black instead of as code.
 *
 * Rules this palette follows:
 * - Every role gets a DISTINCT hue drawn from the app's accent families
 *   (`--theme-agent-*`, `--theme-terminal-*`, `--theme-provider-anthropic`), so
 *   syntax colouring reads as part of the product rather than a foreign theme.
 * - Punctuation and braces are NOT grey. They use a warm near-foreground tint
 *   derived from `--theme-tool-call-file-text`, so `{`/`}`/`(`/`)` stay visible
 *   as structure without competing with identifiers.
 * - Only comments are deliberately dim. Nothing else falls below the
 *   foreground's contrast band.
 * - Hues avoid pure green/red, which the diff views own for added/removed rows;
 *   strings sit in a yellow-green and tags in a rose so they stay legible on
 *   top of the add/remove washes.
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
    dark: '#8c92a0',
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
    dark: '#cfc4c4',
    light: '#6b5a5d',
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
    dark: '#c896ff',
    light: '#7b3fd0',
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
    dark: '#7aa2ff',
    light: '#1f5fd8',
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
    dark: '#a7e08a',
    light: '#3f7a1c',
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
    dark: '#f5b544',
    light: '#9a5c05',
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
    dark: '#e0b48f',
    light: '#8a5320',
  },
  {
    scope: [
      'variable.other.property',
      'variable.other.member',
      'meta.object-literal.key',
      'support.type.property-name',
      'entity.other.attribute-name',
    ],
    dark: '#6fd7e8',
    light: '#0b6b7d',
  },
  {
    scope: ['entity.name.tag', 'punctuation.definition.tag'],
    dark: '#f28fa0',
    light: '#b02a45',
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
    dark: '#ff8f9d',
    light: '#a81430',
  },
  // Markdown, which shows up often in read/write of docs.
  {
    scope: ['markup.heading', 'entity.name.section'],
    dark: '#7aa2ff',
    light: '#1f5fd8',
    fontStyle: 'bold',
  },
  { scope: ['markup.bold'], dark: '#ececee', light: '#231d1e', fontStyle: 'bold' },
  { scope: ['markup.italic'], dark: '#ececee', light: '#231d1e', fontStyle: 'italic' },
  {
    scope: ['markup.inline.raw', 'markup.fenced_code', 'markup.raw'],
    dark: '#a7e08a',
    light: '#3f7a1c',
  },
  {
    scope: ['markup.underline.link', 'string.other.link'],
    dark: '#6fd7e8',
    light: '#0b6b7d',
  },
  { scope: ['markup.list', 'punctuation.definition.list'], dark: '#cfc4c4', light: '#6b5a5d' },
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
