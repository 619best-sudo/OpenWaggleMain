import { describe, expect, it } from 'vitest'
import type { WaggleConfig } from '../config'
import {
  parseWaggleConfig,
  resolveWaggleConfigForPrompt,
  WAGGLE_INHERIT_MODEL,
} from '../config'
import { evaluateConsensus } from '../consensus'
import { validateWaggleTurnOutput } from '../output-contract'
import { BUILT_IN_WAGGLE_PRESETS, mergeWagglePresets } from '../presets'
import { buildWaggleTurnPrompt } from '../prompts'
import { completeWaggleTurn, startWaggleRun } from '../state'
import { decideNextWaggleTurn, getWaggleTurnAgentIndex } from '../turn-policy'

const FIRST_AGENT_INDEX = 0
const SECOND_AGENT_INDEX = 1
const THIRD_AGENT_INDEX = 2
const MAX_TURNS_SAFETY = 3
const FIRST_TURN = 0
const SECOND_TURN = 1
const THIRD_TURN = 2
const FOURTH_TURN = 3
const LOW_CONFIDENCE = 0.2
const HIGH_CONFIDENCE = 0.9

function config(): WaggleConfig {
  return {
    mode: 'sequential',
    agents: [
      {
        label: 'Architect',
        model: 'provider/architect',
        roleDescription: 'Designs the plan.',
        color: 'blue',
      },
      {
        label: 'Reviewer',
        model: 'provider/reviewer',
        roleDescription: 'Checks the plan.',
        color: 'amber',
      },
    ],
    stop: { primary: 'consensus', maxTurnsSafety: MAX_TURNS_SAFETY },
  }
}

function threeAgentConfig(): WaggleConfig {
  return {
    ...config(),
    agents: [
      ...config().agents,
      {
        label: 'Mediator',
        model: 'provider/mediator',
        roleDescription: 'Synthesizes the strongest points.',
        color: 'emerald',
      },
    ],
  }
}

