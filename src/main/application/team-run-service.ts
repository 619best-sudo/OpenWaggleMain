import { randomUUID } from 'node:crypto'
import { decodeUnknownOrThrow, parseJsonUnknown, Schema } from '@shared/schema'
import { getMessageText, type AgentSendPayload, type Message } from '@shared/types/agent'
import type { SessionId, SupportedModelId } from '@shared/types/brand'
import type { AgentTransportEvent } from '@shared/types/stream'
import type { TeammateAgentDefinition, TeammateDefinition } from '@shared/types/teammate'
import * as Effect from 'effect/Effect'
import { createLogger } from '../logger'
import { ProviderProbeService } from '../ports/provider-probe-service'
import { ProviderService } from '../ports/provider-service'
import { executeAgentRun } from './agent-run-service'

const logger = createLogger('team-run-service')

interface ExecuteTeamRunInput {
  readonly sessionId: SessionId
  readonly runId: string
  readonly payload: AgentSendPayload
  readonly model: SupportedModelId
  readonly teammate: TeammateDefinition
  readonly signal: AbortSignal
  readonly onEvent: (event: AgentTransportEvent) => void
  readonly onTitleAssigned?: (title: string) => void
}

export type TeamRunResult =
  | { readonly outcome: 'success' }
  | { readonly outcome: 'aborted' }
  | {
      readonly outcome: 'invalid-model'
      readonly message: string
      readonly code: string
    }
  | {
      readonly outcome: 'not-found'
      readonly message: string
      readonly code: string
    }
  | {
      readonly outcome: 'error'
      readonly message: string
      readonly code: string
      readonly transportEmitted?: boolean
    }

interface TeamRoutingResult {
  readonly nextAgentId: string
  readonly nextPrompt: string
  readonly visiblePrompt?: string
  readonly stop: boolean
}

interface ParsedTeamSections {
  readonly finalDecision?: 'complete' | 'continue' | 'blocked'
  readonly nextAgentId?: string
  readonly nextUserPrompt?: string
  readonly exactNextLoopInstructions?: string
  readonly websiteOpenCheck?: string
}

interface TeamRouterDecision {
  readonly finalDecision?: 'complete' | 'continue' | 'blocked'
  readonly nextAgentId?: string
  readonly nextUserPrompt?: string
}

const teamRouterDecisionSchema = Schema.Struct({
  finalDecision: Schema.optional(Schema.Literal('complete', 'continue', 'blocked')),
  nextAgentId: Schema.optional(Schema.String),
  nextUserPrompt: Schema.optional(Schema.String),
})

