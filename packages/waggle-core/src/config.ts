export const MIN_WAGGLE_MAX_TURNS_SAFETY = 1
export const MAX_WAGGLE_MAX_TURNS_SAFETY = 100
export const MIN_WAGGLE_AGENT_COUNT = 2
const MIN_TIMESTAMP = 0
const FIRST_PROVIDER_CHARACTER_INDEX = 0
const MODEL_ID_START_OFFSET = 1

export const WAGGLE_INHERIT_MODEL = '$inherit'
export const WAGGLE_COLLABORATION_MODES = ['sequential'] as const
export type WaggleCollaborationMode = (typeof WAGGLE_COLLABORATION_MODES)[number]
export const WAGGLE_PLACEHOLDER_POLICIES = ['none', 'prefer-placeholders-over-blocking'] as const
export type WagglePlaceholderPolicy = (typeof WAGGLE_PLACEHOLDER_POLICIES)[number]

export const WAGGLE_AGENT_COLORS = ['blue', 'amber', 'emerald', 'violet'] as const
export type WaggleAgentColor = (typeof WAGGLE_AGENT_COLORS)[number]

export const WAGGLE_STOP_CONDITIONS = ['consensus', 'user-stop'] as const
export type WaggleStopCondition = (typeof WAGGLE_STOP_CONDITIONS)[number]
export const WAGGLE_AGENT_RUN_CONDITION_TYPES = ['prompt-match'] as const
export type WaggleAgentRunConditionType = (typeof WAGGLE_AGENT_RUN_CONDITION_TYPES)[number]

export interface WagglePromptMatchRunCondition {
  readonly type: 'prompt-match'
  readonly anyOf: readonly string[]
}

export type WaggleAgentRunCondition = WagglePromptMatchRunCondition

export interface WaggleAgentOutputContract {
  readonly requiredSections: readonly string[]
}

export interface WaggleLoopContract {
  readonly firstQaGate?: readonly string[]
  readonly failureCategories?: readonly string[]
  readonly placeholderPolicy?: WagglePlaceholderPolicy
}

export interface WaggleAgentSlot {
  readonly label: string
  readonly model: string
  readonly roleDescription: string
  readonly color: WaggleAgentColor
  readonly runCondition?: WaggleAgentRunCondition
  readonly outputContract?: WaggleAgentOutputContract
}

export interface WaggleStopConfig {
  readonly primary: WaggleStopCondition
  readonly maxTurnsSafety: number
}

export interface WaggleConfig {
  readonly mode: WaggleCollaborationMode
  readonly agents: readonly WaggleAgentSlot[]
  readonly stop: WaggleStopConfig
  readonly loopContract?: WaggleLoopContract
}

export interface WagglePreset {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly config: WaggleConfig
  readonly isBuiltIn: boolean
  readonly createdAt: number
  readonly updatedAt: number
}

export type WaggleValidationResult<T> =
  | { readonly success: true; readonly value: T }
  | { readonly success: false; readonly issues: readonly string[] }

function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function literalValue<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
  path: string,
): WaggleValidationResult<T> {
  if (typeof value !== 'string') {
    return { success: false, issues: [`${path} must be a string.`] }
  }

  for (const allowed of allowedValues) {
    if (value === allowed) {
      return { success: true, value: allowed }
    }
  }

  return { success: false, issues: [`${path} must be one of: ${allowedValues.join(', ')}.`] }
}

function stringValue(value: unknown, path: string): WaggleValidationResult<string> {
  if (typeof value !== 'string') {
    return { success: false, issues: [`${path} must be a string.`] }
  }

  return { success: true, value }
}

function booleanValue(value: unknown, path: string): WaggleValidationResult<boolean> {
  if (typeof value !== 'boolean') {
    return { success: false, issues: [`${path} must be a boolean.`] }
  }

  return { success: true, value }
}

function timestampValue(value: unknown, path: string): WaggleValidationResult<number> {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < MIN_TIMESTAMP) {
    return { success: false, issues: [`${path} must be a non-negative finite number.`] }
  }

  return { success: true, value }
}

