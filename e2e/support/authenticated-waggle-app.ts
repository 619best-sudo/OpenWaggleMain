import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Locator,
  type Page,
} from '@playwright/test'
import type { OpenWaggleApi } from '../../src/shared/types/ipc'
import { MainWindowPage } from '../page-models/main-window.page'

const DEFAULT_AUTH_EMAIL = 'waggle.e2e@example.com'
const DEFAULT_AUTH_PASSWORD = 'password123'
const SIDEBAR_READY_TIMEOUT_MS = 15_000
const SESSION_READY_TIMEOUT_MS = 15_000

const E2E_ENV_KEYS: readonly string[] = [
  'CI',
  'COLORTERM',
  'DISPLAY',
  'HOME',
  'LANG',
  'LC_ALL',
  'LOGNAME',
  'PATH',
  'SHELL',
  'SYSTEMROOT',
  'TERM',
  'TMP',
  'TMPDIR',
  'USER',
  'USERPROFILE',
  'WAYLAND_DISPLAY',
  'XDG_RUNTIME_DIR',
]

function buildElectronEnv(userDataDir: string): Record<string, string> {
  const env: Record<string, string> = {
    OPENWAGGLE_USER_DATA_DIR: userDataDir,
    OPENWAGGLE_DISABLE_SINGLE_INSTANCE: '1',
  }

  for (const key of E2E_ENV_KEYS) {
    const value = process.env[key]
    if (typeof value === 'string' && value.length > 0) {
      env[key] = value
    }
  }

  return env
}

export interface AuthenticatedWaggleAppLaunchOptions {
  readonly projectPath: string
  readonly projectDisplayName?: string
  readonly email?: string
  readonly password?: string
  readonly prefix?: string
}

export interface WagglePresetInstallSnapshot {
  readonly found: boolean
  readonly name?: string
  readonly ready?: boolean
  readonly requiredDependencyCount?: number
  readonly optionalDependencyCount?: number
  readonly missingCount?: number
  readonly unsupportedCount?: number
  readonly optionalMissingCount?: number
  readonly optionalUnsupportedCount?: number
}

export class AuthenticatedWaggleApp {
  private constructor(
    readonly userDataDir: string,
    readonly projectPath: string,
    private app: ElectronApplication,
    private currentWindow: Page,
  ) {}

  static async launch(
    options: AuthenticatedWaggleAppLaunchOptions,
  ): Promise<AuthenticatedWaggleApp> {
    const userDataDir = await fs.mkdtemp(
      path.join(os.tmpdir(), options.prefix ?? 'openwaggle-auth-waggle-e2e-'),
    )

    const app = await electron.launch({
      args: ['.'],
      env: buildElectronEnv(userDataDir),
    })

    const page = await app.firstWindow()
    const instance = new AuthenticatedWaggleApp(userDataDir, options.projectPath, app, page)

    await instance.signIn({
      email: options.email ?? DEFAULT_AUTH_EMAIL,
      password: options.password ?? DEFAULT_AUTH_PASSWORD,
    })
    await instance.selectProject(options.projectPath, options.projectDisplayName)
    await instance.waitUntilWorkspaceReady()

    return instance
  }

  async cleanup(): Promise<void> {
    await this.app.close().catch(() => undefined)
    await fs.rm(this.userDataDir, { recursive: true, force: true })
  }

  window(): Page {
    return this.currentWindow
  }

  mainWindow(): MainWindowPage {
    return new MainWindowPage(this.currentWindow)
  }

  async openTeam(): Promise<void> {
    await this.currentWindow.getByRole('button', { name: 'Team' }).click()
    await this.currentWindow.getByRole('heading', { name: 'Turing', exact: true }).waitFor({
      timeout: SIDEBAR_READY_TIMEOUT_MS,
    })
  }

  async expectPresetVisible(name: string): Promise<void> {
    await expect(this.currentWindow.getByRole('heading', { name, exact: true })).toBeVisible({
      timeout: SIDEBAR_READY_TIMEOUT_MS,
    })
  }