export function executeTeamRun(input: ExecuteTeamRunInput) {
  return Effect.gen(function* () {
    const providerService = yield* ProviderService
    const providerProbeService = yield* ProviderProbeService
    const provider = yield* providerService.getProviderForModel(input.model)
    const allAgents = new Map(input.teammate.agents.map((agent) => [agent.id, agent]))
    const initialAgent = allAgents.get(input.teammate.loopPolicy.initialAgentId)
    const decisionMaker = allAgents.get(input.teammate.loopPolicy.decisionMakerAgentId)

    if (!initialAgent || !decisionMaker) {
      return {
        outcome: 'error' as const,
        message: 'Team(New) is misconfigured: missing initial or decision maker agent.',
        code: 'team-misconfigured',
      }
    }

    const invalidAgent = input.teammate.agents.find(
      (agent) =>
        typeof agent.minRuns === 'number' &&
        typeof agent.maxRuns === 'number' &&
        agent.maxRuns < agent.minRuns,
    )

    if (invalidAgent) {
      return {
        outcome: 'error' as const,
        message: `Team(New) is misconfigured: ${invalidAgent.label} has maxRuns lower than minRuns.`,
        code: 'team-invalid-agent-runs',
      }
    }

    let currentAgent = initialAgent
    let currentPayload = input.payload
    const rootUserPrompt = input.payload.text
    const agentRunCounts: Record<string, number> = {}
    let decisionMakerCalls = 0
    let autoSubmittedPromptCount = 0

    while (!input.signal.aborted) {
      const subRunId = `${input.runId}-${currentAgent.id}-${randomUUID()}`
      const result = yield* executeAgentRun({
        sessionId: input.sessionId,
        runId: subRunId,
        payload: currentPayload,
        model: input.model,
        signal: input.signal,
        onEvent: input.onEvent,
        onTitleAssigned: input.onTitleAssigned,
      })

      if (result.outcome !== 'success') {
        if (result.outcome === 'aborted') {
          return { outcome: 'aborted' as const }
        }
        return result.outcome === 'error'
          ? {
              outcome: result.outcome,
              message: result.message,
              code: result.code,
              ...(result.transportEmitted ? { transportEmitted: true } : {}),
            }
          : {
              outcome: result.outcome,
              message: result.message,
              code: result.code,
            }
      }

      const latestAssistantText = getLatestAssistantText(result.newMessages)
      const parsedSections = parseTeamSections(latestAssistantText)
      agentRunCounts[currentAgent.id] = (agentRunCounts[currentAgent.id] ?? 0) + 1
      let nextVisiblePrompt: string | undefined
      const routerDecision = yield* requestTeamRouterDecision({
        providerProbeService,
        providerId: provider.id,
        modelId: input.model,
        teammate: input.teammate,
        currentAgent,
        latestAssistantText,
        parsedSections,
        agentRunCounts,
        rootUserPrompt,
        decisionMakerCalls,
      }).pipe(
        Effect.catchAll((error) => {
          logger.warn('Team(New) router model failed, falling back to structured routing', {
            sessionId: input.sessionId,
            teammateId: input.teammate.id,
            agentId: currentAgent.id,
            error: error instanceof Error ? error.message : String(error),
          })
          return Effect.succeed({} as TeamRouterDecision)
        }),
      )

      if (currentAgent.id === decisionMaker.id) {
        decisionMakerCalls += 1
        const decisionRouting = routeFromDecisionMaker({
          teammate: input.teammate,
          agents: allAgents,
          currentAgent,
          decisionMaker,
          latestAssistantText,
          parsedSections,
          routerDecision,
          decisionMakerCalls,
          agentRunCounts,
          rootUserPrompt,
        })
        if (decisionRouting.stop) {
          return { outcome: 'success' as const }
        }
        currentAgent = allAgents.get(decisionRouting.nextAgentId) ?? initialAgent
        currentPayload = {
          text: decisionRouting.nextPrompt,
          attachments: [],
          thinkingLevel: input.payload.thinkingLevel,
        }
        nextVisiblePrompt = decisionRouting.visiblePrompt
      } else {
        const workerRouting = routeFromWorker({
          teammate: input.teammate,
          agents: allAgents,
          currentAgent,
          latestAssistantText,
          parsedSections,
          routerDecision,
          agentRunCounts,
          rootUserPrompt,
        })
        currentAgent = allAgents.get(workerRouting.nextAgentId) ?? decisionMaker
        currentPayload = {
          text: workerRouting.nextPrompt,
          attachments: [],
          thinkingLevel: input.payload.thinkingLevel,
        }
        nextVisiblePrompt = workerRouting.visiblePrompt
      }

      autoSubmittedPromptCount += 1
      if (autoSubmittedPromptCount > input.teammate.loopPolicy.maxAutoSubmittedPrompts) {
        logger.warn('Team(New) reached prompt safety limit', {
          sessionId: input.sessionId,
          teammateId: input.teammate.id,
          maxAutoSubmittedPrompts: input.teammate.loopPolicy.maxAutoSubmittedPrompts,
        })
        return { outcome: 'success' as const }
      }

      if (nextVisiblePrompt) {
        emitAutoSubmittedPrompt(input.onEvent, {
          text: nextVisiblePrompt,
          agentLabel: currentAgent.label,
          generated: true,
        })
      }
    }

    return { outcome: 'aborted' as const }
  })
}

function getLatestAssistantText(messages: readonly Message[]) {
  const assistantMessages = messages.filter((message) => message.role === 'assistant')
  const latestAssistant = assistantMessages[assistantMessages.length - 1]
  return latestAssistant ? getMessageText(latestAssistant) : ''
}

