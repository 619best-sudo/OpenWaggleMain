import { describe, expect, it } from 'vitest'
import { inlineCodeTone, inlineCodeToneClass } from '../inline-code-tone'

describe('inlineCodeTone', () => {
  it('treats slash-separated filename-ish spans as paths', () => {
    expect(inlineCodeTone('src/main/index.ts')).toBe('path')
    expect(inlineCodeTone('./scripts/build.sh')).toBe('path')
    expect(inlineCodeTone('/etc/hosts/conf.d')).toBe('path')
  })

  it('treats a bare filename with a known extension as a path', () => {
    expect(inlineCodeTone('AGENTS.md')).toBe('path')
    expect(inlineCodeTone('package.json')).toBe('path')
  })

  it('does not mistake flags or URLs for paths', () => {
    expect(inlineCodeTone('--no-verify')).toBe('plain')
    expect(inlineCodeTone('-rf')).toBe('plain')
    expect(inlineCodeTone('https://example.com/a/b')).toBe('plain')
  })

  it('leaves identifiers plain — they are too common to earn the accent', () => {
    expect(inlineCodeTone('ChatPanel')).toBe('plain')
    expect(inlineCodeTone('useState()')).toBe('plain')
  })

  it('leaves lowercase words, literals and multi-word spans plain', () => {
    expect(inlineCodeTone('true')).toBe('plain')
    expect(inlineCodeTone('git commit -m x')).toBe('plain')
    expect(inlineCodeTone('')).toBe('plain')
  })

  it('maps tones to chip classes', () => {
    expect(inlineCodeToneClass('path')).toBe('inline-path')
    expect(inlineCodeToneClass('plain')).toBeUndefined()
  })
})
