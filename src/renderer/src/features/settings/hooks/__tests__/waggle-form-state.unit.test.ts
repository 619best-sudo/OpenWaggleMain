import { SupportedModelId, WagglePresetId } from '@shared/types/brand'
import { WAGGLE_INHERIT_MODEL, type WagglePreset } from '@shared/types/waggle'
import { describe, expect, it } from 'vitest'
import {
  buildWaggleAppManifest,
  buildWaggleConfig,
  formMatchesPreset,
  INITIAL_WAGGLE_FORM_STATE,
  INITIAL_WAGGLE_PRESET_STATE,
  waggleFormReducer,
  wagglePresetReducer,
} from '../waggle-form-state'

function makePreset(): WagglePreset {
  return {
    id: WagglePresetId('preset-1'),
    name: 'Pair',
    description: 'Two-agent workflow',
    isBuiltIn: false,
    createdAt: 1,
    updatedAt: 1,
    config: {
      mode: 'sequential',
      agents: [
        {
          label: 'Planner',
          model: SupportedModelId('anthropic/claude-sonnet-4-5'),
          roleDescription: 'Plans the work',
          color: 'blue',
        },
        {
          label: 'Reviewer',
          model: SupportedModelId('openai/gpt-4o'),
          roleDescription: 'Reviews the result',
          color: 'amber',
        },
      ],
      stop: { primary: 'consensus', maxTurnsSafety: 8 },
    },
    app: {
      requiredMcps: ['playwright'],
      requiredSkills: ['ui-critic'],
    },
  }
}

describe('waggle form state reducers', () => {
  it('builds a Waggle config from editable form state', () => {
    const config = buildWaggleConfig(INITIAL_WAGGLE_FORM_STATE)

    expect(config).toMatchObject({
      mode: 'sequential',
      stop: { primary: 'consensus', maxTurnsSafety: 8 },
    })
    expect(config.agents.map((agent) => agent.label)).toEqual(['Agent 1', 'Agent 2'])
    expect(config.agents.map((agent) => agent.model)).toEqual([
      WAGGLE_INHERIT_MODEL,
      WAGGLE_INHERIT_MODEL,
    ])
  })

  it('builds prompt-gated agent slots from keyword input', () => {
    const updated = waggleFormReducer(INITIAL_WAGGLE_FORM_STATE, {
      type: 'set-agent-run-condition-terms',
      index: 1,
      value: 'animation\nmotion\nanimation',
    })

    expect(updated.agents[1]).toMatchObject({
      runCondition: {
        type: 'prompt-match',
        anyOf: ['animation', 'motion'],
      },
    })
    expect(buildWaggleConfig(updated).agents[1]).toMatchObject({
      runCondition: {
        type: 'prompt-match',
        anyOf: ['animation', 'motion'],
      },
    })
  })

  it('builds an app manifest from dependency inputs', () => {
    const app = buildWaggleAppManifest({
      ...INITIAL_WAGGLE_FORM_STATE,
      requiredMcpsText: 'playwright\npostgres\nplaywright\n',
      requiredSkillsText: 'ui-critic\nbackend-auditor\n',
    })

    expect(app).toEqual({
      requiredMcps: ['playwright', 'postgres'],
      requiredSkills: ['ui-critic', 'backend-auditor'],
    })
  })

  it('detects whether a form config and app manifest still match a preset exactly', () => {
    const preset = makePreset()
    const matchingState = {
      agents: preset.config.agents,
      mode: preset.config.mode,
      stopCondition: preset.config.stop.primary,
      maxTurns: preset.config.stop.maxTurnsSafety,
      requiredMcpsText: 'playwright',
      requiredSkillsText: 'ui-critic',
    }
    expect(formMatchesPreset(matchingState, preset)).toBe(true)

    expect(
      formMatchesPreset(
        {
          ...matchingState,
          agents: [{ ...preset.config.agents[0], label: 'Changed' }, preset.config.agents[1]],
        },
        preset,
      ),
    ).toBe(false)
  })

  it('loads a preset config into form state', () => {
    const preset = makePreset()

    expect(waggleFormReducer(INITIAL_WAGGLE_FORM_STATE, { type: 'load-preset', preset })).toEqual({
      agents: preset.config.agents,
      mode: preset.config.mode,
      stopCondition: preset.config.stop.primary,
      maxTurns: preset.config.stop.maxTurnsSafety,
      requiredMcpsText: 'playwright',
      requiredSkillsText: 'ui-critic',
    })
  })

  it('updates a single agent without replacing the other slot', () => {
    const updated = waggleFormReducer(INITIAL_WAGGLE_FORM_STATE, {
      type: 'set-agent-label',
      index: 1,
      label: 'Critic',
    })

    expect(updated.agents[0]).toBe(INITIAL_WAGGLE_FORM_STATE.agents[0])
    expect(updated.agents[1].label).toBe('Critic')
  })

  it('updates stop controls independently from agent slots', () => {
    const withStop = waggleFormReducer(INITIAL_WAGGLE_FORM_STATE, {
      type: 'set-stop-condition',
      stopCondition: 'user-stop',
    })
    const withTurns = waggleFormReducer(withStop, { type: 'set-max-turns', maxTurns: 12 })

    expect(withTurns.stopCondition).toBe('user-stop')
    expect(withTurns.maxTurns).toBe(12)
    expect(withTurns.agents).toBe(INITIAL_WAGGLE_FORM_STATE.agents)
  })

  it('adds and removes agents while preserving the minimum pair', () => {
    const withThirdAgent = waggleFormReducer(INITIAL_WAGGLE_FORM_STATE, { type: 'add-agent' })

    expect(withThirdAgent.agents).toHaveLength(3)
    expect(withThirdAgent.agents[2]).toMatchObject({
      label: 'Agent 3',
      model: WAGGLE_INHERIT_MODEL,
      color: 'emerald',
    })

    const removed = waggleFormReducer(withThirdAgent, { type: 'remove-agent', index: 1 })
    expect(removed.agents.map((agent) => agent.label)).toEqual(['Agent 1', 'Agent 3'])

    const stillTwoAgents = waggleFormReducer(INITIAL_WAGGLE_FORM_STATE, {
      type: 'remove-agent',
      index: 0,
    })
    expect(stillTwoAgents.agents).toHaveLength(2)
  })

  it('tracks selected preset and clears errors after successful save', () => {
    const withError = wagglePresetReducer(INITIAL_WAGGLE_PRESET_STATE, {
      type: 'set-error',
      error: 'Save failed',
    })
    const saved = wagglePresetReducer(withError, {
      type: 'save-success',
      activePresetId: 'preset-1',
    })

    expect(saved).toEqual({ activePresetId: 'preset-1', error: null })
    expect(wagglePresetReducer(saved, { type: 'clear-active-preset' }).activePresetId).toBeNull()
  })
})