function collectIssues(results: readonly WaggleValidationResult<unknown>[]) {
  return results.flatMap((result) => (result.success ? [] : result.issues))
}

function normalizePromptMatchTerms(terms: readonly string[]) {
  return terms.map((term) => term.trim().toLocaleLowerCase()).filter((term) => term.length > 0)
}

function normalizeContractTerms(terms: readonly string[]) {
  return terms.map((term) => term.trim().toLocaleLowerCase()).filter((term) => term.length > 0)
}

export function isWaggleInheritedModel(model: string) {
  return model === WAGGLE_INHERIT_MODEL
}

export function isProviderQualifiedWaggleModel(model: string) {
  const separatorIndex = model.indexOf('/')
  return (
    model.trim() === model &&
    separatorIndex > FIRST_PROVIDER_CHARACTER_INDEX &&
    separatorIndex < model.length - MODEL_ID_START_OFFSET
  )
}

function modelValue(value: unknown, path: string): WaggleValidationResult<string> {
  const model = stringValue(value, path)
  if (!model.success) return model

  if (isWaggleInheritedModel(model.value) || isProviderQualifiedWaggleModel(model.value)) {
    return model
  }

  return {
    success: false,
    issues: [`${path} must be ${WAGGLE_INHERIT_MODEL} or a provider/model id.`],
  }
}

function parseAgentSlot(value: unknown, path: string): WaggleValidationResult<WaggleAgentSlot> {
  if (!isRecord(value)) {
    return { success: false, issues: [`${path} must be an object.`] }
  }

  const label = stringValue(value.label, `${path}.label`)
  const model = modelValue(value.model, `${path}.model`)
  const roleDescription = stringValue(value.roleDescription, `${path}.roleDescription`)
  const color = literalValue(value.color, WAGGLE_AGENT_COLORS, `${path}.color`)
  const runCondition = parseAgentRunCondition(value.runCondition, `${path}.runCondition`)
  const outputContract = parseAgentOutputContract(value.outputContract, `${path}.outputContract`)
  const issues = collectIssues([label, model, roleDescription, color, runCondition, outputContract])
  if (
    issues.length > 0 ||
    !label.success ||
    !model.success ||
    !roleDescription.success ||
    !color.success ||
    !runCondition.success ||
    !outputContract.success
  ) {
    return { success: false, issues }
  }

  return {
    success: true,
    value: {
      label: label.value,
      model: model.value,
      roleDescription: roleDescription.value,
      color: color.value,
      ...(runCondition.value ? { runCondition: runCondition.value } : {}),
      ...(outputContract.value ? { outputContract: outputContract.value } : {}),
    },
  }
}

function parseStringArray(
  value: unknown,
  path: string,
): WaggleValidationResult<readonly string[]> {
  if (!Array.isArray(value)) {
    return { success: false, issues: [`${path} must be an array of strings.`] }
  }

  const items = value.map((item, index) => stringValue(item, `${path}[${String(index)}]`))
  const issues = collectIssues(items)
  if (issues.length > 0 || items.some((item) => !item.success)) {
    return { success: false, issues }
  }

  return {
    success: true,
    value: items.map((item) => {
      if (!item.success) {
        throw new Error('Expected validated string array item')
      }
      return item.value
    }),
  }
}

function parsePromptMatchRunCondition(
  value: unknown,
  path: string,
): WaggleValidationResult<WagglePromptMatchRunCondition> {
  if (!isRecord(value)) {
    return { success: false, issues: [`${path} must be an object.`] }
  }

  const type = literalValue(
    value.type,
    WAGGLE_AGENT_RUN_CONDITION_TYPES,
    `${path}.type`,
  )
  const anyOf = parseStringArray(value.anyOf, `${path}.anyOf`)
  const issues = collectIssues([type, anyOf])
  if (issues.length > 0 || !type.success || !anyOf.success) {
    return { success: false, issues }
  }

  const normalizedTerms = normalizePromptMatchTerms(anyOf.value)
  if (normalizedTerms.length === 0) {
    return {
      success: false,
      issues: [`${path}.anyOf must contain at least one non-empty string.`],
    }
  }

  return {
    success: true,
    value: {
      type: type.value,
      anyOf: normalizedTerms,
    },
  }
}

