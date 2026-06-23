import { decodeUnknownOrThrow, parseJsonUnknown, Schema } from '@shared/schema'
import type { SupportedModelId } from '@shared/types/brand'
import type {
  TeammateAgentGenerationInput,
  TeammateAgentGenerationResult,
  TeammateAgentKind,
  TeammatePromptMode,
  TeammateRunWhen,
} from '@shared/types/teammate'
import * as Effect from 'effect/Effect'
import { ProviderProbeService } from '../ports/provider-probe-service'
import { ProviderService } from '../ports/provider-service'

const teamAgentKindSchema = Schema.Literal(
  'executor',
  'decision-maker',
  'worker',
  'reviewer',
)

const teamRunWhenSchema = Schema.Literal(
  'initial',
  'when-routed',
  'before-stop',
  'on-demand',
  'after-failure',
)

const teammatePromptModeSchema = Schema.Literal('app-generated', 'user-original')

const generationResultSchema = Schema.Struct({
  label: Schema.String.pipe(Schema.minLength(1)),
  kind: teamAgentKindSchema,
  roleDescription: Schema.String.pipe(Schema.minLength(1)),
  whyToRun: Schema.optional(Schema.String),
  runWhen: Schema.optional(Schema.Array(teamRunWhenSchema)),
  minRuns: Schema.optional(Schema.Number),
  maxRuns: Schema.optional(Schema.Number),
  isDecisionMaker: Schema.optional(Schema.Boolean),
  createPrompt: Schema.optional(teammatePromptModeSchema),
  suggestedNextAgentIfSuccess: Schema.optional(Schema.String),
})

function buildGenerationPrompt(input: TeammateAgentGenerationInput) {
  const availableAgentsSection =
    input.availableAgentIds.length > 0
      ? input.availableAgentIds
          .map((agentId, index) => {
            const label = input.availableAgentLabels[index] ?? agentId
            return `- ${agentId}: ${label}`
          })
          .join('\n')
      : '- none'

  return [
    'You are designing one teammate agent configuration for Team(New).',
    'Return exactly one JSON object and no prose.',
    '',
    'Allowed values:',
    '- kind: "executor" | "decision-maker" | "worker" | "reviewer"',
    '- runWhen entries: "initial" | "when-routed" | "before-stop" | "on-demand" | "after-failure"',
    '- createPrompt: "app-generated" | "user-original"',
    '',
    'Rules:',
    '- If the agent should be skippable, omit minRuns entirely.',
    '- If the agent can run unlimited times, omit maxRuns entirely.',
    '- Set isDecisionMaker true only if this agent should decide when the loop stops.',
    '- suggestedNextAgentIfSuccess should be one of the available agent ids below, or omit it.',
    '- Keep label short and roleDescription action-oriented.',
    '',
    'Available existing agents:',
    availableAgentsSection,
    '',
    'User instructions:',
    input.instructions.trim(),
    '',
    'Return JSON with this shape:',
    '{',
    '  "label": "string",',
    '  "kind": "executor" | "decision-maker" | "worker" | "reviewer",',
    '  "roleDescription": "string",',
    '  "whyToRun": "string (optional)",',
    '  "runWhen": ["when-routed"],',
    '  "minRuns": 1,',
    '  "maxRuns": 3,',
    '  "isDecisionMaker": false,',
    '  "createPrompt": "app-generated" | "user-original",',
    '  "suggestedNextAgentIfSuccess": "agent-id"',
    '}',
  ].join('\n')
}

function extractJsonBlock(text: string) {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim()
  }
  return text.trim()
}

function normalizeOptionalRunCount(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined
  }
  return value
}

function defaultPromptMode(kind: TeammateAgentKind): TeammatePromptMode {
  return kind === 'executor' || kind === 'worker' ? 'user-original' : 'app-generated'
}

function defaultRunWhen(kind: TeammateAgentKind): readonly TeammateRunWhen[] {
  switch (kind) {
    case 'executor':
      return ['initial', 'when-routed', 'after-failure']
    case 'reviewer':
      return ['when-routed', 'before-stop']
    case 'decision-maker':
      return ['when-routed', 'before-stop']
    case 'worker':
    default:
      return ['when-routed']
  }
}

function resolveSuggestedAgentId(
  candidate: string | undefined,
  input: TeammateAgentGenerationInput,
): string | undefined {
  const normalizedCandidate = candidate?.trim()
  if (!normalizedCandidate) {
    return undefined
  }

  const byId = input.availableAgentIds.find((agentId) => agentId === normalizedCandidate)
  if (byId) {
    return byId
  }

  const byLabelIndex = input.availableAgentLabels.findIndex(
    (label) => label.trim().toLowerCase() === normalizedCandidate.toLowerCase(),
  )
  if (byLabelIndex >= 0) {
    return input.availableAgentIds[byLabelIndex]
  }

  return undefined
}

function normalizeGenerationResult(
  result: TeammateAgentGenerationResult,
  input: TeammateAgentGenerationInput,
): TeammateAgentGenerationResult {
  const isDecisionMaker = result.isDecisionMaker || result.kind === 'decision-maker'
  const kind: TeammateAgentKind = isDecisionMaker ? 'decision-maker' : result.kind
  const minRuns = normalizeOptionalRunCount(result.minRuns)
  const maxRuns = normalizeOptionalRunCount(result.maxRuns)

  return {
    label: result.label.trim(),
    kind,
    roleDescription: result.roleDescription.trim(),
    whyToRun: result.whyToRun?.trim() || undefined,
    runWhen:
      result.runWhen && result.runWhen.length > 0
        ? Array.from(new Set(result.runWhen))
        : defaultRunWhen(kind),
    minRuns: typeof minRuns === 'number' && minRuns > 0 ? Math.max(0, minRuns) : undefined,
    maxRuns: typeof maxRuns === 'number' ? Math.max(1, maxRuns) : undefined,
    isDecisionMaker: isDecisionMaker || undefined,
    createPrompt: isDecisionMaker ? 'app-generated' : (result.createPrompt ?? defaultPromptMode(kind)),
    suggestedNextAgentIfSuccess: isDecisionMaker
      ? undefined
      : resolveSuggestedAgentId(result.suggestedNextAgentIfSuccess, input),
  }
}

export function generateTeamAgent(input: {
  readonly projectPath: string
  readonly model: SupportedModelId
  readonly generationInput: TeammateAgentGenerationInput
}) {
  return Effect.gen(function* () {
    const providerService = yield* ProviderService
    const providerProbeService = yield* ProviderProbeService
    const provider = yield* providerService.getProviderForModel(input.model, input.projectPath)

    const assistantText = yield* providerProbeService.generateText({
      providerId: provider.id,
      modelId: input.model,
      projectPath: input.projectPath,
      prompt: buildGenerationPrompt(input.generationInput),
    })

    if (!assistantText) {
      return yield* Effect.fail(new Error('The model returned an empty agent draft.'))
    }

    const rawJson = extractJsonBlock(assistantText)
    let parsedJson: unknown
    try {
      parsedJson = parseJsonUnknown(rawJson)
    } catch {
      return yield* Effect.fail(
        new Error('The model did not return valid JSON for the team agent draft.'),
      )
    }

    const parsed = decodeUnknownOrThrow(generationResultSchema, parsedJson)
    return normalizeGenerationResult(parsed, input.generationInput)
  })
}
