import { WagglePresetId } from '@shared/types/brand'
import { WAGGLE_INHERIT_MODEL, type WaggleConfig, type WagglePreset } from '@shared/types/waggle'
import { describe, expect, it } from 'vitest'
import {
  findWagglePresetForTuringSuggestion,
  getTuringFollowUpSuggestion,
  isTuringConfig,
  parseTuringFollowUpSuggestion,
} from '../turing-follow-up'

function turingConfig(): WaggleConfig {
  return {
    mode: 'sequential',
    agents: [
      {
        label: 'Context Reader',
        model: WAGGLE_INHERIT_MODEL,
        roleDescription: 'Reads the request',
        color: 'blue',
      },
      {
        label: 'Installed Waggle Selector',
        model: WAGGLE_INHERIT_MODEL,
        roleDescription: 'Selects the next waggle',
        color: 'amber',
      },
    ],
    stop: { primary: 'consensus', maxTurnsSafety: 4 },
  }
}

describe('turing-follow-up', () => {
  const presets: WagglePreset[] = [
    {
      id: WagglePresetId('product-ui'),
      name: 'Product UI',
      description: 'Builds product-facing UI',
      config: turingConfig(),
      app: { requiredMcps: [], requiredSkills: [] },
      isBuiltIn: true,
      createdAt: 0,
      updatedAt: 0,
    },
    {
      id: WagglePresetId('web-engineer'),
      name: 'Web Engineer',
      description: 'Builds and verifies web changes',
      config: turingConfig(),
      app: { requiredMcps: [], requiredSkills: [] },
      isBuiltIn: true,
      createdAt: 0,
      updatedAt: 0,
    },
  ]

  it('recognizes the Turing config by agent labels', () => {
    expect(isTuringConfig(turingConfig())).toBe(true)
    expect(
      isTuringConfig({
        ...turingConfig(),
        agents: [{ ...turingConfig().agents[0], label: 'Planner' }, turingConfig().agents[1]],
      }),
    ).toBe(false)
  })

  it('parses the selected next waggle and example prompt fields', () => {
    expect(
      parseTuringFollowUpSuggestion(`
- selected next Waggle: product-planning
- why it is installed and ready: no missing dependencies
- agent 1 mission: scope the work
- agent 2 mission: challenge the scope
- example next prompt: Review the auth files and write the MVP plan.
- fallback Waggle if needed: code-review
      `),
    ).toEqual({
      nextWaggle: 'product-planning',
      examplePrompt: 'Review the auth files and write the MVP plan.',
      fallbackWaggle: 'code-review',
    })
  })

  it('returns the last parsable assistant suggestion only for completed Turing runs', () => {
    expect(
      getTuringFollowUpSuggestion({
        waggleStatus: 'completed',
        config: turingConfig(),
        messages: [
          {
            id: 'u1',
            role: 'user',
            parts: [{ type: 'text', content: 'Help me route this task' }],
          },
          {
            id: 'a1',
            role: 'assistant',
            parts: [
              {
                type: 'text',
                content:
                  '- selected next Waggle: product-planning\n- example next prompt: Review auth and define the MVP scope.\n- fallback Waggle if needed: code-review',
              },
            ],
          },
        ],
      }),
    ).toEqual({
      nextWaggle: 'product-planning',
      examplePrompt: 'Review auth and define the MVP scope.',
      fallbackWaggle: 'code-review',
    })
  })

  it('matches a suggested preset by exact id or display name', () => {
    expect(
      findWagglePresetForTuringSuggestion(presets, {
        nextWaggle: 'web-engineer',
        examplePrompt: 'Ship the homepage refresh.',
        fallbackWaggle: null,
      }),
    ).toEqual(presets[1])

    expect(
      findWagglePresetForTuringSuggestion(presets, {
        nextWaggle: '`Product UI`',
        examplePrompt: 'Refresh the product hero.',
        fallbackWaggle: null,
      }),
    ).toEqual(presets[0])
  })

  it('falls back to fuzzy matching when the suggestion includes extra commentary', () => {
    expect(
      findWagglePresetForTuringSuggestion(presets, {
        nextWaggle:
          '`Product UI` · fallback `Web Engineer` (requires verifying ReactDOM/Webpack availability in node_modules)',
        examplePrompt: 'Design a hero section.',
        fallbackWaggle: 'Web Engineer',
      }),
    ).toEqual(presets[0])
  })
})
