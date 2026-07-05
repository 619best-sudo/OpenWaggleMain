import { WagglePresetId } from '@shared/types/brand'
import type { WagglePreset } from '@shared/types/waggle'
import { WAGGLE_INHERIT_MODEL } from '@shared/types/waggle'

export const PROJECT_PATH = '/tmp/openwaggle-project'

export function createPreset(overrides?: Partial<WagglePreset>) {
  return {
    id: WagglePresetId('debate'),
    name: 'Review Panel',
    description: 'Custom: Finds regressions before they land.',
    config: {
      mode: 'sequential',
      agents: [
        {
          label: 'Reviewer',
          model: WAGGLE_INHERIT_MODEL,
          roleDescription: 'Finds regressions before they land.',
          color: 'blue',
        },
        {
          label: 'Implementer',
          model: WAGGLE_INHERIT_MODEL,
          roleDescription: 'Shapes the implementation details.',
          color: 'amber',
        },
      ],
      stop: { primary: 'consensus', maxTurnsSafety: 8 },
    },
    app: {
      requiredMcps: ['playwright', 'postgres'],
      requiredSkills: ['ui-critic'],
    },
    isBuiltIn: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } satisfies WagglePreset
}
