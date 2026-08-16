import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { type AppPathManager, configureAppStoragePaths } from '../session-data'

const SESSION_DATA_DIRECTORY_NAME = 'session-data'
const REPAIR_MARKER_FILENAME = '.openwaggle-dips-repair-v1'
const DIPS_FILENAMES = ['DIPS', 'DIPS-wal', 'DIPS-shm'] as const

const tempDirectories: string[] = []

function createTempDirectory() {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'openwaggle-session-data-'))
  tempDirectories.push(tempDirectory)
  return tempDirectory
}

function createAppPathManager(defaultUserDataPath: string): {
  readonly appPathManager: AppPathManager
  readonly getRecordedPath: (name: 'userData' | 'sessionData') => string | undefined
} {
  const recordedPaths = new Map<'userData' | 'sessionData', string>()

  return {
    appPathManager: {
      getPath(name) {
        if (name === 'userData') {
          return defaultUserDataPath
        }

        throw new Error(`Unsupported path lookup: ${name}`)
      },
      setPath(name, value) {
        recordedPaths.set(name, value)
      },
    },
    getRecordedPath(name) {
      return recordedPaths.get(name)
    },
  }
}

afterEach(async () => {
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((tempDirectory) => rm(tempDirectory, { force: true, recursive: true })),
  )
})

describe('configureAppStoragePaths', () => {
  it('creates userData and sessionData paths and records them on the app', () => {
    const userDataPath = createTempDirectory()
    const { appPathManager, getRecordedPath } = createAppPathManager(userDataPath)

    configureAppStoragePaths(appPathManager)

    const sessionDataPath = join(userDataPath, SESSION_DATA_DIRECTORY_NAME)
    expect(existsSync(userDataPath)).toBe(true)
    expect(existsSync(sessionDataPath)).toBe(true)
    expect(getRecordedPath('userData')).toBe(userDataPath)
    expect(getRecordedPath('sessionData')).toBe(sessionDataPath)
    expect(existsSync(join(sessionDataPath, REPAIR_MARKER_FILENAME))).toBe(true)
  })

  it('repairs existing Chromium DIPS files once for existing profiles', () => {
    const userDataPath = createTempDirectory()
    const sessionDataPath = join(userDataPath, SESSION_DATA_DIRECTORY_NAME)
    const { appPathManager } = createAppPathManager(userDataPath)

    mkdirSync(sessionDataPath, { recursive: true })
    for (const filename of DIPS_FILENAMES) {
      writeFileSync(join(sessionDataPath, filename), 'corrupt')
    }

    configureAppStoragePaths(appPathManager)

    for (const filename of DIPS_FILENAMES) {
      expect(existsSync(join(sessionDataPath, filename))).toBe(false)
    }
    expect(existsSync(join(sessionDataPath, REPAIR_MARKER_FILENAME))).toBe(true)
  })

  it('does not delete Chromium DIPS files again after the one-time repair marker exists', () => {
    const userDataPath = createTempDirectory()
    const sessionDataPath = join(userDataPath, SESSION_DATA_DIRECTORY_NAME)
    const { appPathManager } = createAppPathManager(userDataPath)

    configureAppStoragePaths(appPathManager)

    const preservedDipsPath = join(sessionDataPath, 'DIPS')
    writeFileSync(preservedDipsPath, 'healthy')

    configureAppStoragePaths(appPathManager)

    expect(existsSync(preservedDipsPath)).toBe(true)
  })
})

describe('legacy userData migration (OpenWaggle -> Turing Machine rename)', () => {
  it('moves the pre-rename profile to the new location', () => {
    // Adding productName to package.json changes Electron's app.getName(), which
    // changes userData. Without this migration every existing install launches
    // to an empty profile.
    const appData = createTempDirectory()
    const legacy = join(appData, 'openwaggle')
    mkdirSync(legacy, { recursive: true })
    writeFileSync(join(legacy, 'settings.db'), 'user-settings')

    const target = join(appData, 'Turing Machine')
    const { appPathManager, getRecordedPath } = createAppPathManager(target)
    configureAppStoragePaths(appPathManager)

    expect(existsSync(join(target, 'settings.db'))).toBe(true)
    expect(readFileSync(join(target, 'settings.db'), 'utf-8')).toBe('user-settings')
    expect(existsSync(legacy)).toBe(false)
    expect(getRecordedPath('userData')).toBe(target)
  })

  it('never overwrites an existing profile', () => {
    // If both exist the new one is authoritative — clobbering it would destroy
    // whatever the user has done since upgrading.
    const appData = createTempDirectory()
    const legacy = join(appData, 'openwaggle')
    mkdirSync(legacy, { recursive: true })
    writeFileSync(join(legacy, 'settings.db'), 'stale')

    const target = join(appData, 'Turing Machine')
    mkdirSync(target, { recursive: true })
    writeFileSync(join(target, 'settings.db'), 'current')

    configureAppStoragePaths(createAppPathManager(target).appPathManager)

    expect(readFileSync(join(target, 'settings.db'), 'utf-8')).toBe('current')
    expect(existsSync(join(legacy, 'settings.db'))).toBe(true)
  })

  it('is a no-op on a clean install', () => {
    const appData = createTempDirectory()
    const target = join(appData, 'Turing Machine')

    configureAppStoragePaths(createAppPathManager(target).appPathManager)

    expect(existsSync(target)).toBe(true)
    expect(existsSync(join(appData, 'openwaggle'))).toBe(false)
  })

  it('does not migrate when an explicit userData override is supplied', () => {
    // OPENWAGGLE_USER_DATA_DIR is used by dev/QA profiles; hijacking a legacy
    // directory into one of those would be surprising and wrong.
    const appData = createTempDirectory()
    const legacy = join(appData, 'openwaggle')
    mkdirSync(legacy, { recursive: true })
    writeFileSync(join(legacy, 'settings.db'), 'user-settings')

    const override = join(appData, 'explicit-profile')
    configureAppStoragePaths(
      createAppPathManager(join(appData, 'Turing Machine')).appPathManager,
      override,
    )

    expect(existsSync(join(override, 'settings.db'))).toBe(false)
    expect(existsSync(join(legacy, 'settings.db'))).toBe(true)
  })
})
