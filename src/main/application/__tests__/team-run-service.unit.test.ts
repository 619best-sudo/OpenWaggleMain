import type { Message } from '@shared/types/agent'
import { SessionId, SupportedModelId } from '@shared/types/brand'
import type { AgentTransportEvent } from '@shared/types/stream'
import type { TeammateDefinition } from '@shared/types/teammate'
import { Layer } from 'effect'
import * as Effect from 'effect/Effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderProbeService } from '../../ports/provider-probe-service'
import { ProviderService } from '../../ports/provider-service'
import { executeTeamRun } from '../team-run-service'

const executeAgentRunMock = vi.fn()
const getProviderForModelMock = vi.fn()
const generateTextMock = vi.fn()

vi.mock('../agent-run-service', () => ({
  executeAgentRun: (input: unknown) => executeAgentRunMock(input),
}))

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
    Effect.sync(() => {
      const value = generateTextMock(input)
      if (typeof value !== 'string') {
        throw new Error('Missing mocked Team(New) router response')
      }
      return value
    }),
})

const TestLayer = Layer.mergeAll(TestProviderLayer, TestProviderProbeLayer)

const BASE_TEAMMATE: TeammateDefinition = {
  id: 'website-executor-loop',
  name: 'Website Executor',
  description: 'Two-agent website team.',
  launchPromptPlaceholder: 'Create a landing page',
  launchButtonLabel: 'Launch Team(New)',
  app: {
    requiredMcps: ['playwright'],
    requiredSkills: [],
  },
  agents: [
    {
      id: 'executor',
      label: 'Executor',
      kind: 'executor',
      roleDescription: 'Builds and fixes the website.',
    },
    {
      id: 'decision-maker',
      label: 'Decision Maker',
      kind: 'decision-maker',
      roleDescription: 'Verifies with Playwright and decides whether to stop.',
    },
  ],
  loopPolicy: {
    initialAgentId: 'executor',
    decisionMakerAgentId: 'decision-maker',
    defaultWorkerAgentId: 'executor',
    maxDecisionMakerCalls: 3,
    maxAutoSubmittedPrompts: 6,
    endConditionSummary: 'Decision Maker ends after the website opens successfully.',
  },
}

function assistantMessage(text: string): Message {
  return {
    id: 'assistant-1' as Message['id'],
    role: 'assistant',
    parts: [{ type: 'text', text }],
    createdAt: Date.now(),
  }
}

function successResult(text: string) {
  return {
    outcome: 'success' as const,
    newMessages: [assistantMessage(text)],
  }
}

function runTeamEffect(input: Parameters<typeof executeTeamRun>[0]) {
  return executeTeamRun(input) as unknown as Effect.Effect<
    Awaited<ReturnType<typeof executeTeamRun>> extends Effect.Effect<infer A, infer _E, infer _R> ? A : never,
    never,
    never
  >
}

function runTeam(input: Parameters<typeof executeTeamRun>[0]) {
  return Effect.runPromise(runTeamEffect(input).pipe(Effect.provide(TestLayer)))
}

function routeJson(route: {
  readonly finalDecision?: 'complete' | 'continue' | 'blocked'
  readonly nextAgentId?: string
  readonly nextUserPrompt?: string
}) {
  return JSON.stringify(route)
}

