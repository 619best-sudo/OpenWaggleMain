import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getEnvFilePaths, getGhCliEnv, getNpmCompatiblePath, getSafeChildEnv } from '../env'

const MINIMAL_PATH = ['/usr/bin', '/bin'].join(delimiter)

function pathEntries(value: string | undefined) {
  return value?.split(delimiter) ?? []
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('main process environment helpers', () => {
  it('adds common user tool directories to the npm-compatible PATH', () => {
    vi.stubEnv('PATH', MINIMAL_PATH)

    const entries = pathEntries(getNpmCompatiblePath())

    expect(entries).toContain(join(homedir(), '.local', 'bin'))
    expect(entries).toContain(join(homedir(), '.volta', 'bin'))
    expect(entries).toContain('/usr/local/bin')
    if (process.platform === 'darwin') {
      expect(entries).toContain(join(homedir(), 'Library', 'pnpm'))
      expect(entries).toContain('/opt/homebrew/bin')
    }
  })

  it('uses the npm-compatible PATH for safe child process environments', () => {
    vi.stubEnv('PATH', MINIMAL_PATH)

    const childEnv = getSafeChildEnv()
    const entries = pathEntries(childEnv.PATH)

    expect(entries).toContain(join(homedir(), '.local', 'bin'))
    expect(entries).toContain('/usr/local/bin')
  })

  it('preserves existing PATH precedence before npm-compatible fallbacks', () => {
    const existingEntries = ['/custom/shims', '/usr/bin', '/bin']
    vi.stubEnv('PATH', existingEntries.join(delimiter))

    const entries = pathEntries(getSafeChildEnv().PATH)

    expect(entries.slice(0, existingEntries.length)).toEqual(existingEntries)
    expect(entries).toContain(join(homedir(), '.local', 'bin'))
    expect(entries).toContain('/usr/local/bin')
  })

  it('uses the npm-compatible PATH for gh CLI environments', () => {
    vi.stubEnv('PATH', MINIMAL_PATH)
    vi.stubEnv('GH_TOKEN', 'secret-gh-token')
    vi.stubEnv('GITHUB_TOKEN', 'secret-github-token')

    const ghEnv = getGhCliEnv()
    const entries = pathEntries(ghEnv.PATH)

    expect(entries).toContain(join(homedir(), '.local', 'bin'))
    expect(entries).toContain('/usr/local/bin')
    expect(ghEnv.GH_TOKEN).toBeUndefined()
    expect(ghEnv.GITHUB_TOKEN).toBeUndefined()
  })
})

describe('packaged env file discovery', () => {
  // Regression guard. The packaged app previously had NO readable env file:
  // paths were resolved only from process.cwd(), which in a packaged build is
  // whatever directory the app was launched from — never the repo, and never
  // inside app.asar. Bundling .env.local into the archive looked like config but
  // was unreachable, so Google sign-in failed with "client_secret is missing".
  const originalResourcesPath = process.resourcesPath

  afterEach(() => {
    Object.defineProperty(process, 'resourcesPath', {
      value: originalResourcesPath,
      configurable: true,
      writable: true,
    })
  })

  function setResourcesPath(value: string | undefined) {
    Object.defineProperty(process, 'resourcesPath', {
      value,
      configurable: true,
      writable: true,
    })
  }

  it('reads app.env from the Resources directory in a packaged app', () => {
    setResourcesPath('/Applications/Turing Machine.app/Contents/Resources')

    expect(getEnvFilePaths('production')).toContain(
      join('/Applications/Turing Machine.app/Contents/Resources', 'app.env'),
    )
  })

  it('still resolves the repo env files for development', () => {
    setResourcesPath(undefined)
    const paths = getEnvFilePaths('development')

    expect(paths).toContain(join(process.cwd(), '.env.local'))
    expect(paths).toContain(join(process.cwd(), '.env.development'))
    // Nothing from a bundle when there is no bundle.
    expect(paths.some((path) => path.endsWith('app.env'))).toBe(false)
  })

  it('puts the packaged file last so a real env var or repo file wins', () => {
    // loadMainProcessEnv only fills keys that are still undefined, so ordering
    // decides precedence: a developer overriding a key locally must not be
    // silently overruled by the value shipped inside the app.
    setResourcesPath('/Applications/Turing Machine.app/Contents/Resources')
    const paths = getEnvFilePaths('production')

    expect(paths[paths.length - 1]).toBe(
      join('/Applications/Turing Machine.app/Contents/Resources', 'app.env'),
    )
  })
})