describe('waggle-core', () => {
  it('validates Waggle config input', () => {
    const result = parseWaggleConfig(config())

    expect(result.success).toBe(true)
    expect(result.success ? result.value.agents[FIRST_AGENT_INDEX].label : null).toBe('Architect')
  })

  it('rejects invalid Waggle config input with readable issues', () => {
    const result = parseWaggleConfig({ ...config(), agents: [] })

    expect(result.success).toBe(false)
    expect(result.success ? [] : result.issues).toContain(
      'agents must contain at least 2 agent slots.',
    )
  })

  it('accepts manually edited configs with a third agent', () => {
    const result = parseWaggleConfig(threeAgentConfig())

    expect(result.success).toBe(true)
  })

  it('accepts explicit inherited model bindings and rejects blank model refs', () => {
    const inherited = parseWaggleConfig({
      ...config(),
      agents: [
        { ...config().agents[0], model: WAGGLE_INHERIT_MODEL },
        { ...config().agents[1], model: WAGGLE_INHERIT_MODEL },
      ],
    })
    const blank = parseWaggleConfig({
      ...config(),
      agents: [{ ...config().agents[0], model: '' }, config().agents[1]],
    })

    expect(inherited.success).toBe(true)
    expect(blank.success).toBe(false)
    expect(blank.success ? [] : blank.issues).toContain(
      `agents[0].model must be ${WAGGLE_INHERIT_MODEL} or a provider/model id.`,
    )
  })

  it('accepts prompt-gated agent slots and normalizes their trigger terms', () => {
    const result = parseWaggleConfig({
      ...threeAgentConfig(),
      agents: [
        threeAgentConfig().agents[0],
        {
          ...threeAgentConfig().agents[1],
          runCondition: {
            type: 'prompt-match',
            anyOf: [' Animation ', 'motion'],
          },
        },
        threeAgentConfig().agents[2],
      ],
    })

    expect(result.success).toBe(true)
    expect(result.success ? result.value.agents[1]?.runCondition?.anyOf : []).toEqual([
      'animation',
      'motion',
    ])
  })

  it('accepts optional loop and output contracts and normalizes required labels', () => {
    const result = parseWaggleConfig({
      ...config(),
      agents: [
        {
          ...config().agents[0],
          outputContract: { requiredSections: [' Progress ', 'FILES_CHANGED'] },
        },
        config().agents[1],
      ],
      loopContract: {
        firstQaGate: ['visible play surface', 'controllable core interaction'],
        failureCategories: [' Bootstrap ', 'qa-evidence'],
        placeholderPolicy: 'prefer-placeholders-over-blocking',
      },
    })

    expect(result.success).toBe(true)
    expect(result.success ? result.value.agents[0]?.outputContract?.requiredSections : []).toEqual([
      'progress',
      'files_changed',
    ])
    expect(result.success ? result.value.loopContract?.failureCategories : []).toEqual([
      'bootstrap',
      'qa-evidence',
    ])
  })

  it('rotates sequential turn ownership across all configured agents', () => {
    const waggleConfig = threeAgentConfig()

    expect(getWaggleTurnAgentIndex(waggleConfig, FIRST_TURN)).toBe(FIRST_AGENT_INDEX)
    expect(getWaggleTurnAgentIndex(waggleConfig, SECOND_TURN)).toBe(SECOND_AGENT_INDEX)
    expect(getWaggleTurnAgentIndex(waggleConfig, THIRD_TURN)).toBe(THIRD_AGENT_INDEX)
    expect(getWaggleTurnAgentIndex(waggleConfig, FOURTH_TURN)).toBe(FIRST_AGENT_INDEX)
  })

  it('filters prompt-gated slots once per run without skipping unrelated agents', () => {
    const configured = {
      ...threeAgentConfig(),
      agents: [
        threeAgentConfig().agents[0],
        {
          ...threeAgentConfig().agents[1],
          runCondition: { type: 'prompt-match' as const, anyOf: ['Animation'] },
        },
        threeAgentConfig().agents[2],
      ],
    }

    expect(resolveWaggleConfigForPrompt(configured, 'Build the feature').agents.map((agent) => agent.label)).toEqual([
      'Architect',
      'Mediator',
    ])
    expect(
      resolveWaggleConfigForPrompt(configured, 'Build the feature with animation').agents.map(
        (agent) => agent.label,
      ),
    ).toEqual(['Architect', 'Reviewer', 'Mediator'])
  })

  it('keeps the original agent order when filtering would drop below a pair', () => {
    const configured = {
      ...config(),
      agents: [
        {
          ...config().agents[0],
          runCondition: { type: 'prompt-match' as const, anyOf: ['animation'] },
        },
        config().agents[1],
      ],
    }

    expect(resolveWaggleConfigForPrompt(configured, 'Build the feature').agents.map((agent) => agent.label)).toEqual([
      'Architect',
      'Reviewer',
    ])
  })

  it('builds role-aware turn prompts', () => {
    const prompt = buildWaggleTurnPrompt({
      config: config(),
      turnNumber: SECOND_TURN,
      userPrompt: 'Review the repository architecture.',
    })

    expect(prompt).toContain('You are "Reviewer". Checks the plan.')
    expect(prompt).toContain('You are collaborating with "Architect"')
    expect(prompt).toContain('Review the session above and continue the collaboration.')
    expect(prompt).toContain('User request:\nReview the repository architecture.')
  })

  it('injects runtime loop and output contracts into turn prompts', () => {
    const prompt = buildWaggleTurnPrompt({
      config: {
        ...config(),
        agents: [
          {
            ...config().agents[0],
            outputContract: { requiredSections: ['progress', 'files_changed'] },
          },
          config().agents[1],
        ],
        loopContract: {
          firstQaGate: ['visible play surface'],
          failureCategories: ['bootstrap', 'qa-evidence'],
          placeholderPolicy: 'prefer-placeholders-over-blocking',
        },
      },
      turnNumber: FIRST_TURN,
      userPrompt: 'Build the prototype.',
    })

    expect(prompt).toContain('Shared loop contract:')
    expect(prompt).toContain('prefer placeholders over blocking the cycle')
    expect(prompt).toContain('visible play surface')
    expect(prompt).toContain('bootstrap, qa-evidence')
    expect(prompt).toContain('Output contract:')
    expect(prompt).toContain('- progress:')
    expect(prompt).toContain('- files_changed:')
  })

  it('validates required output contract sections for the active turn', () => {
    const result = validateWaggleTurnOutput({
      config: {
        ...config(),
        agents: [
          {
            ...config().agents[0],
            outputContract: { requiredSections: ['progress', 'files_changed'] },
          },
          config().agents[1],
        ],
      },
      turnNumber: FIRST_TURN,
      responseText: 'progress: bootstrapped app\nfiles_changed: src/main.tsx',
    })

    expect(result).toEqual({ valid: true, missingSections: [] })
  })

  it('accepts human-friendly section aliases for output contracts', () => {
    const result = validateWaggleTurnOutput({
      config: {
        ...config(),
        agents: [
          {
            ...config().agents[0],
            outputContract: {
              requiredSections: ['progress', 'files_changed', 'commands_run', 'next_task'],
            },
          },
          config().agents[1],
        ],
      },
      turnNumber: FIRST_TURN,
      responseText:
        'Progress: built the board\nFiles changed: server.js public/game.js\nCommands run: npm install\nNext task: implement turn logic',
    })

    expect(result).toEqual({ valid: true, missingSections: [] })
  })

  it('accepts the ludo-style world builder response shape', () => {
    const result = validateWaggleTurnOutput({
      config: {
        ...config(),
        agents: [
          {
            ...config().agents[0],
            outputContract: {
              requiredSections: [
                'progress',
                'files_changed',
                'commands_run',
                'artifacts',
                'blockers',
                'next_task',
              ],
            },
          },
          config().agents[1],
        ],
      },
      turnNumber: FIRST_TURN,
      responseText: `Progress: Created Ludo board visualization with CSS styling and JavaScript implementation
Files changed: server.js public/style.css public/game.js package.json
Commands run: npm install express node server.js
Artifacts:
- Ludo board SVG data in memory
- Player piece handling logic
- Dice roll random number generator
Blockers:
- Missing starting positions for pieces
- No track pointer system for player turns
- No win condition check
- No Ludo rules implementation
Next task: Implement player turn management with track pointer UI, create starting positions for each player, add dice roll animation, and add basic win detection logic`,
    })

    expect(result).toEqual({ valid: true, missingSections: [] })
  })

  it('reports missing output contract sections for the active turn', () => {
    const result = validateWaggleTurnOutput({
      config: {
        ...config(),
        agents: [
          {
            ...config().agents[0],
            outputContract: { requiredSections: ['progress', 'files_changed'] },
          },
          config().agents[1],
        ],
      },
      turnNumber: FIRST_TURN,
      responseText: 'progress: bootstrapped app',
    })

    expect(result).toEqual({ valid: false, missingSections: ['files_changed'] })
  })

  it('lists all collaborators when more than two agents are configured', () => {
    const prompt = buildWaggleTurnPrompt({
      config: threeAgentConfig(),
      turnNumber: THIRD_TURN,
      userPrompt: 'Reach a final decision.',
    })

    expect(prompt).toContain('You are "Mediator". Synthesizes the strongest points.')
    expect(prompt).toContain('You are collaborating with 2 other agents')
    expect(prompt).toContain('"Architect" (Designs the plan.)')
    expect(prompt).toContain('"Reviewer" (Checks the plan.)')
  })

  it('stops after the configured turn limit', () => {
    const decision = decideNextWaggleTurn(config(), { turnNumber: THIRD_TURN })

    expect(decision).toEqual({ continue: false, reason: 'turn-limit' })
  })

  it('advances run state when collaboration continues', () => {
    const initial = startWaggleRun({ config: config(), sessionId: 'waggle-session' })
    const next = completeWaggleTurn(initial, { turnNumber: FIRST_TURN })

    expect(next.status).toBe('running')
    expect(next.completedTurns).toHaveLength(SECOND_TURN)
    expect(next.currentTurn?.agentLabel).toBe('Reviewer')
  })

  it('completes run state when consensus is reached', () => {
    const initial = startWaggleRun({ config: config() })
    const next = completeWaggleTurn(initial, {
      turnNumber: FIRST_TURN,
      consensusReached: true,
    })

    expect(next.status).toBe('complete')
    expect(next.stopReason).toBe('consensus')
    expect(next.currentTurn).toBeNull()
  })

  it('ships built-in presets with Pi-native IDs', () => {
    expect(BUILT_IN_WAGGLE_PRESETS.map((preset) => preset.id)).toEqual([
      'code-review',
      'debate',
      'red-team',
    ])
  })

  it('ships a ripple-effect-first code review preset contract', () => {
    const preset = BUILT_IN_WAGGLE_PRESETS.find((candidate) => candidate.id === 'code-review')

    expect(preset).toMatchObject({
      name: 'Code Review',
      description: expect.stringContaining('blast radius'),
      config: {
        agents: [
          {
            label: 'Architect',
            outputContract: {
              requiredSections: [
                'primary findings',
                'ripple effects to inspect',
                'edge cases at risk',
                'test and coverage gaps',
                'recommended fixes',
              ],
            },
          },
          {
            label: 'Reviewer',
            outputContract: {
              requiredSections: [
                'validated findings',
                'new ripple-effect findings',
                'edge cases verified',
                'residual risks',
                'merge recommendation',
              ],
            },
          },
        ],
      },
    })
    expect(preset?.config.agents[0]?.roleDescription).toContain(
      'Your highest priority is ripple-effect analysis',
    )
    expect(preset?.config.agents[0]?.roleDescription).toContain('High-priority ripple paths:')
    expect(preset?.config.agents[1]?.roleDescription).toContain(
      'Your highest priority is to verify or refute ripple effects',
    )
    expect(preset?.config.agents[1]?.roleDescription).toContain(
      'When auditing ripple effects, explicitly look for:',
    )
  })

  it('injects code review output contracts into both review passes', () => {
    const preset = BUILT_IN_WAGGLE_PRESETS.find((candidate) => candidate.id === 'code-review')
    if (!preset) throw new Error('Expected code-review preset')

    const architectPrompt = buildWaggleTurnPrompt({
      config: preset.config,
      turnNumber: FIRST_TURN,
      userPrompt: 'Review a refactor for regressions.',
    })
    const reviewerPrompt = buildWaggleTurnPrompt({
      config: preset.config,
      turnNumber: SECOND_TURN,
      userPrompt: 'Review a refactor for regressions.',
    })

    expect(architectPrompt).toContain('Your highest priority is ripple-effect analysis')
    expect(architectPrompt).toContain('Output contract:')
    expect(architectPrompt).toContain('- ripple effects to inspect:')
    expect(architectPrompt).toContain('- test and coverage gaps:')

    expect(reviewerPrompt).toContain('Your highest priority is to verify or refute ripple effects')
    expect(reviewerPrompt).toContain('Review the session above and continue the collaboration.')
    expect(reviewerPrompt).toContain('- new ripple-effect findings:')
    expect(reviewerPrompt).toContain('- merge recommendation:')
  })

  it('merges presets with project presets taking precedence', () => {
    const [builtIn] = BUILT_IN_WAGGLE_PRESETS
    if (!builtIn) throw new Error('Expected built-in Waggle preset')
    const projectPreset = { ...builtIn, name: 'Project override', isBuiltIn: false }

    const result = mergeWagglePresets({
      builtIns: [builtIn],
      projectPresets: [projectPreset],
    })

    expect(result).toEqual([projectPreset])
  })

  it('evaluates consensus from the strongest signal', () => {
    const result = evaluateConsensus([
      { type: 'no-new-information', confidence: LOW_CONFIDENCE, reason: 'Still diverging.' },
      { type: 'explicit-agreement', confidence: HIGH_CONFIDENCE, reason: 'Both agents agree.' },
    ])

    expect(result).toMatchObject({
      reached: true,
      confidence: HIGH_CONFIDENCE,
      reason: 'Both agents agree.',
    })
  })
})