describe('executeTeamRun', () => {
  beforeEach(() => {
    executeAgentRunMock.mockReset()
    getProviderForModelMock.mockReset()
    generateTextMock.mockReset()
  })

  it('stops only when the decision maker says complete', async () => {
    executeAgentRunMock
      .mockReturnValueOnce(
        Effect.succeed(
          successResult(`execution summary: implemented the landing page
final decision: complete`),
        ),
      )
      .mockReturnValueOnce(
        Effect.succeed(
          successResult(`website open check: passed
next agent: executor
next user prompt: do not use
final decision: complete`),
        ),
      )
    generateTextMock
      .mockReturnValueOnce(routeJson({ nextAgentId: 'decision-maker' }))
      .mockReturnValueOnce(routeJson({ finalDecision: 'complete' }))

    const events: AgentTransportEvent[] = []
    const result = await runTeam({
      sessionId: SessionId('session-team-1'),
      runId: 'team-session-team-1',
      payload: {
        text: 'Create a SaaS landing page.',
        thinkingLevel: 'medium',
        attachments: [],
      },
      model: SupportedModelId('openai/gpt-5'),
      teammate: BASE_TEAMMATE,
      signal: new AbortController().signal,
      onEvent: (event) => {
        events.push(event)
      },
    })

    expect(result).toEqual({ outcome: 'success' })
    expect(executeAgentRunMock).toHaveBeenCalledTimes(2)
    expect(executeAgentRunMock.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          text: expect.stringContaining(
            'Review the latest chat transcript, verify the website if possible',
          ),
        }),
      }),
    )
    const autoPromptEvents = events.filter(
      (event) => event.type === 'custom' && event.name === 'team:auto-user-prompt',
    )
    expect(autoPromptEvents).toHaveLength(0)
  })

  it('uses the decision maker next prompt when continuing back to the executor', async () => {
    executeAgentRunMock
      .mockReturnValueOnce(Effect.succeed(successResult('execution summary: implemented the page')))
      .mockReturnValueOnce(
        Effect.succeed(
          successResult(`website open check: failed
next agent: executor
next user prompt: Fix the broken startup and keep the new landing page.
final decision: continue`),
        ),
      )
      .mockReturnValueOnce(Effect.succeed(successResult('execution summary: startup fixed')))
      .mockReturnValueOnce(
        Effect.succeed(
          successResult(`website open check: passed
final decision: complete`),
        ),
      )
    generateTextMock
      .mockReturnValueOnce(routeJson({ nextAgentId: 'decision-maker' }))
      .mockReturnValueOnce(
        routeJson({
          finalDecision: 'continue',
          nextAgentId: 'executor',
          nextUserPrompt: 'Fix the broken startup and keep the new landing page.',
        }),
      )
      .mockReturnValueOnce(routeJson({ nextAgentId: 'decision-maker' }))
      .mockReturnValueOnce(routeJson({ finalDecision: 'complete' }))

    const events: AgentTransportEvent[] = []
    const result = await runTeam({
      sessionId: SessionId('session-team-2'),
      runId: 'team-session-team-2',
      payload: {
        text: 'Create a SaaS landing page.',
        thinkingLevel: 'medium',
        attachments: [],
      },
      model: SupportedModelId('openai/gpt-5'),
      teammate: BASE_TEAMMATE,
      signal: new AbortController().signal,
      onEvent: (event) => {
        events.push(event)
      },
    })

    expect(result).toEqual({ outcome: 'success' })
    expect(executeAgentRunMock).toHaveBeenCalledTimes(4)
    expect(executeAgentRunMock.mock.calls[2]?.[0]).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          text: 'Fix the broken startup and keep the new landing page.',
        }),
      }),
    )
    expect(
      events.filter((event) => event.type === 'custom' && event.name === 'team:auto-user-prompt'),
    ).toEqual([
      expect.objectContaining({
        value: expect.objectContaining({
          text: 'Fix the broken startup and keep the new landing page.',
          generated: true,
        }),
      }),
    ])
  })

  it('reuses the original user prompt and allows repeated runs when maxRuns is omitted', async () => {
    const teammate: TeammateDefinition = {
      ...BASE_TEAMMATE,
      agents: [
        {
          id: 'executor',
          label: 'Executor',
          kind: 'executor',
          roleDescription: 'Builds and fixes the website.',
          createPrompt: 'user-original',
          suggestedNextAgentIfSuccess: 'executor',
        },
        {
          id: 'decision-maker',
          label: 'Decision Maker',
          kind: 'decision-maker',
          roleDescription: 'Verifies with Playwright and decides whether to stop.',
        },
      ],
    }

    executeAgentRunMock
      .mockReturnValueOnce(Effect.succeed(successResult('execution summary: first pass finished')))
      .mockReturnValueOnce(
        Effect.succeed(
          successResult(`execution summary: second pass finished
next agent: decision-maker`),
        ),
      )
      .mockReturnValueOnce(
        Effect.succeed(
          successResult(`website open check: passed
final decision: complete`),
        ),
      )
    generateTextMock
      .mockReturnValueOnce(routeJson({ nextAgentId: 'executor' }))
      .mockReturnValueOnce(routeJson({ nextAgentId: 'decision-maker' }))
      .mockReturnValueOnce(routeJson({ finalDecision: 'complete' }))

    const result = await runTeam({
      sessionId: SessionId('session-team-3'),
      runId: 'team-session-team-3',
      payload: {
        text: 'Create a SaaS landing page.',
        thinkingLevel: 'medium',
        attachments: [],
      },
      model: SupportedModelId('openai/gpt-5'),
      teammate,
      signal: new AbortController().signal,
      onEvent: () => undefined,
    })

    expect(result).toEqual({ outcome: 'success' })
    expect(executeAgentRunMock).toHaveBeenCalledTimes(3)
    expect(executeAgentRunMock.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          text: 'Create a SaaS landing page.',
        }),
      }),
    )
  })

  it('keeps the executor running when the transcript clearly offers the next implementation step', async () => {
    executeAgentRunMock
      .mockReturnValueOnce(
        Effect.succeed(
          successResult(`execution summary: implemented the hero section and main CTA.
If you want, I can wire the pricing grid and mobile navigation next.
unresolved blockers: none`),
        ),
      )
      .mockReturnValueOnce(
        Effect.succeed(
          successResult(`execution summary: completed the remaining website implementation
next agent: decision-maker
unresolved blockers: none`),
        ),
      )
      .mockReturnValueOnce(
        Effect.succeed(
          successResult(`website open check: passed
final decision: complete`),
        ),
      )
    generateTextMock
      .mockReturnValueOnce(routeJson({ nextAgentId: 'executor' }))
      .mockReturnValueOnce(routeJson({ nextAgentId: 'decision-maker' }))
      .mockReturnValueOnce(routeJson({ finalDecision: 'complete' }))

    const result = await runTeam({
      sessionId: SessionId('session-team-follow-up'),
      runId: 'team-session-follow-up',
      payload: {
        text: 'Create a SaaS landing page.',
        thinkingLevel: 'medium',
        attachments: [],
      },
      model: SupportedModelId('openai/gpt-5'),
      teammate: BASE_TEAMMATE,
      signal: new AbortController().signal,
      onEvent: () => undefined,
    })

    expect(result).toEqual({ outcome: 'success' })
    expect(executeAgentRunMock).toHaveBeenCalledTimes(3)
    expect(executeAgentRunMock.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          text: expect.stringContaining('Continue the Website Executor task as Executor.'),
        }),
      }),
    )
  })

  it('accepts the worker fallback prompt format when it recommends the next agent', async () => {
    executeAgentRunMock
      .mockReturnValueOnce(
        Effect.succeed(
          successResult(`execution summary: implementation finished
recommended next agent: decision-maker
next user prompt: Verify the current website in Playwright.
unresolved blockers: none`),
        ),
      )
      .mockReturnValueOnce(
        Effect.succeed(
          successResult(`website open check: passed
final decision: complete`),
        ),
      )
    generateTextMock
      .mockReturnValueOnce(routeJson({ finalDecision: 'continue' }))
      .mockReturnValueOnce(routeJson({ finalDecision: 'complete' }))

    const result = await runTeam({
      sessionId: SessionId('session-team-recommended-agent'),
      runId: 'team-session-recommended-agent',
      payload: {
        text: 'Create a SaaS landing page.',
        thinkingLevel: 'medium',
        attachments: [],
      },
      model: SupportedModelId('openai/gpt-5'),
      teammate: BASE_TEAMMATE,
      signal: new AbortController().signal,
      onEvent: () => undefined,
    })

    expect(result).toEqual({ outcome: 'success' })
    expect(executeAgentRunMock).toHaveBeenCalledTimes(2)
    expect(executeAgentRunMock.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          text: 'Verify the current website in Playwright.',
        }),
      }),
    )
  })

  it('skips agents that have no minRuns requirement', async () => {
    const teammate: TeammateDefinition = {
      ...BASE_TEAMMATE,
      agents: [
        {
          id: 'executor',
          label: 'Executor',
          kind: 'executor',
          roleDescription: 'Builds and fixes the website.',
          suggestedNextAgentIfSuccess: 'decision-maker',
        },
        {
          id: 'reviewer',
          label: 'Reviewer',
          kind: 'reviewer',
          roleDescription: 'Reviews the work if asked.',
        },
        {
          id: 'decision-maker',
          label: 'Decision Maker',
          kind: 'decision-maker',
          roleDescription: 'Verifies with Playwright and decides whether to stop.',
        },
      ],
    }

    executeAgentRunMock
      .mockReturnValueOnce(Effect.succeed(successResult('execution summary: implemented the page')))
      .mockReturnValueOnce(
        Effect.succeed(
          successResult(`website open check: passed
final decision: complete`),
        ),
      )
    generateTextMock
      .mockReturnValueOnce(routeJson({ nextAgentId: 'decision-maker' }))
      .mockReturnValueOnce(routeJson({ finalDecision: 'complete' }))

    const result = await runTeam({
      sessionId: SessionId('session-team-4'),
      runId: 'team-session-team-4',
      payload: {
        text: 'Create a SaaS landing page.',
        thinkingLevel: 'medium',
        attachments: [],
      },
      model: SupportedModelId('openai/gpt-5'),
      teammate,
      signal: new AbortController().signal,
      onEvent: () => undefined,
    })

    expect(result).toEqual({ outcome: 'success' })
    expect(executeAgentRunMock).toHaveBeenCalledTimes(2)
  })

  it('routes required agents before allowing the decision maker to stop', async () => {
    const teammate: TeammateDefinition = {
      ...BASE_TEAMMATE,
      agents: [
        {
          id: 'executor',
          label: 'Executor',
          kind: 'executor',
          roleDescription: 'Builds and fixes the website.',
          suggestedNextAgentIfSuccess: 'decision-maker',
        },
        {
          id: 'reviewer',
          label: 'Reviewer',
          kind: 'reviewer',
          roleDescription: 'Reviews the work before stop.',
          minRuns: 1,
          createPrompt: 'app-generated',
          suggestedNextAgentIfSuccess: 'decision-maker',
        },
        {
          id: 'decision-maker',
          label: 'Decision Maker',
          kind: 'decision-maker',
          roleDescription: 'Verifies with Playwright and decides whether to stop.',
        },
      ],
      loopPolicy: {
        ...BASE_TEAMMATE.loopPolicy,
        defaultWorkerAgentId: 'reviewer',
      },
    }

    executeAgentRunMock
      .mockReturnValueOnce(Effect.succeed(successResult('execution summary: implemented the page')))
      .mockReturnValueOnce(
        Effect.succeed(
          successResult(`website open check: passed
final decision: complete`),
        ),
      )
      .mockReturnValueOnce(Effect.succeed(successResult('execution summary: review completed')))
      .mockReturnValueOnce(
        Effect.succeed(
          successResult(`website open check: passed
final decision: complete`),
        ),
      )
    generateTextMock
      .mockReturnValueOnce(routeJson({ nextAgentId: 'decision-maker' }))
      .mockReturnValueOnce(routeJson({ finalDecision: 'complete' }))
      .mockReturnValueOnce(routeJson({ nextAgentId: 'decision-maker' }))
      .mockReturnValueOnce(routeJson({ finalDecision: 'complete' }))

    const result = await runTeam({
      sessionId: SessionId('session-team-5'),
      runId: 'team-session-team-5',
      payload: {
        text: 'Create a SaaS landing page.',
        thinkingLevel: 'medium',
        attachments: [],
      },
      model: SupportedModelId('openai/gpt-5'),
      teammate,
      signal: new AbortController().signal,
      onEvent: () => undefined,
    })

    expect(result).toEqual({ outcome: 'success' })
    expect(executeAgentRunMock).toHaveBeenCalledTimes(4)
    expect(executeAgentRunMock.mock.calls[2]?.[0]).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          text: expect.stringContaining('Continue the Website Executor task as Reviewer.'),
        }),
      }),
    )
  })
})
