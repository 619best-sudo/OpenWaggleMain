import { SessionBranchId, SupportedModelId, WagglePresetId } from '@shared/types/brand'
import type { AgentTransportEvent } from '@shared/types/stream'
import {
  WAGGLE_INHERIT_MODEL,
  type WaggleConfig,
  type WaggleStreamMetadata,
} from '@shared/types/waggle'
import { fromAny } from '@total-typescript/shoehorn'
import * as Effect from 'effect/Effect'
import { beforeEach, describe, expect, it } from 'vitest'
import { BUILT_IN_WAGGLE_PRESETS } from '../../adapters/settings-waggle-presets-built-ins'
import { executeWaggleRun } from '../waggle-run-service'
import {
  clearActiveRunMock,
  clearInterruptedRunsMock,
  kernelRunResultMock,
  persistSnapshotMock,
  recordActiveRunMock,
  resetWaggleRunServiceMocks,
  runMock,
  selectedModel,
  session,
  sessionId,
  TestLayer,
  waggleConfig,
} from './waggle-run-service.test-harness'

function runInput(config: WaggleConfig, runId: string, model = selectedModel) {
  return {
    sessionId,
    runId,
    payload: { text: 'Review the implementation', thinkingLevel: 'medium', attachments: [] },
    model,
    config,
    signal: new AbortController().signal,
    onEvent: () => undefined,
    onTurnEvent: () => undefined,
  } as const
}

const CREATED_WAGGLE_RUNTIME_CASES = [
  {
    presetId: WagglePresetId('turing'),
    prompt:
      'Read this repository and tell me which installed Waggle should handle adding a signup form with basic validation next.',
  },
  {
    presetId: WagglePresetId('web-engineer'),
    prompt:
      'Implement and verify a landing page hero refresh with CTA polish, plus any motion that meaningfully improves the section.',
  },
  {
    presetId: WagglePresetId('mobile-engineer'),
    prompt:
      'Implement and verify a mobile onboarding flow update, including animation polish only if it improves the real experience.',
  },
  {
    presetId: WagglePresetId('backend-engineer'),
    prompt:
      'Plan, implement, and verify a backend projects API update that changes stored data and must be checked against the database.',
  },
  {
    presetId: WagglePresetId('quality-assurance-engineer'),
    prompt:
      'Plan and execute a full regression QA pass for a changed checkout flow, including adjacent web, mobile, API, and SQL behaviors that might have been disturbed.',
  },
  {
    presetId: WagglePresetId('qa-debug'),
    prompt:
      'Debug and fix a mixed regression where a profile page UI issue may actually come from stale backend data and logic drift in nearby flows.',
  },
] as const

