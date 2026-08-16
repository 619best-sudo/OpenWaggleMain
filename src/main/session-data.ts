import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const SESSION_DATA_DIRECTORY_NAME = 'session-data'
const CHROMIUM_DIPS_BASENAME = 'DIPS'
const CHROMIUM_DIPS_SIDE_SUFFIXES = ['', '-wal', '-shm'] as const
const CHROMIUM_DIPS_REPAIR_MARKER_FILENAME = '.openwaggle-dips-repair-v1'

export interface AppPathManager {
  getPath(name: 'userData'): string
  setPath(name: 'userData' | 'sessionData', value: string): void
}

function getChromiumDipsPaths(sessionDataPath: string) {
  return CHROMIUM_DIPS_SIDE_SUFFIXES.map((suffix) =>
    join(sessionDataPath, `${CHROMIUM_DIPS_BASENAME}${suffix}`),
  )
}

function repairChromiumDipsDatabaseOnce(sessionDataPath: string) {
  const repairMarkerPath = join(sessionDataPath, CHROMIUM_DIPS_REPAIR_MARKER_FILENAME)
  if (existsSync(repairMarkerPath)) {
    return
  }

  const chromiumDipsPaths = getChromiumDipsPaths(sessionDataPath)
  const hasExistingChromiumDipsState = chromiumDipsPaths.some((chromiumDipsPath) =>
    existsSync(chromiumDipsPath),
  )

  if (hasExistingChromiumDipsState) {
    for (const chromiumDipsPath of chromiumDipsPaths) {
      rmSync(chromiumDipsPath, { force: true })
    }
  }

  // Versioned marker: this is a one-time profile repair, not a per-launch reset.
  writeFileSync(repairMarkerPath, `${CHROMIUM_DIPS_REPAIR_MARKER_FILENAME}\n`)
}

/**
 * Directory Electron used for `userData` before the app was renamed to
 * "Turing Machine". Electron derives that path from `app.getName()`, so adding
 * `productName` to package.json silently moved it from `<appData>/openwaggle`
 * to `<appData>/Turing Machine` — every existing install would have launched
 * to an empty profile: no settings, no sessions, no history.
 */
const LEGACY_USER_DATA_DIRECTORY_NAME = 'openwaggle'

/**
 * One-time move of the pre-rename profile into the new location.
 *
 * Only runs when the new directory does not exist yet, so it can never
 * overwrite a live profile. A failure here is non-fatal: the app starts with a
 * fresh profile rather than refusing to boot, and the old directory is left on
 * disk untouched for manual recovery.
 */
function migrateLegacyUserDataDirectory(userDataPath: string): void {
  if (existsSync(userDataPath)) return

  const legacyPath = join(dirname(userDataPath), LEGACY_USER_DATA_DIRECTORY_NAME)
  if (legacyPath === userDataPath || !existsSync(legacyPath)) return

  try {
    // Rename, not copy: profiles hold multi-GB SQLite databases, and a partial
    // copy would be worse than no migration at all.
    renameSync(legacyPath, userDataPath)
  } catch {
    // Cross-device rename, permissions, or a locked file. Leave the legacy
    // directory alone and let the app come up clean.
  }
}

export function configureAppStoragePaths(
  appPaths: AppPathManager,
  overrideUserDataPath?: string,
): void {
  const userDataPath = overrideUserDataPath ?? appPaths.getPath('userData')
  // Must precede the mkdir below — that call would create the new directory and
  // make the migration think a profile already lived there.
  if (!overrideUserDataPath) {
    migrateLegacyUserDataDirectory(userDataPath)
  }
  appPaths.setPath('userData', userDataPath)
  mkdirSync(userDataPath, { recursive: true })

  const sessionDataPath = join(userDataPath, SESSION_DATA_DIRECTORY_NAME)
  mkdirSync(sessionDataPath, { recursive: true })
  repairChromiumDipsDatabaseOnce(sessionDataPath)
  appPaths.setPath('sessionData', sessionDataPath)
}
