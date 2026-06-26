import type {
  TeammateAgentDefinition,
  TeammateAgentGenerationResult,
  TeammateAgentKind,
  TeammateDefinition,
  TeammatePromptMode,
  TeammateRunWhen,
} from '@shared/types/teammate'
import type { SupportedModelId } from '@shared/types/brand'

export interface TeamAgentDraft {
  readonly id: string
  readonly instructionSeed: string
  readonly label: string
  readonly kind: TeammateAgentKind
  readonly modelOverride?: SupportedModelId
  readonly roleDescription: string
  readonly whyToRun: string
  readonly runWhen: readonly TeammateRunWhen[]
  readonly minRuns?: number
  readonly maxRuns?: number
  readonly isDecisionMaker: boolean
  readonly createPrompt: TeammatePromptMode
  readonly suggestedNextAgentIfSuccess?: string
}

export interface TeamBuilderDraft {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly launchPromptPlaceholder: string
  readonly launchButtonLabel: string
  readonly requiredMcps: readonly string[]
  readonly optionalMcps: readonly string[]
  readonly requiredSkills: readonly string[]
  readonly optionalSkills: readonly string[]
  readonly initialAgentId: string
  readonly decisionMakerAgentId: string
  readonly maxDecisionMakerCalls: number
  readonly maxAutoSubmittedPrompts: number
  readonly taskPrompt: string
  readonly agents: readonly TeamAgentDraft[]
}

export const TEAM_AGENT_KIND_OPTIONS: readonly {
  readonly value: TeammateAgentKind
  readonly label: string
}[] = [
  { value: 'worker', label: 'Worker' },
  { value: 'executor', label: 'Executor' },
  { value: 'reviewer', label: 'Reviewer' },
  { value: 'decision-maker', label: 'Decision Maker' },
]

export const TEAM_RUN_WHEN_OPTIONS: readonly {
  readonly value: TeammateRunWhen
  readonly label: string
}[] = [
  { value: 'initial', label: 'At start' },
  { value: 'when-routed', label: 'When routed' },
  { value: 'before-stop', label: 'Before stop' },
  { value: 'after-failure', label: 'After failure' },
  { value: 'on-demand', label: 'On demand' },
]

export const TEAM_PROMPT_MODE_OPTIONS: readonly {
  readonly value: TeammatePromptMode
  readonly label: string
}[] = [
  { value: 'user-original', label: 'Reuse original user prompt' },
  { value: 'app-generated', label: 'Use app-generated prompt' },
]