function routeFromWorker(input: {
  readonly teammate: TeammateDefinition
  readonly agents: ReadonlyMap<string, TeammateAgentDefinition>
  readonly currentAgent: TeammateAgentDefinition
  readonly latestAssistantText: string
  readonly parsedSections: ParsedTeamSections
  readonly routerDecision: TeamRouterDecision
  readonly agentRunCounts: Readonly<Record<string, number>>
  readonly rootUserPrompt: string
}): TeamRoutingResult {
  const nextAgentId = resolveNextAgentId({
    requestedAgentId: input.routerDecision.nextAgentId ?? input.parsedSections.nextAgentId,
    suggestedAgentId: input.currentAgent.suggestedNextAgentIfSuccess,
    agents: input.agents,
    agentRunCounts: input.agentRunCounts,
    routeReason: 'when-routed',
    fallbackAgentIds: [
      input.teammate.loopPolicy.decisionMakerAgentId,
      input.teammate.loopPolicy.defaultWorkerAgentId,
    ],
  })
  const nextAgent = input.agents.get(nextAgentId) ?? input.currentAgent
  const nextPrompt = buildNextPrompt({
    teammate: input.teammate,
    nextAgent,
    latestAssistantText: input.latestAssistantText,
    parsedSections: input.parsedSections,
    routerDecision: input.routerDecision,
    rootUserPrompt: input.rootUserPrompt,
  })

  return {
    nextAgentId,
    nextPrompt: nextPrompt.text,
    ...(nextPrompt.visiblePrompt ? { visiblePrompt: nextPrompt.visiblePrompt } : {}),
    stop: false,
  }
}

function routeFromDecisionMaker(input: {
  readonly teammate: TeammateDefinition
  readonly agents: ReadonlyMap<string, TeammateAgentDefinition>
  readonly currentAgent: TeammateAgentDefinition
  readonly decisionMaker: TeammateAgentDefinition
  readonly latestAssistantText: string
  readonly parsedSections: ParsedTeamSections
  readonly routerDecision: TeamRouterDecision
  readonly decisionMakerCalls: number
  readonly agentRunCounts: Readonly<Record<string, number>>
  readonly rootUserPrompt: string
}): TeamRoutingResult {
  const hardStopReached = input.decisionMakerCalls >= input.teammate.loopPolicy.maxDecisionMakerCalls
  const finalDecision = input.routerDecision.finalDecision ?? input.parsedSections.finalDecision
  const agentsRequiringRuns = getAgentsRequiringRuns(input.agents, input.agentRunCounts)

  if (hardStopReached) {
    return {
      nextAgentId: input.decisionMaker.id,
      nextPrompt: '',
      stop: true,
    }
  }

  if (finalDecision === 'complete' || finalDecision === 'blocked') {
    if (agentsRequiringRuns.length === 0) {
      return {
        nextAgentId: input.decisionMaker.id,
        nextPrompt: '',
        stop: true,
      }
    }

    const nextAgentId = resolveNextAgentId({
      requestedAgentId: input.routerDecision.nextAgentId ?? input.parsedSections.nextAgentId,
      suggestedAgentId: input.currentAgent.suggestedNextAgentIfSuccess,
      agents: input.agents,
      agentRunCounts: input.agentRunCounts,
      routeReason: 'before-stop',
      fallbackAgentIds: [
        ...agentsRequiringRuns.map((agent) => agent.id),
        input.teammate.loopPolicy.defaultWorkerAgentId,
      ],
    })
    const nextAgent = input.agents.get(nextAgentId) ?? input.decisionMaker
    const nextPrompt = buildNextPrompt({
      teammate: input.teammate,
      nextAgent,
      latestAssistantText: input.latestAssistantText,
      parsedSections: input.parsedSections,
      routerDecision: input.routerDecision,
      rootUserPrompt: input.rootUserPrompt,
    })

    return {
      nextAgentId,
      nextPrompt: nextPrompt.text,
      ...(nextPrompt.visiblePrompt ? { visiblePrompt: nextPrompt.visiblePrompt } : {}),
      stop: false,
    }
  }

  const nextAgentId = resolveNextAgentId({
    requestedAgentId: input.routerDecision.nextAgentId ?? input.parsedSections.nextAgentId,
    suggestedAgentId: input.currentAgent.suggestedNextAgentIfSuccess,
    agents: input.agents,
    agentRunCounts: input.agentRunCounts,
    routeReason: 'when-routed',
    fallbackAgentIds: [
      ...agentsRequiringRuns.map((agent) => agent.id),
      input.teammate.loopPolicy.defaultWorkerAgentId,
    ],
  })
  const nextAgent = input.agents.get(nextAgentId) ?? input.decisionMaker
  const nextPrompt = buildNextPrompt({
    teammate: input.teammate,
    nextAgent,
    latestAssistantText: input.latestAssistantText,
    parsedSections: input.parsedSections,
    routerDecision: input.routerDecision,
    rootUserPrompt: input.rootUserPrompt,
  })

  return {
    nextAgentId,
    nextPrompt: nextPrompt.text,
    ...(nextPrompt.visiblePrompt ? { visiblePrompt: nextPrompt.visiblePrompt } : {}),
    stop: false,
  }
}

