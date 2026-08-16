import { describe, expect, it } from 'vitest'
import {
  ensureLanguage,
  getHighlighter,
  getLoadedLanguageVersion,
  resolveLanguage,
  resolveLanguageFromExtension,
  subscribeToLoadedLanguages,
} from '../highlighter'

describe('resolveLanguage', () => {
  it('resolves languages outside the preloaded set', () => {
    expect(resolveLanguage('dart')).toBe('dart')
    expect(resolveLanguage('swift')).toBe('swift')
    expect(resolveLanguage('java')).toBe('java')
  })

  it('resolves shiki aliases to canonical ids', () => {
    expect(resolveLanguage('kt')).toBe('kotlin')
    expect(resolveLanguage('c++')).toBe('cpp')
    expect(resolveLanguage('objc')).toBe('objective-c')
    expect(resolveLanguage('TS')).toBe('typescript')
  })

  it('returns undefined for unknown languages', () => {
    expect(resolveLanguage('not-a-language')).toBeUndefined()
  })
})

describe('resolveLanguageFromExtension', () => {
  it('maps Flutter/mobile file extensions to grammars', () => {
    expect(resolveLanguageFromExtension('dart')).toBe('dart')
    expect(resolveLanguageFromExtension('gradle')).toBe('groovy')
    expect(resolveLanguageFromExtension('kt')).toBe('kotlin')
    expect(resolveLanguageFromExtension('m')).toBe('objective-c')
    expect(resolveLanguageFromExtension('h')).toBe('c')
    expect(resolveLanguageFromExtension('arb')).toBe('json')
  })
})

describe('ensureLanguage', () => {
  it('loads a non-preloaded grammar and notifies subscribers', async () => {
    const versionBefore = getLoadedLanguageVersion()
    let notifications = 0
    const unsubscribe = subscribeToLoadedLanguages(() => {
      notifications += 1
    })

    try {
      await expect(ensureLanguage('dart')).resolves.toBe(true)

      const highlighter = await getHighlighter()
      expect(highlighter.getLoadedLanguages()).toContain('dart')
      expect(notifications).toBe(1)
      expect(getLoadedLanguageVersion()).toBe(versionBefore + 1)

      // Already loaded — no second load, no second notification.
      await expect(ensureLanguage('dart')).resolves.toBe(true)
      expect(notifications).toBe(1)
    } finally {
      unsubscribe()
    }
  }, 30_000)

  it('resolves false for a language shiki has no grammar for', async () => {
    await expect(ensureLanguage('not-a-language')).resolves.toBe(false)
  })
})
