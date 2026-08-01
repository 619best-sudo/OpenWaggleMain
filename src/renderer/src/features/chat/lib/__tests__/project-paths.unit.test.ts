import { describe, expect, it } from 'vitest'
import { relativeToProject } from '../project-paths'

describe('relativeToProject', () => {
  const root = '/Users/me/OpenWaggleMain'

  it('strips the project root prefix from an absolute path inside the repo', () => {
    expect(relativeToProject(root, '/Users/me/OpenWaggleMain/src/main/foo.ts')).toBe(
      'src/main/foo.ts',
    )
  })

  it('returns "." for the root itself', () => {
    expect(relativeToProject(root, root)).toBe('.')
  })

  it('leaves a path outside the repo unchanged', () => {
    expect(relativeToProject(root, '/etc/hosts')).toBe('/etc/hosts')
  })

  it('leaves an already-relative path unchanged', () => {
    expect(relativeToProject(root, 'src/main/foo.ts')).toBe('src/main/foo.ts')
  })

  it('returns the original when no project root is set', () => {
    expect(relativeToProject(null, '/Users/me/OpenWaggleMain/src/main/foo.ts')).toBe(
      '/Users/me/OpenWaggleMain/src/main/foo.ts',
    )
  })

  it('tolerates a trailing slash on the root', () => {
    expect(relativeToProject(`${root}/`, '/Users/me/OpenWaggleMain/src/x.ts')).toBe('src/x.ts')
  })

  it('does not false-match a sibling directory sharing a name prefix', () => {
    // /Users/me/OpenWaggleMain-extra should NOT be treated as inside OpenWaggleMain
    expect(relativeToProject(root, '/Users/me/OpenWaggleMain-extra/foo.ts')).toBe(
      '/Users/me/OpenWaggleMain-extra/foo.ts',
    )
  })
})
