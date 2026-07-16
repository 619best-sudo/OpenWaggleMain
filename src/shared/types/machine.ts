import { Schema, type SchemaType } from '@shared/schema'
import type { SupportedModelId } from './llm'
import { THINKING_LEVELS } from './settings'

/**
 * What kind of work a task performs. Together with `complexity` this drives
 * per-task tool→model routing (which model reads and mutates files while the task
 * executes). See `resolveToolRoute` in the pi tool-model-route adapter.
 */
export const machineTaskKindSchema = Schema.Literal('ui', 'svg', 'logic')

/** How demanding a task is; the second input to per-task model routing. */
export const machineTaskComplexitySchema = Schema.Literal('low', 'medium', 'high')

export const machinePlannerTaskSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  title: Schema.String.pipe(Schema.minLength(1)),
  prompt: Schema.String.pipe(Schema.minLength(1)),
  dependsOn: Schema.optional(Schema.Array(Schema.String)),
  kind: Schema.optional(machineTaskKindSchema),
  complexity: Schema.optional(machineTaskComplexitySchema),
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
  kind: Schema.optional(machineTaskKindSchema),
  complexity: Schema.optional(machineTaskComplexitySchema),
  status: machineTaskStatusSchema,
  /**
   * Convenience mirror of `status === 'completed'`. Kept in sync whenever the
   * machine state is persisted so consumers (the timeline card and the on-disk
   * plan file) have an explicit completion flag. Optional for backward-compatible
   * decoding of states persisted before this field existed.
   */
  isCompleted: Schema.optional(Schema.Boolean),
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

export type MachineTaskKind = SchemaType<typeof machineTaskKindSchema>
export type MachineTaskComplexity = SchemaType<typeof machineTaskComplexitySchema>
export type MachinePlannerTask = SchemaType<typeof machinePlannerTaskSchema>
export type MachinePlan = SchemaType<typeof machinePlanSchema>
export type MachineTaskStatus = SchemaType<typeof machineTaskStatusSchema>
export type MachineExecutionPhase = SchemaType<typeof machineExecutionPhaseSchema>
export type MachineExecutionTask = SchemaType<typeof machineExecutionTaskSchema>
export type MachineExecutionState = Omit<
  SchemaType<typeof machineExecutionStateSchema>,
  'model'
> & {
  readonly model: SupportedModelId
}