function createDraftId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function titleCaseWords(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function trimSentence(value: string, fallback: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

function normalizeDependencyList(values: readonly string[] | undefined) {
  if (!values) return []

  const normalizedValues: string[] = []
  const seen = new Set<string>()

  for (const value of values) {
    const normalized = value.trim()
    if (!normalized) continue
    if (seen.has(normalized)) continue
    seen.add(normalized)
    normalizedValues.push(normalized)
  }

  return normalizedValues
}

export function getDefaultRunWhen(kind: TeammateAgentKind): readonly TeammateRunWhen[] {
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

export function getDefaultPromptMode(kind: TeammateAgentKind): TeammatePromptMode {
  if (kind === 'executor' || kind === 'worker') {
    return 'user-original'
  }
  return 'app-generated'
}

function getDefaultWhyToRun(kind: TeammateAgentKind) {
  switch (kind) {
    case 'executor':
      return 'Use when the main task needs to be built or repaired.'
    case 'reviewer':
      return 'Use after implementation or before stop to check quality.'
    case 'decision-maker':
      return 'Use to decide whether the team should continue or stop.'
    case 'worker':
    default:
      return 'Use when the team routes work to this specialist.'
  }
}

function getDefaultRoleDescription(kind: TeammateAgentKind, label: string) {
  switch (kind) {
    case 'executor':
      return `You are ${label}. Implement or repair the user request in the real project, then summarize what changed and what still blocks completion.`
    case 'reviewer':
      return `You are ${label}. Review the latest work for issues, missing checks, or regressions, then suggest the best next step.`
    case 'decision-maker':
      return `You are ${label}. Decide whether the team should stop or continue, and if continuing, select the next agent and next prompt.`
    case 'worker':
    default:
      return `You are ${label}. Continue the task in your specialty area and hand off with a clear summary and next-step guidance.`
  }
}

export function createDefaultAgentDraft(index = 1): TeamAgentDraft {
  const id = index === 1 ? 'agent-1' : createDraftId(`agent-${index}`)
  const kind: TeammateAgentKind = index === 1 ? 'executor' : 'worker'
  return {
    id,
    instructionSeed: '',
    label: index === 1 ? 'Executor' : `Agent ${index}`,
    kind,
    modelOverride: undefined,
    roleDescription: getDefaultRoleDescription(kind, index === 1 ? 'Executor' : `Agent ${index}`),
    whyToRun: getDefaultWhyToRun(kind),
    runWhen: getDefaultRunWhen(kind),
    minRuns: undefined,
    maxRuns: undefined,
    isDecisionMaker: false,
    createPrompt: getDefaultPromptMode(kind),
    suggestedNextAgentIfSuccess: '',
  }
}

export function createDefaultTeamBuilderDraft(): TeamBuilderDraft {
  const firstAgent = createDefaultAgentDraft()
  return {
    id: createDraftId('custom-team'),
    name: 'Custom Team',
    description: 'A custom teammate built from your own set of agents.',
    launchPromptPlaceholder: 'Describe the task this team should execute.',
    launchButtonLabel: 'Launch Custom Team',
    requiredMcps: [],
    optionalMcps: [],
    requiredSkills: [],
    optionalSkills: [],
    initialAgentId: firstAgent.id,
    decisionMakerAgentId: '',
    maxDecisionMakerCalls: 3,
    maxAutoSubmittedPrompts: 6,
    taskPrompt: '',
    agents: [firstAgent],
  }
}

export function createTeamBuilderDraftFromTeammate(teammate: TeammateDefinition): TeamBuilderDraft {
  return {
    id: teammate.id,
    name: teammate.name,
    description: teammate.description,
    launchPromptPlaceholder: teammate.launchPromptPlaceholder,
    launchButtonLabel: teammate.launchButtonLabel,
    requiredMcps: normalizeDependencyList(teammate.app.requiredMcps),
    optionalMcps: normalizeDependencyList(teammate.app.optionalMcps),
    requiredSkills: normalizeDependencyList(teammate.app.requiredSkills),
    optionalSkills: normalizeDependencyList(teammate.app.optionalSkills),
    initialAgentId: teammate.loopPolicy.initialAgentId,
    decisionMakerAgentId: teammate.loopPolicy.decisionMakerAgentId,
    maxDecisionMakerCalls: teammate.loopPolicy.maxDecisionMakerCalls,
    maxAutoSubmittedPrompts: teammate.loopPolicy.maxAutoSubmittedPrompts,
    taskPrompt: '',
    agents: teammate.agents.map((agent) => ({
      id: agent.id,
      instructionSeed: '',
      label: agent.label,
      kind: agent.kind,
      modelOverride: agent.modelOverride,
      roleDescription: agent.roleDescription,
      whyToRun: agent.whyToRun ?? '',
      runWhen: agent.runWhen ?? getDefaultRunWhen(agent.kind),
      minRuns: agent.minRuns,
      maxRuns: agent.maxRuns,
      isDecisionMaker: agent.isDecisionMaker ?? agent.kind === 'decision-maker',
      createPrompt: agent.createPrompt ?? getDefaultPromptMode(agent.kind),
      suggestedNextAgentIfSuccess: agent.suggestedNextAgentIfSuccess ?? '',
    })),
  }
}

export function inferAgentDraftFromInstructions(
  instructions: string,
  fallback: TeamAgentDraft,
): TeamAgentDraft {
  const normalized = instructions.trim()
  const lower = normalized.toLowerCase()

  const kind: TeammateAgentKind = lower.includes('decision maker') ||
    lower.includes('decide when to stop') ||
    lower.includes('stop authority')
    ? 'decision-maker'
    : lower.includes('review') ||
        lower.includes('verify') ||
        lower.includes('audit') ||
        lower.includes('qa') ||
        lower.includes('test')
      ? 'reviewer'
      : lower.includes('build') ||
          lower.includes('implement') ||
          lower.includes('create') ||
          lower.includes('fix')
        ? 'executor'
        : 'worker'

  const firstSentence = normalized.split(/[.!?]/)[0]?.trim() ?? ''
  const label =
    kind === 'decision-maker'
      ? 'Decision Maker'
      : kind === 'reviewer'
        ? lower.includes('security')
          ? 'Security Reviewer'
          : lower.includes('test')
            ? 'Test Reviewer'
            : lower.includes('ui')
              ? 'UI Reviewer'
              : 'Reviewer'
        : kind === 'executor'
          ? 'Executor'
          : titleCaseWords(firstSentence.split(/\s+/).slice(0, 3).join(' ')) || fallback.label

  const roleDescription = trimSentence(
    normalized,
    getDefaultRoleDescription(kind, label),
  )

  return {
    ...fallback,
    instructionSeed: normalized,
    label,
    kind,
    roleDescription,
    whyToRun: trimSentence(
      normalized.length > 0
        ? `Use when ${normalized.charAt(0).toLowerCase()}${normalized.slice(1)}`
        : '',
      getDefaultWhyToRun(kind),
    ),
    runWhen: getDefaultRunWhen(kind),
    minRuns: kind === 'decision-maker' ? 1 : undefined,
    maxRuns: undefined,
    isDecisionMaker: kind === 'decision-maker',
    createPrompt: getDefaultPromptMode(kind),
    suggestedNextAgentIfSuccess: kind === 'decision-maker' ? '' : 'decision-maker',
  }
}

export function applyGeneratedAgentResult(
  fallback: TeamAgentDraft,
  generated: TeammateAgentGenerationResult,
): TeamAgentDraft {
  return {
    ...fallback,
    label: generated.label,
    kind: generated.kind,
    modelOverride: generated.modelOverride,
    roleDescription: generated.roleDescription,
    whyToRun: generated.whyToRun ?? fallback.whyToRun,
    runWhen: generated.runWhen && generated.runWhen.length > 0 ? generated.runWhen : fallback.runWhen,
    minRuns: generated.minRuns,
    maxRuns: generated.maxRuns,
    isDecisionMaker: generated.isDecisionMaker ?? generated.kind === 'decision-maker',
    createPrompt: generated.createPrompt ?? getDefaultPromptMode(generated.kind),
    suggestedNextAgentIfSuccess: generated.suggestedNextAgentIfSuccess ?? '',
  }
}

export function normalizeAgentDraft(agent: TeamAgentDraft): TeamAgentDraft {
  const isDecisionMaker = agent.isDecisionMaker || agent.kind === 'decision-maker'
  const kind: TeammateAgentKind = isDecisionMaker ? 'decision-maker' : agent.kind

  return {
    ...agent,
    kind,
    isDecisionMaker,
    minRuns: typeof agent.minRuns === 'number' ? Math.max(0, agent.minRuns) : undefined,
    maxRuns: typeof agent.maxRuns === 'number' ? Math.max(1, agent.maxRuns) : undefined,
    createPrompt: isDecisionMaker ? 'app-generated' : agent.createPrompt,
    runWhen: isDecisionMaker
      ? Array.from(new Set([...agent.runWhen, 'before-stop', 'when-routed']))
      : agent.runWhen,
  }
}

function toAgentDefinition(agent: TeamAgentDraft): TeammateAgentDefinition {
  const normalized = normalizeAgentDraft(agent)
  return {
    id: normalized.id,
    label: normalized.label.trim() || 'Unnamed Agent',
    kind: normalized.kind,
    modelOverride: normalized.modelOverride?.trim() ? normalized.modelOverride : undefined,
    roleDescription: normalized.roleDescription.trim(),
    whyToRun: normalized.whyToRun.trim() || undefined,
    runWhen: normalized.runWhen,
    minRuns: normalized.minRuns,
    maxRuns: normalized.maxRuns,
    isDecisionMaker: normalized.isDecisionMaker || undefined,
    createPrompt: normalized.createPrompt,
    suggestedNextAgentIfSuccess: normalized.suggestedNextAgentIfSuccess?.trim() || undefined,
  }
}

export function buildTeammateFromDraft(draft: TeamBuilderDraft): TeammateDefinition {
  const normalizedAgents = draft.agents.map(normalizeAgentDraft)
  const requiredMcps = normalizeDependencyList(draft.requiredMcps)
  const optionalMcps = normalizeDependencyList(draft.optionalMcps)
  const requiredSkills = normalizeDependencyList(draft.requiredSkills)
  const optionalSkills = normalizeDependencyList(draft.optionalSkills)
  const decisionMaker =
    normalizedAgents.find((agent) => agent.id === draft.decisionMakerAgentId) ||
    normalizedAgents.find((agent) => agent.isDecisionMaker) ||
    normalizedAgents[0]

  const initialAgent =
    normalizedAgents.find((agent) => agent.id === draft.initialAgentId) || normalizedAgents[0]

  const defaultWorker =
    normalizedAgents.find((agent) => agent.id !== decisionMaker?.id) || initialAgent || decisionMaker

  return {
    id: draft.id,
    name: draft.name.trim() || 'Custom Team',
    description: draft.description.trim() || 'A custom teammate built in Team(New).',
    launchPromptPlaceholder:
      draft.launchPromptPlaceholder.trim() || 'Describe the task this custom team should run.',
    launchButtonLabel: draft.launchButtonLabel.trim() || 'Launch Custom Team',
    app: {
      requiredMcps,
      requiredSkills,
      ...(optionalMcps.length > 0 ? { optionalMcps } : {}),
      ...(optionalSkills.length > 0 ? { optionalSkills } : {}),
    },
    agents: normalizedAgents.map(toAgentDefinition),
    loopPolicy: {
      initialAgentId: initialAgent?.id ?? '',
      decisionMakerAgentId: decisionMaker?.id ?? '',
      maxDecisionMakerCalls: draft.maxDecisionMakerCalls,
      maxAutoSubmittedPrompts: draft.maxAutoSubmittedPrompts,
      defaultWorkerAgentId: defaultWorker?.id ?? initialAgent?.id ?? '',
      endConditionSummary:
        'The selected decision maker is the only agent allowed to end the loop.',
    },
  }
}
