import { expect, test } from '@playwright/test'
import { AuthenticatedWaggleApp } from './support/authenticated-waggle-app'

test('waggle app launch smoke reuses the authenticated Team flow for the core built-ins', async () => {
  const app = await AuthenticatedWaggleApp.launch({
    projectPath: process.cwd(),
    projectDisplayName: 'OpenWaggleMain',
    prefix: 'openwaggle-waggle-launch-e2e-',
  })

  try {
    for (const presetName of [
      'Turing',
      'Web Engineer',
      'Quality Assurance Engineer',
      'Debugger And Fix',
    ]) {
      await app.openTeam()
      await app.expectPresetVisible(presetName)
    }

    const turingStatus = await app.getInstallStatusForPresetId('turing')
    expect(turingStatus).toEqual(
      expect.objectContaining({
        found: true,
        ready: true,
        requiredDependencyCount: 0,
        optionalDependencyCount: 0,
      }),
    )

    const webEngineerStatus = await app.getInstallStatusForPresetId('web-engineer')
    expect(webEngineerStatus).toEqual(
      expect.objectContaining({
        found: true,
        ready: true,
        requiredDependencyCount: 1,
      }),
    )

    const qualityAssuranceStatus = await app.getInstallStatusForPresetId(
      'quality-assurance-engineer',
    )
    expect(qualityAssuranceStatus).toEqual(
      expect.objectContaining({
        found: true,
        ready: true,
        requiredDependencyCount: 0,
      }),
    )

    const debuggerStatus = await app.getInstallStatusForPresetId('qa-debug')
    expect(debuggerStatus).toEqual(
      expect.objectContaining({
        found: true,
        ready: true,
        requiredDependencyCount: 0,
      }),
    )

    await app.launchPreset('Turing')
    await expect.poll(() => app.currentUrl()).toContain('#/sessions/')

    await app.launchPresetStarterPrompt('Web Engineer', 'Landing page refresh')
    await expect.poll(() => app.composerPreview()).toContain(
      'Plan, implement, animate if justified, and verify a landing page or homepage refresh',
    )

    await app.launchPresetStarterPrompt(
      'Quality Assurance Engineer',
      'Web QA and regressions',
    )
    await expect.poll(() => app.composerPreview()).toContain(
      'Run a complete web QA cycle for this change.',
    )

    await app.launchPresetStarterPrompt('Debugger And Fix', 'UI layout bug')
    await expect.poll(() => app.composerPreview()).toContain(
      'Debug and fix a UI issue in this repository.',
    )
  } finally {
    await app.cleanup()
  }
})