function resolveNextAgentId(input: {
  readonly requestedAgentId: string | undefined
  readonly suggestedAgentId: string | undefined
  readonly agents: ReadonlyMap<string, TeammateAgentDefinition>
  readonly agentRunCounts: Readonly<Record<string, number>>
  readonly routeReason: 'when-routed' | 'before-stop'
  readonly fallbackAgentIds: readonly string[]
}) {
  const candidates = [
    input.requestedAgentId,
    input.suggestedAgentId,
    ...input.fallbackAgentIds,
  ]

  for (const candidate of candidates) {
    const normalizedCandidate = candidate?.trim()
    if (!normalizedCandidate) {
      continue
    }
    const agent = input.agents.get(normalizedCandidate)
    if (!agent) {
      continue
    }
    if (hasReachedMaxRuns(agent, input.agentRunCounts)) {
      continue
    }
    if (!canRunForReason(agent, input.agentRunCounts, input.routeReason)) {
      continue
    }
    return normalizedCandidate
  }

  for (const agent of input.agents.values()) {
    if (
      !hasReachedMaxRuns(agent, input.agentRunCounts) &&
      canRunForReason(agent, input.agentRunCounts, input.routeReason)
    ) {
      return agent.id
    }
  }

  return input.fallbackAgentIds[0] ?? Array.from(input.agents.keys())[0] ?? ''
}

function buildNextPrompt(input: {
  readonly teammate: TeammateDefinition
  readonly nextAgent: TeammateAgentDefinition
  readonly latestAssistantText: string
  readonly parsedSections: ParsedTeamSections
  readonly routerDecision: TeamRouterDecision
  readonly rootUserPrompt: string
}) {
  if (input.nextAgent.createPrompt === 'user-original') {
    return { text: input.rootUserPrompt }
  }

  const explicitNextPrompt =
    input.routerDecision.nextUserPrompt?.trim() ?? input.parsedSections.nextUserPrompt?.trim()
  if (explicitNextPrompt) {
    return {
      text: explicitNextPrompt,
      visiblePrompt: explicitNextPrompt,
    }
  }

  return {
    text: buildFallbackPrompt({
      teammate: input.teammate,
      nextAgent: input.nextAgent,
      latestAssistantText: input.latestAssistantText,
      exactNextLoopInstructions: input.parsedSections.exactNextLoopInstructions,
    }),
  }
}

function buildFallbackPrompt(input: {
  readonly teammate: TeammateDefinition
  readonly nextAgent: TeammateAgentDefinition
  readonly latestAssistantText: string
  readonly exactNextLoopInstructions?: string
}) {
  const routedInstructions = input.exactNextLoopInstructions?.trim()

  if (input.nextAgent.kind === 'decision-maker') {
    return [
      'Review the latest chat transcript, verify the website if possible, and decide whether the task is complete.',
      '',
      `Original team: ${input.teammate.name}`,
      `Current target agent: ${input.nextAgent.label}`,
      '',
      routedInstructions ? `Previous exact next loop instructions: ${routedInstructions}` : null,
      '',
      'The prior assistant transcript is already in context. Do not ask for it again.',
      'Use Playwright whenever the app can run, then end with these exact sections:',
      '- website open check: passed / failed / blocked',
      '- playwright evidence reviewed:',
      '- biggest blocker or confirmation:',
      '- next agent:',
      '- next user prompt:',
      '- final decision: complete / continue / blocked',
    ]
      .filter((line) => line !== null)
      .join('\n')
      .trim()
  }

  return [
    `Continue the ${input.teammate.name} task as ${input.nextAgent.label}.`,
    '',
    'Use the latest chat transcript as context and continue from the current state.',
    routedInstructions ? `Decision Maker instructions: ${routedInstructions}` : null,
    '',
    'End with these exact sections:',
    '- execution summary:',
    '- next agent:',
    '- next user prompt:',
    '- unresolved blockers:',
  ]
    .filter((line) => line !== null)
    .join('\n')
    .trim()
}

