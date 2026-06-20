import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { OpenWaggleApp } from './support/openwaggle-app'
import {
  GAME_FACTORY_LUDO_PROJECT_LABEL,
  GAME_FACTORY_LUDO_PROMPT,
  GAME_FACTORY_LUDO_THREAD_TITLE,
  GAME_FACTORY_LUDO_TURN_CONTENTS,
  GAME_FACTORY_LUDO_TURN_LABELS,
  makeGameFactoryLudoSession,
} from './support/game-factory-ludo-fixtures'

test('game factory renders a selected-project ludo cycle across all five agents', async () => {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openwaggle-game-factory-ludo-e2e-'))
  await makeGameFactoryLudoSession(userDataDir)
  const app = await OpenWaggleApp.launchWithUserDataDir(userDataDir)

  try {
    const mainWindow = app.mainWindow()
    await mainWindow.openThread(GAME_FACTORY_LUDO_THREAD_TITLE)

    await mainWindow.expectTextVisible(GAME_FACTORY_LUDO_PROMPT)
    await expect(mainWindow.page.getByTitle('Open project picker')).toContainText(
      GAME_FACTORY_LUDO_PROJECT_LABEL,
    )
    await expect(mainWindow.page.getByText('No projects yet')).toBeHidden()

    for (const expectedContent of GAME_FACTORY_LUDO_TURN_CONTENTS) {
      await mainWindow.expectTextVisible(expectedContent)
    }

    const turnLabels = await app.window().evaluate(() =>
      Array.from(document.querySelectorAll('[role="log"] [data-waggle-turn-label="true"]'))
        .map((node) => node.textContent?.trim() ?? '')
        .filter((text) => /^Turn \d+:/.test(text)),
    )

    expect(turnLabels).toEqual([...GAME_FACTORY_LUDO_TURN_LABELS])
  } finally {
    await app.cleanup()
  }
})
