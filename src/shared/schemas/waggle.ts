import {
  isProviderQualifiedWaggleModel,
  WAGGLE_PLACEHOLDER_POLICIES,
  WAGGLE_AGENT_RUN_CONDITION_TYPES,
  MIN_WAGGLE_AGENT_COUNT,
  isWaggleInheritedModel,
  MAX_WAGGLE_MAX_TURNS_SAFETY,
  MIN_WAGGLE_MAX_TURNS_SAFETY,
  WAGGLE_AGENT_COLORS,
  WAGGLE_COLLABORATION_MODES,
  WAGGLE_INHERIT_MODEL,
  WAGGLE_STOP_CONDITIONS,
} from '@openwaggle/waggle-core'
import { Schema } from '@shared/schema'

function validateWaggleModelBinding(value: string) {
  return isWaggleInheritedModel(value) || isProviderQualifiedWaggleModel(value)
    ? true
    : `model must be ${WAGGLE_INHERIT_MODEL} or a provider/model id.`
}

export const waggleAgentColorSchema = Schema.Literal(...WAGGLE_AGENT_COLORS)
export const waggleModelBindingSchema = Schema.String.pipe(
  Schema.filter(validateWaggleModelBinding),
)
export const waggleAgentRunConditionSchema = Schema.Struct({
  type: Schema.Literal(...WAGGLE_AGENT_RUN_CONDITION_TYPES),
  anyOf: Schema.Array(Schema.String).pipe(
    Schema.filter(
      (terms) => terms.some((term) => term.trim().length > 0),
      {
        message: () => 'runCondition.anyOf must contain at least one non-empty string.',
      },
    ),
  ),
})

export const waggleAgentOutputContractSchema = Schema.Struct({
  requiredSections: Schema.Array(Schema.String).pipe(
    Schema.filter(
      (sections) => sections.some((section) => section.trim().length > 0),
      {
        message: () => 'outputContract.requiredSections must contain at least one non-empty string.',
      },
    ),
  ),
})

export const waggleLoopContractSchema = Schema.Struct({
  firstQaGate: Schema.optional(Schema.Array(Schema.String)),
  failureCategories: Schema.optional(Schema.Array(Schema.String)),
  placeholderPolicy: Schema.optional(Schema.Literal(...WAGGLE_PLACEHOLDER_POLICIES)),
})

export const waggleMetadataSchema = Schema.Struct({
  agentIndex: Schema.Number,
  agentLabel: Schema.String,
  agentColor: waggleAgentColorSchema,
  agentModel: Schema.optional(Schema.String),
  turnNumber: Schema.Number,
  sessionId: Schema.optional(Schema.String),
})

export const waggleAgentSlotSchema = Schema.Struct({
  label: Schema.String,
  model: waggleModelBindingSchema,
  roleDescription: Schema.String,
  color: waggleAgentColorSchema,
  runCondition: Schema.optional(waggleAgentRunConditionSchema),
  outputContract: Schema.optional(waggleAgentOutputContractSchema),
})

export const waggleConfigSchema = Schema.Struct({
  mode: Schema.Literal(...WAGGLE_COLLABORATION_MODES),
  agents: Schema.Array(waggleAgentSlotSchema).pipe(
    Schema.filter(
      (agents) => agents.length >= MIN_WAGGLE_AGENT_COUNT,
      {
        message: () =>
          `agents must contain at least ${String(MIN_WAGGLE_AGENT_COUNT)} agent slots.`,
      },
    ),
  ),
  stop: Schema.Struct({
    primary: Schema.Literal(...WAGGLE_STOP_CONDITIONS),
    maxTurnsSafety: Schema.Number.pipe(
      Schema.int(),
      Schema.greaterThanOrEqualTo(MIN_WAGGLE_MAX_TURNS_SAFETY),
      Schema.lessThanOrEqualTo(MAX_WAGGLE_MAX_TURNS_SAFETY),
    ),
  }),
  loopContract: Schema.optional(waggleLoopContractSchema),
})

export const waggleAppManifestSchema = Schema.Struct({
  requiredMcps: Schema.Array(Schema.String),
  requiredSkills: Schema.Array(Schema.String),
  optionalMcps: Schema.optional(Schema.Array(Schema.String)),
  optionalSkills: Schema.optional(Schema.Array(Schema.String)),
})

export const wagglePresetSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  config: waggleConfigSchema,
  app: Schema.optional(waggleAppManifestSchema),
  isBuiltIn: Schema.Boolean,
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
})