function parseAgentRunCondition(
  value: unknown,
  path: string,
): WaggleValidationResult<WaggleAgentRunCondition | undefined> {
  if (value === undefined) {
    return { success: true, value: undefined }
  }

  return parsePromptMatchRunCondition(value, path)
}

function parseAgentOutputContract(
  value: unknown,
  path: string,
): WaggleValidationResult<WaggleAgentOutputContract | undefined> {
  if (value === undefined) {
    return { success: true, value: undefined }
  }

  if (!isRecord(value)) {
    return { success: false, issues: [`${path} must be an object.`] }
  }

  const requiredSections = parseStringArray(value.requiredSections, `${path}.requiredSections`)
  if (!requiredSections.success) {
    return requiredSections
  }

  const normalizedSections = normalizeContractTerms(requiredSections.value)
  if (normalizedSections.length === 0) {
    return {
      success: false,
      issues: [`${path}.requiredSections must contain at least one non-empty string.`],
    }
  }

  return {
    success: true,
    value: { requiredSections: normalizedSections },
  }
}

function parseMaxTurnsSafety(value: unknown): WaggleValidationResult<number> {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < MIN_WAGGLE_MAX_TURNS_SAFETY ||
    value > MAX_WAGGLE_MAX_TURNS_SAFETY
  ) {
    return {
      success: false,
      issues: [
        `stop.maxTurnsSafety must be an integer from ${String(MIN_WAGGLE_MAX_TURNS_SAFETY)} to ${String(MAX_WAGGLE_MAX_TURNS_SAFETY)}.`,
      ],
    }
  }

  return { success: true, value }
}

function parseStopConfig(value: unknown): WaggleValidationResult<WaggleStopConfig> {
  if (!isRecord(value)) {
    return { success: false, issues: ['stop must be an object.'] }
  }

  const primary = literalValue(value.primary, WAGGLE_STOP_CONDITIONS, 'stop.primary')
  const maxTurnsSafety = parseMaxTurnsSafety(value.maxTurnsSafety)
  const issues = collectIssues([primary, maxTurnsSafety])
  if (issues.length > 0 || !primary.success || !maxTurnsSafety.success) {
    return { success: false, issues }
  }

  return {
    success: true,
    value: {
      primary: primary.value,
      maxTurnsSafety: maxTurnsSafety.value,
    },
  }
}

function parseLoopContract(value: unknown): WaggleValidationResult<WaggleLoopContract | undefined> {
  if (value === undefined) {
    return { success: true, value: undefined }
  }

  if (!isRecord(value)) {
    return { success: false, issues: ['loopContract must be an object.'] }
  }

  const firstQaGate = value.firstQaGate
    ? parseStringArray(value.firstQaGate, 'loopContract.firstQaGate')
    : ({ success: true, value: undefined } as const)
  const failureCategories = value.failureCategories
    ? parseStringArray(value.failureCategories, 'loopContract.failureCategories')
    : ({ success: true, value: undefined } as const)
  const placeholderPolicy =
    value.placeholderPolicy === undefined
      ? ({ success: true, value: undefined } as const)
      : literalValue(
          value.placeholderPolicy,
          WAGGLE_PLACEHOLDER_POLICIES,
          'loopContract.placeholderPolicy',
        )

  const issues = collectIssues([firstQaGate, failureCategories, placeholderPolicy])
  if (
    issues.length > 0 ||
    !firstQaGate.success ||
    !failureCategories.success ||
    !placeholderPolicy.success
  ) {
    return { success: false, issues }
  }

  const normalizedFirstQaGate = firstQaGate.value
    ?.map((rule) => rule.trim())
    .filter((rule) => rule.length > 0)
  const normalizedFailureCategories = failureCategories.value
    ? normalizeContractTerms(failureCategories.value)
    : undefined

  return {
    success: true,
    value: {
      ...(normalizedFirstQaGate && normalizedFirstQaGate.length > 0
        ? { firstQaGate: normalizedFirstQaGate }
        : {}),
      ...(normalizedFailureCategories && normalizedFailureCategories.length > 0
        ? { failureCategories: normalizedFailureCategories }
        : {}),
      ...(placeholderPolicy.value ? { placeholderPolicy: placeholderPolicy.value } : {}),
    },
  }
}

