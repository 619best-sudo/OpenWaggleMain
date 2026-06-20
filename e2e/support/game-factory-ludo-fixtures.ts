import fs from 'node:fs/promises'
import path from 'node:path'
import { BUILT_IN_WAGGLE_PRESETS } from '../../src/main/adapters/settings-waggle-presets-built-ins'
import type { WagglePreset } from '../../src/shared/types/waggle'
import { seedSingleSession } from './session-fixtures'

export const GAME_FACTORY_LUDO_THREAD_TITLE = 'Game Factory Ludo UI QA'
export const GAME_FACTORY_LUDO_PROMPT =
  'Build a polished browser-based Ludo game in the already selected project using Game Factory waggle.'
export const GAME_FACTORY_LUDO_PROJECT_LABEL = 'ludo-selected-project'

const GAME_FACTORY_PRESET = BUILT_IN_WAGGLE_PRESETS.find((preset) => preset.id === 'game-factory')

if (!GAME_FACTORY_PRESET) {
  throw new Error('Expected built-in Game Factory waggle preset')
}

const QA_SCREENSHOT_NAME = 'ludo-cycle-1-board.png'
const QA_LOG_NAME = 'ludo-cycle-1-console.log'

export const GAME_FACTORY_LUDO_TURN_LABELS = GAME_FACTORY_PRESET.config.agents.map(
  (agent: WagglePreset['config']['agents'][number], index: number) =>
    `Turn ${String(index + 1)}: ${agent.label}`,
)

export const GAME_FACTORY_LUDO_TURN_CONTENTS = [
  `game mode: 2D
current milestone: runnable Ludo vertical slice
acceptance criteria:
- local multiplayer board visible
- dice roll button works
- four player colors visible
- first turn can start in browser
must-have scope now:
- board
- pieces
- dice button
- turn banner
- placeholder move logic
explicit cuts:
- network multiplayer
- advanced animations
- AI opponents
next handoff: Skeleton / Prototype Builder should create the runnable Ludo shell with placeholder board and controls
progress: planned the first playable Ludo slice for the selected project
files_changed: none
commands_run: none
artifacts: none
blockers: none
next_task: build the runnable board, pieces, and turn banner in the selected project`,
  `Progress: Created the runnable Ludo shell with CSS styling, player color zones, and placeholder board layout
Files changed: package.json index.html src/main.ts src/ludo-board.css src/ludo-board.ts
Commands run: pnpm install; pnpm build
Artifacts: none
Blockers:
- Piece starting positions still use placeholders
- Dice animation is static
Next task: World / Environment Builder should add the visible board finish, safe zones, and environment-facing presentation polish`,
  `Progress: Added the visible Ludo board finish, home zones, and clearer player color presentation
Files changed: src/ludo-board.css src/ludo-board.ts src/theme.ts
Commands run: pnpm build
Artifacts: none
Blockers:
- Pawn art is still placeholder-only
- Dice feedback is still static
Next task: Character / Actor Builder should add the player pawns, local interaction feedback, and controllable actor cues`,
  `Progress: Added player pawns, local piece interaction feedback, dice-roll response, and controllable actor cues
Files changed: src/pieces.ts src/dice.ts src/actor-feedback.ts src/game-state.ts
Commands run: pnpm build
Artifacts: none
Blockers:
- Full Ludo capture and home-lane edge cases are incomplete
- Pawn automation selectors still need hardening
Next task: QA / Runtime Governor should open the game, roll the dice, move pieces, and report browser evidence`,
  `Loop verdict: another cycle required
Failure categories: character-actor, qa-evidence
Top blockers:
- Dice roll works but capture messaging is unclear
- Piece pathing still skips one home-lane edge case
- Pawn interaction needs stronger selectors for reliable automation
Evidence reviewed:
- pnpm build succeeded
- board renders in browser
- turn banner updates after dice roll
Screenshots:
- ${QA_SCREENSHOT_NAME}
Logs:
- ${QA_LOG_NAME}
Exact next cycle: tighten piece path rules, add clearer capture feedback, add stable selectors on pawn controls, and retest one full round`,
] as const

export async function makeGameFactoryLudoSession(userDataDir: string): Promise<void> {
  const now = Date.now()
  const projectPath = path.join(userDataDir, GAME_FACTORY_LUDO_PROJECT_LABEL)
  await fs.mkdir(projectPath, { recursive: true })

  const assistantMessages = GAME_FACTORY_PRESET.config.agents.map(
    (agent: WagglePreset['config']['agents'][number], index: number) => ({
      id: `game-factory-ludo-assistant-${String(index + 1)}`,
      role: 'assistant' as const,
      model: String(agent.model),
      metadata: {
        waggle: {
          agentIndex: index,
          agentLabel: agent.label,
          agentColor: agent.color,
          agentModel: String(agent.model),
          turnNumber: index,
        },
      },
      parts: [{ type: 'text' as const, text: GAME_FACTORY_LUDO_TURN_CONTENTS[index] }],
      createdAt: now - (GAME_FACTORY_PRESET.config.agents.length - index),
    }),
  )

  await seedSingleSession(userDataDir, {
    title: GAME_FACTORY_LUDO_THREAD_TITLE,
    updatedAt: now,
    projectPath,
    waggleConfig: GAME_FACTORY_PRESET.config,
    messages: [
      {
        id: 'game-factory-ludo-user-1',
        role: 'user',
        parts: [{ type: 'text', text: GAME_FACTORY_LUDO_PROMPT }],
        createdAt: now - 10,
      },
      ...assistantMessages,
    ],
  })
}