describe('executeWaggleRun', () => {
  beforeEach(() => {
    resetWaggleRunServiceMocks()
  })

  it('accepts configs with more than two agents before invoking the kernel', async () => {
    const configWithThirdAgent = fromAny<WaggleConfig, unknown>({
      ...waggleConfig,
      agents: [...waggleConfig.agents, { ...waggleConfig.agents[0], label: 'Mediator' }],
    })

    const result = await Effect.runPromise(
      executeWaggleRun(runInput(configWithThirdAgent, 'run-invalid-waggle')).pipe(
        Effect.provide(TestLayer),
      ),
    )

    expect(result.outcome).toBe('success')
    expect(runMock).toHaveBeenCalledOnce()
    expect(recordActiveRunMock).toHaveBeenCalledOnce()
  })

  it('resolves inherited first-agent model for runtime and active-run persistence', async () => {
    const inheritedConfig: WaggleConfig = {
      ...waggleConfig,
      agents: [{ ...waggleConfig.agents[0], model: WAGGLE_INHERIT_MODEL }, waggleConfig.agents[1]],
    }

    const result = await Effect.runPromise(
      executeWaggleRun(runInput(inheritedConfig, 'run-waggle-inherited-model')).pipe(
        Effect.provide(TestLayer),
      ),
    )

    expect(result.outcome).toBe('success')
    const [kernelInput] = runMock.mock.calls[0] ?? []
    expect(kernelInput).toMatchObject({
      model: selectedModel,
      waggle: { config: inheritedConfig, inheritedModel: selectedModel },
    })
    expect(recordActiveRunMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: selectedModel }),
    )
  })

  it('rejects inherited Waggle models before invoking the kernel when no standard model is selected', async () => {
    const inheritedConfig: WaggleConfig = {
      ...waggleConfig,
      agents: [{ ...waggleConfig.agents[0], model: WAGGLE_INHERIT_MODEL }, waggleConfig.agents[1]],
    }

    const result = await Effect.runPromise(
      executeWaggleRun(
        runInput(inheritedConfig, 'run-waggle-missing-selected-model', SupportedModelId('')),
      ).pipe(Effect.provide(TestLayer)),
    )

    expect(result).toMatchObject({
      outcome: 'validation-error',
      message: 'Select a model before starting Waggle mode.',
    })
    expect(runMock).not.toHaveBeenCalled()
    expect(recordActiveRunMock).not.toHaveBeenCalled()
  })

  it('keeps inherited model separate from the pinned first-turn runtime model', async () => {
    const pinnedFirstAgentConfig: WaggleConfig = {
      ...waggleConfig,
      agents: [
        { ...waggleConfig.agents[0], model: waggleConfig.agents[1].model },
        { ...waggleConfig.agents[1], model: WAGGLE_INHERIT_MODEL },
      ],
    }

    const result = await Effect.runPromise(
      executeWaggleRun(runInput(pinnedFirstAgentConfig, 'run-waggle-pinned-first')).pipe(
        Effect.provide(TestLayer),
      ),
    )

    expect(result.outcome).toBe('success')
    const [kernelInput] = runMock.mock.calls[0] ?? []
    expect(kernelInput).toMatchObject({
      model: waggleConfig.agents[1].model,
      waggle: {
        config: pinnedFirstAgentConfig,
        inheritedModel: selectedModel,
      },
    })
    expect(recordActiveRunMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: waggleConfig.agents[1].model }),
    )
  })

  it('prepares the first active runtime model from prompt-gated slots', async () => {
    const gatedConfig = fromAny<WaggleConfig, unknown>({
      ...waggleConfig,
      agents: [
        {
          ...waggleConfig.agents[0],
          runCondition: { type: 'prompt-match', anyOf: ['animation'] },
        },
        waggleConfig.agents[1],
        { ...waggleConfig.agents[0], label: 'Mediator', model: selectedModel },
      ],
    })

    const result = await Effect.runPromise(
      executeWaggleRun(runInput(gatedConfig, 'run-waggle-gated-first')).pipe(Effect.provide(TestLayer)),
    )

    expect(result.outcome).toBe('success')
    expect(runMock).toHaveBeenCalledOnce()
    expect(recordActiveRunMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: waggleConfig.agents[1].model }),
    )
  })

  it('delegates the full collaboration to a single Pi-native Waggle kernel run', async () => {
    const emitted: Array<{
      readonly event: AgentTransportEvent
      readonly meta: WaggleStreamMetadata
    }> = []

    const result = await Effect.runPromise(
      executeWaggleRun({
        ...runInput(waggleConfig, 'run-waggle-1'),
        onEvent: (event, meta) => emitted.push({ event, meta }),
      }).pipe(Effect.provide(TestLayer)),
    )

    expect(result.outcome).toBe('success')
    expect(runMock).toHaveBeenCalledOnce()
    const [kernelInput] = runMock.mock.calls[0] ?? []
    expect(kernelInput).toMatchObject({
      session,
      runId: 'run-waggle-1',
      model: waggleConfig.agents[0].model,
      skillToggles: { 'code-review': false },
      waggle: { config: waggleConfig, inheritedModel: selectedModel },
    })
    expect(recordActiveRunMock).toHaveBeenCalledWith({
      runId: 'run-waggle-1',
      sessionId,
      branchId: SessionBranchId('session-1:main'),
      runMode: 'waggle',
      model: waggleConfig.agents[0].model,
    })
    expect(clearInterruptedRunsMock).toHaveBeenCalledWith({
      sessionId,
      branchId: SessionBranchId('session-1:main'),
    })
    expect(emitted[0]?.meta.agentLabel).toBe('Architect')

    if (result.outcome !== 'success') {
      throw new Error('Expected successful Waggle result')
    }
    expect(result.newMessages[0]?.role).toBe('user')
    expect(result.newMessages[1]?.role).toBe('assistant')
    expect(persistSnapshotMock).toHaveBeenCalledOnce()
    expect(persistSnapshotMock.mock.calls[0]?.[0].nodes[0]?.metadataJson).toContain('Architect')
    expect(clearActiveRunMock).toHaveBeenCalledWith({ sessionId, runId: 'run-waggle-1' })
  })

  it.each(CREATED_WAGGLE_RUNTIME_CASES)(
    'executes the built-in $presetId config through the Waggle run service',
    async ({ presetId, prompt }) => {
      const preset = BUILT_IN_WAGGLE_PRESETS.find((candidate) => candidate.id === presetId)
      expect(preset).toBeDefined()
      if (!preset) {
        throw new Error(`Expected preset ${presetId}`)
      }

      const result = await Effect.runPromise(
        executeWaggleRun({
          ...runInput(preset.config, `run-${presetId}`),
          payload: { text: prompt, thinkingLevel: 'medium', attachments: [] },
        }).pipe(Effect.provide(TestLayer)),
      )

      expect(result.outcome).toBe('success')
      expect(runMock).toHaveBeenCalledOnce()

      const [kernelInput] = runMock.mock.calls[0] ?? []
      expect(kernelInput).toMatchObject({
        runId: `run-${presetId}`,
        waggle: { config: preset.config, inheritedModel: selectedModel },
      })
      expect(kernelInput.waggle.config.agents.map((agent: { label: string }) => agent.label)).toEqual(
        preset.config.agents.map((agent) => agent.label),
      )
    },
  )

  it('injects real Waggle readiness context into Turing before kernel execution', async () => {
    const preset = BUILT_IN_WAGGLE_PRESETS.find((candidate) => candidate.id === WagglePresetId('turing'))
    expect(preset).toBeDefined()
    if (!preset) {
      throw new Error('Expected preset turing')
    }

    const result = await Effect.runPromise(
      executeWaggleRun({
        ...runInput(preset.config, 'run-turing-ready-context'),
        payload: {
          text: 'Route this task to the right installed Waggle.',
          thinkingLevel: 'medium',
          attachments: [],
        },
      }).pipe(Effect.provide(TestLayer)),
    )

    expect(result.outcome).toBe('success')
    const [kernelInput] = runMock.mock.calls[0] ?? []
    expect(kernelInput.payload.text).toContain('Installed Waggle readiness snapshot:')
    expect(kernelInput.payload.text).toContain('Web Engineer (web-engineer)')
    expect(kernelInput.payload.text).toContain('Quality Assurance Engineer (quality-assurance-engineer)')
  })

  it('persists the Waggle snapshot even when the collaboration is stopped mid-run', async () => {
    kernelRunResultMock.mockReturnValueOnce({
      newMessages: [
        {
          id: 'user-message-1',
          role: 'user',
          parts: [{ type: 'text', text: 'Review the implementation' }],
          createdAt: 9,
        },
      ],
      piSessionId: 'pi-session-1',
      piSessionFile: '/tmp/pi-session-1.jsonl',
      sessionSnapshot: {
        activeNodeId: 'user-node-1',
        nodes: [
          {
            id: 'user-node-1',
            parentId: null,
            piEntryType: 'message',
            kind: 'user_message',
            role: 'user',
            timestampMs: 9,
            contentJson: '{}',
            metadataJson: '{}',
            pathDepth: 0,
            createdOrder: 0,
          },
        ],
      },
      aborted: true as const,
    })

    const result = await Effect.runPromise(
      executeWaggleRun(runInput(waggleConfig, 'run-waggle-aborted')).pipe(Effect.provide(TestLayer)),
    )

    expect(result.outcome).toBe('aborted')
    expect(runMock).toHaveBeenCalledOnce()
    expect(persistSnapshotMock).toHaveBeenCalledOnce()
    expect(persistSnapshotMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId,
        activeNodeId: 'user-node-1',
      }),
    )
    expect(clearActiveRunMock).toHaveBeenCalledWith({ sessionId, runId: 'run-waggle-aborted' })
  })
})
