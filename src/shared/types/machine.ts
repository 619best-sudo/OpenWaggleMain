import { Schema, type SchemaType } from '@shared/schema'
import type { SupportedModelId } from './llm'
import { THINKING_LEVELS } from './settings'

export const machinePlannerTaskSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  title: Schema.String.pipe(Schema.minLength(1)),
  prompt: Schema.String.pipe(Schema.minLength(1)),
  dependsOn: Schema.optional(Schema.Array(Schema.String)),
})

export const machinePlanSchema = Schema.Struct({
  goal: Schema.String.pipe(Schema.minLength(1)),
  tasks: Schema.Array(machinePlannerTaskSchema),
})

export const machineTaskStatusSchema = Schema.Literal('pending', 'running', 'completed', 'failed')

export const machineExecutionPhaseSchema = Schema.Literal(
  'awaiting_approval',
  'running',
  'completed',
  'failed',
)

export const machineExecutionTaskSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  title: Schema.String.pipe(Schema.minLength(1)),
  prompt: Schema.String.pipe(Schema.minLength(1)),
  dependsOn: Schema.optional(Schema.Array(Schema.String)),
  status: machineTaskStatusSchema,
  messageIds: Schema.optional(Schema.Array(Schema.String.pipe(Schema.minLength(1)))),
  lastError: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
})

export const machineExecutionStateSchema = Schema.Struct({
  goal: Schema.String.pipe(Schema.minLength(1)),
  originalRequest: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
  phase: machineExecutionPhaseSchema,
  tasks: Schema.Array(machineExecutionTaskSchema),
  model: Schema.String.pipe(Schema.minLength(1)),
  thinkingLevel: Schema.Literal(...THINKING_LEVELS),
  currentTaskId: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
  generatedAt: Schema.Number,
  approvedAt: Schema.optional(Schema.Number),
  finishedAt: Schema.optional(Schema.Number),
  lastError: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
})

export type MachinePlannerTask = SchemaType<typeof machinePlannerTaskSchema>
export type MachinePlan = SchemaType<typeof machinePlanSchema>
export type MachineTaskStatus = SchemaType<typeof machineTaskStatusSchema>
export type MachineExecutionPhase = SchemaType<typeof machineExecutionPhaseSchema>
export type MachineExecutionTask = SchemaType<typeof machineExecutionTaskSchema>
export type MachineExecutionState = Omit<SchemaType<typeof machineExecutionStateSchema>, 'model'> & {
  readonly model: SupportedModelId
}