function getAgentsRequiringRuns(
  agents: ReadonlyMap<string, TeammateAgentDefinition>,
  agentRunCounts: Readonly<Record<string, number>>,
) {
  return Array.from(agents.values()).filter((agent) => {
    if (typeof agent.minRuns !== 'number' || agent.minRuns <= 0) {
      return false
    }
    return (agentRunCounts[agent.id] ?? 0) < agent.minRuns
  })
}

function hasReachedMaxRuns(
  agent: TeammateAgentDefinition,
  agentRunCounts: Readonly<Record<string, number>>,
) {
  if (typeof agent.maxRuns !== 'number') {
    return false
  }
  return (agentRunCounts[agent.id] ?? 0) >= agent.maxRuns
}

function canRunForReason(
  agent: TeammateAgentDefinition,
  agentRunCounts: Readonly<Record<string, number>>,
  routeReason: 'when-routed' | 'before-stop',
) {
  if (!agent.runWhen || agent.runWhen.length === 0) {
    return true
  }

  if (agent.runWhen.includes(routeReason)) {
    return true
  }

  if (routeReason === 'before-stop' && typeof agent.minRuns === 'number' && agent.minRuns > 0) {
    return (agentRunCounts[agent.id] ?? 0) < agent.minRuns
  }

  return false
}

function parseTeamSections(text: string): ParsedTeamSections {
  return {
    finalDecision: parseDecisionValue(readSectionValue(text, 'final decision')),
    nextAgentId:
      readSectionValue(text, 'next agent') ??
      readSectionValue(text, 'recommended next agent') ??
      undefined,
    nextUserPrompt: readSectionValue(text, 'next user prompt') ?? undefined,
    exactNextLoopInstructions: readSectionValue(text, 'exact next loop instructions') ?? undefined,
    websiteOpenCheck: readSectionValue(text, 'website open check') ?? undefined,
  }
}

function parseDecisionValue(value: string | null): ParsedTeamSections['finalDecision'] {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'complete' || normalized === 'continue' || normalized === 'blocked') {
    return normalized
  }
  return undefined
}

function readSectionValue(text: string, label: string): string | null {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(
    `(?:^|\\n)\\s*[-*]?\\s*${escapedLabel}\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*[-*]?\\s*[a-z][^\\n]*:\\s|$)`,
    'i',
  )
  const match = pattern.exec(text)
  if (!match) {
    return null
  }
  return match[1]?.trim() ?? null
}

function emitAutoSubmittedPrompt(
  onEvent: (event: AgentTransportEvent) => void,
  input: {
    readonly text: string
    readonly agentLabel: string
    readonly generated: boolean
  },
) {
  onEvent({
    type: 'custom',
    name: 'team:auto-user-prompt',
    value: {
      text: input.text,
      agentLabel: input.agentLabel,
      generated: input.generated,
    },
    timestamp: Date.now(),
  })
}

function requestTeamRouterDecision(input: {
  readonly providerProbeService: typeof ProviderProbeService.Service
  readonly providerId: string
  readonly modelId: SupportedModelId
  readonly teammate: TeammateDefinition
  readonly currentAgent: TeammateAgentDefinition
  readonly latestAssistantText: string
  readonly parsedSections: ParsedTeamSections
  readonly agentRunCounts: Readonly<Record<string, number>>
  readonly rootUserPrompt: string
  readonly decisionMakerCalls: number
}) {
  return Effect.gen(function* () {
    const assistantText = yield* input.providerProbeService.generateText({
      providerId: input.providerId,
      modelId: input.modelId,
      prompt: buildRouterPrompt(input),
    })

    if (!assistantText.trim()) {
      return {}
    }

    const rawJson = extractJsonBlock(assistantText)
    let parsedJson: unknown
    try {
      parsedJson = parseJsonUnknown(rawJson)
    } catch {
      return yield* Effect.fail(new Error('The team router model did not return valid JSON.'))
    }

    const parsed = decodeUnknownOrThrow(teamRouterDecisionSchema, parsedJson)
    return normalizeTeamRouterDecision(parsed, input.teammate)
  })
}

