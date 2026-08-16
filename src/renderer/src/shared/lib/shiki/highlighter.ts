/**
 * Singleton Shiki highlighter with lazy initialization.
 *
 * Pre-loads 12 common language grammars on first access and loads every OTHER
 * grammar in shiki's bundle (dart, kotlin, swift, java, …) on demand, the first
 * time a code block asks for it — see `requestLanguage`. Without that on-demand
 * path only the preloaded dozen ever highlighted, so a Flutter/Android/iOS repo
 * saw plain grey text everywhere outside its JSON and YAML.
 *
 * Uses the JavaScript regex engine (no WASM needed).
 */
import type { BundledLanguage, Highlighter } from 'shiki'
import { bundledLanguagesInfo, createHighlighter, createJavaScriptRegexEngine } from 'shiki'
import { createRendererLogger } from '@/shared/lib/logger'
import {
  WAGGLE_CODE_THEME_DARK,
  waggleCodeThemeDark,
  waggleCodeThemeLight,
} from './waggle-code-theme'

const logger = createRendererLogger('shiki')

const PRELOADED_LANGUAGES = [
  'typescript',
  'javascript',
  'json',
  'bash',
  'python',
  'css',
  'html',
  'markdown',
  'yaml',
  'sql',
  'rust',
  'go',
] as const satisfies readonly BundledLanguage[]

/**
 * The app's own light/dark themes (see `waggle-code-theme.ts`) rather than
 * shiki's bundled github pair, whose muted palette read as grey-on-black on our
 * code surfaces.
 */
const PRELOADED_THEMES = [waggleCodeThemeDark, waggleCodeThemeLight] as const

/** Any language shiki can highlight — preloaded or loaded on demand. */
export type HighlightLanguage = BundledLanguage

let highlighterPromise: Promise<Highlighter> | undefined

export function getHighlighter(): Promise<Highlighter> {
  if (highlighterPromise === undefined) {
    highlighterPromise = createHighlighter({
      themes: [...PRELOADED_THEMES],
      langs: [...PRELOADED_LANGUAGES],
      engine: createJavaScriptRegexEngine(),
    }).then((highlighter) => {
      // Record what shiki actually registered (ids AND aliases, plus grammars
      // pulled in as embedded dependencies) so the synchronous paths don't
      // re-request a language that is already usable.
      for (const loaded of highlighter.getLoadedLanguages()) loadedLanguages.add(loaded)
      return highlighter
    })
  }
  return highlighterPromise
}

/** Set of languages available without dynamic loading. */
export const PRELOADED_LANGUAGE_SET: ReadonlySet<string> = new Set<string>(PRELOADED_LANGUAGES)

/**
 * Every bundled language id and alias → canonical id, built from shiki's own
 * bundle metadata so aliases like `kt`, `c++`, `objc` or `yml` resolve for free.
 */
const LANGUAGE_BY_NAME: ReadonlyMap<string, HighlightLanguage> = new Map(
  bundledLanguagesInfo.flatMap((info) => {
    const id = info.id as HighlightLanguage
    return [[info.id, id] as const, ...(info.aliases ?? []).map((alias) => [alias, id] as const)]
  }),
)

/**
 * File extensions whose language shiki's alias table doesn't cover. Extensions
 * that ARE shiki aliases (`kt`, `rs`, `py`, `yml`, …) resolve through
 * `LANGUAGE_BY_NAME` and don't need an entry here.
 */
const EXTENSION_LANGUAGES: ReadonlyMap<string, HighlightLanguage> = new Map<
  string,
  HighlightLanguage
>([
  ['h', 'c'],
  ['hpp', 'cpp'],
  ['hh', 'cpp'],
  ['hxx', 'cpp'],
  ['cc', 'cpp'],
  ['cxx', 'cpp'],
  ['m', 'objective-c'],
  ['mm', 'objective-cpp'],
  ['gradle', 'groovy'],
  ['pbxproj', 'json'],
  ['plist', 'xml'],
  ['xib', 'xml'],
  ['storyboard', 'xml'],
  ['svg', 'xml'],
  ['htm', 'html'],
  ['mdx', 'mdx'],
  ['cjs', 'javascript'],
  ['mjs', 'javascript'],
  ['cts', 'typescript'],
  ['mts', 'typescript'],
  ['ps1', 'powershell'],
  ['bat', 'bat'],
  ['env', 'dotenv'],
  ['gitignore', 'ini'],
  ['arb', 'json'],
])