  async launchPreset(name: string): Promise<void> {
    await this.openTeam()
    await this.presetCard(name).getByRole('button', { name: 'Launch' }).click()
    await this.waitForSessionComposer()
  }

  async launchPresetStarterPrompt(name: string, starterPromptTitle: string): Promise<void> {
    await this.openTeam()
    const card = this.presetCard(name)
    await card.getByRole('button', { name: 'Starter Prompts' }).click()
    await this.currentWindow
      .getByRole('button', { name: starterPromptTitle, exact: true })
      .click()
    await this.waitForSessionComposer()
  }

  async composerPreview(limit = 220): Promise<string> {
    return this.mainWindow()
      .messageInput()
      .evaluate((node, textLimit) => (node.textContent || '').slice(0, textLimit), limit)
  }

  async currentUrl(): Promise<string> {
    return this.currentWindow.evaluate(() => window.location.href)
  }

  async getInstallStatusForPresetId(presetId: string): Promise<WagglePresetInstallSnapshot> {
    return this.currentWindow.evaluate(
      async ({ currentProjectPath, currentPresetId }) => {
        const api = (window as unknown as Window & { api: OpenWaggleApi }).api
        const presets = await api.listWagglePresets(currentProjectPath)
        const preset = presets.find((candidate) => String(candidate.id) === currentPresetId)
        if (preset == null) {
          return { found: false }
        }

        const status = await api.getWaggleAppInstallStatus(preset, currentProjectPath)
        return {
          found: true,
          name: preset.name,
          ready: status.ready,
          requiredDependencyCount: status.requiredDependencyCount,
          optionalDependencyCount: status.optionalDependencyCount,
          missingCount: status.missingCount,
          unsupportedCount: status.unsupportedCount,
          optionalMissingCount: status.optionalMissingCount,
          optionalUnsupportedCount: status.optionalUnsupportedCount,
        }
      },
      {
        currentProjectPath: this.projectPath,
        currentPresetId: presetId,
      },
    )
  }

  private presetCard(name: string): Locator {
    return this.currentWindow
      .getByRole('heading', { name, exact: true })
      .locator('xpath=ancestor::div[contains(@class,"group")][1]')
  }

  private async signIn(input: { readonly email: string; readonly password: string }): Promise<void> {
    await this.currentWindow.getByLabel('Email address').waitFor({
      timeout: SIDEBAR_READY_TIMEOUT_MS,
    })
    await this.currentWindow.getByLabel('Email address').fill(input.email)
    await this.currentWindow.getByLabel('Password').fill(input.password)
    await this.currentWindow.getByRole('button', { name: 'Sign In' }).click()
    await this.currentWindow.getByRole('button', { name: 'Team' }).waitFor({
      timeout: SIDEBAR_READY_TIMEOUT_MS,
    })
  }

  private async selectProject(projectPath: string, projectDisplayName?: string): Promise<void> {
    const displayName = projectDisplayName ?? path.basename(projectPath)

    await this.currentWindow.evaluate(
      async ({ currentProjectPath, currentDisplayName }) => {
        const api = (window as unknown as Window & { api: OpenWaggleApi }).api
        await api.updateSettings({
          projectPath: currentProjectPath,
          recentProjects: [currentProjectPath],
          projectDisplayNames: { [currentProjectPath]: currentDisplayName },
        })
      },
      {
        currentProjectPath: projectPath,
        currentDisplayName: displayName,
      },
    )

    await this.currentWindow.reload()
  }

  private async waitUntilWorkspaceReady(): Promise<void> {
    await this.currentWindow.getByRole('button', { name: 'Team' }).waitFor({
      timeout: SIDEBAR_READY_TIMEOUT_MS,
    })
  }

  private async waitForSessionComposer(): Promise<void> {
    await this.currentWindow.waitForFunction(() => window.location.href.includes('#/sessions/'), null, {
      timeout: SESSION_READY_TIMEOUT_MS,
    })
    await this.mainWindow().messageInput().waitFor({ timeout: SESSION_READY_TIMEOUT_MS })
  }
}
