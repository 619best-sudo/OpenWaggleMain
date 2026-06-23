import { SupportedModelId } from '@shared/types/brand'
import { Layer } from 'effect'
import * as Effect from 'effect/Effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderProbeService } from '../../ports/provider-probe-service'
import { ProviderService } from '../../ports/provider-service'
import { generateTeamAgent } from '../team-agent-generator-service'

const getProviderForModelMock = vi.fn()
const generateTextMock = vi.fn()

const TestProviderLayer = Layer.succeed(ProviderService, {
  get: () => Effect.succeed(undefined),
  getAll: () => Effect.succeed([]),
  getProviderForModel: (modelId) =>
    Effect.sync(() =>
      getProviderForModelMock(modelId) ?? {
        id: 'openai',
        displayName: 'OpenAI',
        auth: {
          configured: true,
          source: 'environment-or-custom',
          apiKeyConfigured: true,
          apiKeySource: 'environment-or-custom',
          oauthConnected: false,
          supportsApiKey: true,
          supportsOAuth: false,
        },
        models: [],
        testModel: modelId,
      },
    ),
  isKnownModel: () => Effect.succeed(true),
})

const TestProviderProbeLayer = Layer.succeed(ProviderProbeService, {
  probeCredentials: () => Effect.dieMessage('probeCredentials is not used'),
  generateText: (input) =>
    Effect.sync(() =>
      generateTextMock(input) ??
      `\`\`\`json
{
  "label": "Security Reviewer",
  "kind": "reviewer",
  "roleDescription": "Review the change for auth, shell, and external-input risks.",
  "whyToRun": "Use when the task may touch risky surfaces.",
  "runWhen": ["before-stop"],
  "createPrompt": "app-generated",
  "suggestedNextAgentIfSuccess": "Decision Maker"
}
\`\`\``,
    ),
})

const TestLayer = Layer.mergeAll(TestProviderLayer, TestProviderProbeLayer)

function runGeneratorEffect(input: Parameters<typeof generateTeamAgent>[0]) {
  return generateTeamAgent(input) as unknown as Effect.Effect<any, Error, never>
}

describe('generateTeamAgent', () => {
  beforeEach(() => {
    getProviderForModelMock.mockReset()
    generateTextMock.mockReset()
  })

  it('normalizes a model-generated agent draft from one-shot provider generation', async () => {
    const result = await Effect.runPromise(
      runGeneratorEffect({
        projectPath: '/repo/openwaggle',
        model: SupportedModelId('openai/gpt-5'),
        generationInput: {
          instructions: 'Security reviewer who checks auth, shell access, and external input.',
          availableAgentIds: ['agent-1', 'agent-2'],
          availableAgentLabels: ['Executor', 'Decision Maker'],
        },
      }).pipe(Effect.provide(TestLayer)),
    )

    expect(result).toEqual({
      label: 'Security Reviewer',
      kind: 'reviewer',
      roleDescription: 'Review the change for auth, shell, and external-input risks.',
      whyToRun: 'Use when the task may touch risky surfaces.',
      runWhen: ['before-stop'],
      createPrompt: 'app-generated',
      suggestedNextAgentIfSuccess: 'agent-2',
    })

    expect(getProviderForModelMock).toHaveBeenCalledWith('openai/gpt-5')
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'openai',
        modelId: 'openai/gpt-5',
        projectPath: '/repo/openwaggle',
      }),
    )
  })
})