function parseAgentList(value: unknown): WaggleValidationResult<readonly WaggleAgentSlot[]> {
  if (!Array.isArray(value) || value.length < MIN_WAGGLE_AGENT_COUNT) {
    return {
      success: false,
      issues: [`agents must contain at least ${String(MIN_WAGGLE_AGENT_COUNT)} agent slots.`],
    }
  }

  const parsedAgents = value.map((agent, index) => parseAgentSlot(agent, `agents[${String(index)}]`))
  const issues = collectIssues(parsedAgents)
  if (issues.length > 0 || parsedAgents.some((agent) => !agent.success)) {
    return { success: false, issues }
  }

  return {
    success: true,
    value: parsedAgents.map((agent) => {
      if (!agent.success) {
        throw new Error('Expected validated Waggle agent slot')
      }
      return agent.value
    }),
  }
}

export function parseWaggleConfig(value: unknown): WaggleValidationResult<WaggleConfig> {
  if (!isRecord(value)) {
    return { success: false, issues: ['config must be an object.'] }
  }

  const mode = literalValue(value.mode, WAGGLE_COLLABORATION_MODES, 'mode')
  const agents = parseAgentList(value.agents)
  const stop = parseStopConfig(value.stop)
  const loopContract = parseLoopContract(value.loopContract)
  const issues = collectIssues([mode, agents, stop, loopContract])
  if (issues.length > 0 || !mode.success || !agents.success || !stop.success || !loopContract.success) {
    return { success: false, issues }
  }

  return {
    success: true,
    value: {
      mode: mode.value,
      agents: agents.value,
      stop: stop.value,
      ...(loopContract.value ? { loopContract: loopContract.value } : {}),
    },
  }
}

export function shouldRunWaggleAgent(
  agent: Pick<WaggleAgentSlot, 'runCondition'>,
  userPrompt: string,
) {
  if (!agent.runCondition) {
    return true
  }

  const normalizedPrompt = userPrompt.trim().toLocaleLowerCase()
  if (!normalizedPrompt) {
    return false
  }

  return normalizePromptMatchTerms(agent.runCondition.anyOf).some((term) =>
    normalizedPrompt.includes(term),
  )
}

export function resolveWaggleConfigForPrompt(
  config: WaggleConfig,
  userPrompt: string,
): WaggleConfig {
  const activeAgents = config.agents.filter((agent) => shouldRunWaggleAgent(agent, userPrompt))
  if (activeAgents.length < MIN_WAGGLE_AGENT_COUNT || activeAgents.length === config.agents.length) {
    return config
  }

  return {
    ...config,
    agents: activeAgents,
  }
}

export function parseWagglePreset(value: unknown): WaggleValidationResult<WagglePreset> {
  if (!isRecord(value)) {
    return { success: false, issues: ['preset must be an object.'] }
  }

  const id = stringValue(value.id, 'id')
  const name = stringValue(value.name, 'name')
  const description = stringValue(value.description, 'description')
  const config = parseWaggleConfig(value.config)
  const isBuiltIn = booleanValue(value.isBuiltIn, 'isBuiltIn')
  const createdAt = timestampValue(value.createdAt, 'createdAt')
  const updatedAt = timestampValue(value.updatedAt, 'updatedAt')
  const issues = collectIssues([id, name, description, config, isBuiltIn, createdAt, updatedAt])

  if (
    issues.length > 0 ||
    !id.success ||
    !name.success ||
    !description.success ||
    !config.success ||
    !isBuiltIn.success ||
    !createdAt.success ||
    !updatedAt.success
  ) {
    return { success: false, issues }
  }

  return {
    success: true,
    value: {
      id: id.value,
      name: name.value,
      description: description.value,
      config: config.value,
      isBuiltIn: isBuiltIn.value,
      createdAt: createdAt.value,
      updatedAt: updatedAt.value,
    },
  }
}