function buildRouterPrompt(input: {
  readonly teammate: TeammateDefinition
  readonly currentAgent: TeammateAgentDefinition
  readonly latestAssistantText: string
  readonly parsedSections: ParsedTeamSections
  readonly agentRunCounts: Readonly<Record<string, number>>
  readonly rootUserPrompt: string
  readonly decisionMakerCalls: number
}) {
  const agentSummaries = input.teammate.agents.map((agent) => ({
    id: agent.id,
    label: agent.label,
    kind: agent.kind,
    whyToRun: agent.whyToRun ?? null,
    runWhen: agent.runWhen ?? [],
    minRuns: agent.minRuns ?? null,
    maxRuns: agent.maxRuns ?? null,
    isDecisionMaker: agent.isDecisionMaker ?? false,
    createPrompt: agent.createPrompt ?? 'app-generated',
    suggestedNextAgentIfSuccess: agent.suggestedNextAgentIfSuccess ?? null,
    runCount: input.agentRunCounts[agent.id] ?? 0,
  }))

  return [
    'You are the Team(New) orchestration router.',
    'Return exactly one JSON object and no prose.',
    '',
    'Goal:',
    '- Decide whether the collaboration should continue or stop.',
    '- Choose the next agent id.',
    '- Write the next concise auto-submitted user prompt for that agent.',
    '',
    'Important:',
    '- The last assistant message is already present in the same chat transcript.',
    '- Do NOT repeat or paste that whole transcript into nextUserPrompt.',
    '- nextUserPrompt should be a fresh concise instruction that relies on existing chat context.',
    '- When finalDecision is "continue", always provide nextUserPrompt.',
    '- nextUserPrompt must read like a real user task instruction, not orchestration boilerplate.',
    '- Never write prompts like "Continue the task as...", "Use the latest transcript as context...", or "End with these exact sections...".',
    '- It is valid to route back to the same agent again.',
    '- Do not route to the decision-maker too early just because the assistant suggested optional future work; keep the current worker when more implementation is still needed.',
    '- Only choose finalDecision "complete" or "blocked" when the work is ready to stop; otherwise choose "continue".',
    '',
    'Return JSON shape:',
    '{',
    '  "finalDecision": "complete" | "continue" | "blocked",',
    '  "nextAgentId": "agent-id-or-omit-if-stopping",',
    '  "nextUserPrompt": "string-or-omit-if-stopping"',
    '}',
    '',
    `Team: ${input.teammate.name}`,
    `Root user prompt: ${input.rootUserPrompt}`,
    `Current agent: ${input.currentAgent.id} (${input.currentAgent.label}, ${input.currentAgent.kind})`,
    `Decision maker id: ${input.teammate.loopPolicy.decisionMakerAgentId}`,
    `Decision maker calls used: ${String(input.decisionMakerCalls)} / ${String(input.teammate.loopPolicy.maxDecisionMakerCalls)}`,
    `Max auto prompts: ${String(input.teammate.loopPolicy.maxAutoSubmittedPrompts)}`,
    '',
    'Available agents and state:',
    JSON.stringify(agentSummaries, null, 2),
    '',
    'Parsed hints from the latest assistant message:',
    JSON.stringify(input.parsedSections, null, 2),
    '',
    'Latest assistant message:',
    input.latestAssistantText.trim() || '(empty)',
  ].join('\n')
}

function normalizeTeamRouterDecision(
  decision: TeamRouterDecision,
  teammate: TeammateDefinition,
): TeamRouterDecision {
  const normalizedFinalDecision = decision.finalDecision?.trim().toLowerCase()
  const finalDecision =
    normalizedFinalDecision === 'complete' ||
    normalizedFinalDecision === 'continue' ||
    normalizedFinalDecision === 'blocked'
      ? normalizedFinalDecision
      : undefined

  const nextAgentId = resolveRouterAgentId(decision.nextAgentId, teammate.agents)
  const nextUserPrompt = decision.nextUserPrompt?.trim() || undefined

  return {
    ...(finalDecision ? { finalDecision } : {}),
    ...(nextAgentId ? { nextAgentId } : {}),
    ...(nextUserPrompt ? { nextUserPrompt } : {}),
  }
}

function resolveRouterAgentId(
  candidate: string | undefined,
  agents: readonly TeammateAgentDefinition[],
): string | undefined {
  const normalizedCandidate = candidate?.trim()
  if (!normalizedCandidate) {
    return undefined
  }

  const byId = agents.find((agent) => agent.id === normalizedCandidate)
  if (byId) {
    return byId.id
  }

  const byLabel = agents.find(
    (agent) => agent.label.trim().toLowerCase() === normalizedCandidate.toLowerCase(),
  )
  return byLabel?.id
}

function extractJsonBlock(text: string) {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim()
  }
  return text.trim()
}