/**
 * Resolve a language name or alias (`dart`, `kt`, `c++`) to its canonical
 * shiki id. Returns undefined when shiki has no grammar for it.
 */
export function resolveLanguage(lang: string): HighlightLanguage | undefined {
  return LANGUAGE_BY_NAME.get(lang.toLowerCase())
}

/** Resolve a bare file extension (no leading dot) to a language id. */
export function resolveLanguageFromExtension(extension: string): HighlightLanguage | undefined {
  const normalized = extension.toLowerCase()
  return EXTENSION_LANGUAGES.get(normalized) ?? resolveLanguage(normalized)
}

// ---------------------------------------------------------------------------
// On-demand grammar loading
// ---------------------------------------------------------------------------

/**
 * Languages whose grammar is registered on the singleton highlighter, so the
 * SYNCHRONOUS highlight paths (the rehype plugin, the Textarea overlay) can ask
 * without awaiting.
 */
const loadedLanguages = new Set<string>([
  ...PRELOADED_LANGUAGES,
  // Canonical ids too — `bash` is an alias of shiki's `shellscript` grammar, and
  // `resolveLanguage` hands back canonical ids.
  ...PRELOADED_LANGUAGES.map((lang) => LANGUAGE_BY_NAME.get(lang) ?? lang),
])
const pendingLoads = new Map<string, Promise<boolean>>()
/** Languages that failed to load — never retried, so a bad grammar can't loop. */
const failedLanguages = new Set<string>()

const subscribers = new Set<() => void>()
let loadedVersion = 0

/**
 * Version counter bumped whenever a new grammar finishes loading. Views hold it
 * in state (see `StreamingText`) so an on-demand load re-renders the blocks that
 * rendered as plain text while the grammar was still in flight.
 */
export function getLoadedLanguageVersion(): number {
  return loadedVersion
}

export function subscribeToLoadedLanguages(onChange: () => void): () => void {
  subscribers.add(onChange)
  return () => {
    subscribers.delete(onChange)
  }
}

/**
 * Load `lang`'s grammar into the singleton highlighter. Resolves true once the
 * language is usable, false if shiki has no grammar for it or the load failed
 * (callers fall back to plain text). Concurrent calls share one load.
 */
export function ensureLanguage(lang: string): Promise<boolean> {
  if (loadedLanguages.has(lang)) return Promise.resolve(true)
  if (failedLanguages.has(lang)) return Promise.resolve(false)

  const resolved = resolveLanguage(lang)
  if (!resolved) {
    failedLanguages.add(lang)
    return Promise.resolve(false)
  }

  const pending = pendingLoads.get(resolved)
  if (pending) return pending

  const load = getHighlighter()
    .then(async (highlighter) => {
      await highlighter.loadLanguage(resolved)
      for (const loaded of highlighter.getLoadedLanguages()) loadedLanguages.add(loaded)
      loadedLanguages.add(resolved)
      loadedVersion += 1
      for (const subscriber of subscribers) subscriber()
      return true
    })
    .catch((error: unknown) => {
      // Some grammars aren't supported by the JavaScript regex engine.
      // Highlighting is decorative — record the failure and render plain text.
      failedLanguages.add(resolved)
      logger.warn('Failed to load language grammar', {
        language: resolved,
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    })
    .finally(() => {
      pendingLoads.delete(resolved)
    })

  pendingLoads.set(resolved, load)
  return load
}

/**
 * Fire-and-forget variant for the synchronous highlight paths: kick off the
 * load, render plain text this pass, and let the subscription re-render once
 * the grammar lands.
 */
export function requestLanguage(lang: string): void {
  void ensureLanguage(lang)
}

/** Default theme used for highlighting (fallback if dual-theme not used). */
export const DEFAULT_THEME = WAGGLE_CODE_THEME_DARK
