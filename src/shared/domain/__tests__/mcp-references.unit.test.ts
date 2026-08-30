import { describe, expect, it } from 'vitest'
import { extractMcpServerReferences } from '../mcp-references'

describe('extractMcpServerReferences', () => {
  const servers = ['playwright', 'chrome-devtools']

  it('matches slash tokens against server names case-insensitively', () => {
    expect(extractMcpServerReferences('/Playwright open the site', servers)).toEqual(['playwright'])
    expect(extractMcpServerReferences('/CHROME-DEVTOOLS inspect', servers)).toEqual([
      'chrome-devtools',
    ])
  })

  it('returns canonical names (not lowercased input names)', () => {
    expect(extractMcpServerReferences('/playwright x', ['Playwright'])).toEqual(['Playwright'])
  })

  it('dedupes repeated mentions preserving first-seen order', () => {
    expect(
      extractMcpServerReferences(
        '/chrome-devtools then /playwright then /chrome-devtools',
        servers,
      ),
    ).toEqual(['chrome-devtools', 'playwright'])
  })

  it('ignores unknown tokens, dollar refs, and non-slash slashes', () => {
    expect(extractMcpServerReferences('/unknown and $playwright and 3/5 and/or', servers)).toEqual(
      [],
    )
  })

  it('requires a word boundary before the slash', () => {
    // "x/playwright" is not a mention (no whitespace/start before the slash).
    expect(extractMcpServerReferences('x/playwright', servers)).toEqual([])
    expect(extractMcpServerReferences('start /playwright', servers)).toEqual(['playwright'])
  })

  it('returns empty when there are no servers or no text', () => {
    expect(extractMcpServerReferences('/playwright', [])).toEqual([])
    expect(extractMcpServerReferences('', servers)).toEqual([])
  })
})
