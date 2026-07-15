import { parseJsonUnknown, safeDecodeUnknown } from '@shared/schema'
import type { AgentSendPayload, Message } from '@shared/types/agent'
import { getMessageText } from '@shared/types/agent'
import type { SessionBranchId, SessionId, SupportedModelId } from '@shared/types/brand'
import type { JsonValue } from '@shared/types/json'
import {
  machineExecutionStateSchema,
  machinePlanSchema,
  type MachineExecutionState,
  type MachineExecutionTask,
  type MachinePlan,
  type MachinePlannerTask,
} from '@shared/types/machine'
import { isRecord } from '@shared/utils/validation'
import { formatErrorMessage } from '@shared/utils/node-error'
import * as Effect from 'effect/Effect'
import { createLogger } from '../logger'
import { MachinePlanFileStore } from '../ports/machine-plan-file-store'
import { SessionRepository } from '../ports/session-repository'
import { executeAgentRun, type AgentRunResult } from './agent-run-service'
import type { AgentRunInput } from './agent-run/types'

const MACHINE_INTERNAL_CUSTOM_TYPE = 'openwaggle.machine-internal-turn'
const EMPTY_BRANCH_UI_STATE_JSON = '{}'
const logger = createLogger('machine-run-service')

interface ExecuteMachineRunInput {
  readonly sessionId: SessionId
  readonly runId: string
  readonly payload: AgentSendPayload
  readonly model: SupportedModelId
  readonly signal: AbortSignal
  readonly onEvent: AgentRunInput['onEvent']
  readonly onTitleAssigned?: (title: string) => void
}

interface ExecuteApprovedMachinePlanInput {
  readonly sessionId: SessionId
  readonly runId: string
  readonly signal: AbortSignal
  readonly onEvent: AgentRunInput['onEvent']
  readonly onTitleAssigned?: (title: string) => void
}

export type MachineRunResult = AgentRunResult

interface MachineTransportInput {
  readonly model: SupportedModelId
  readonly onEvent: AgentRunInput['onEvent']
}

interface MachineBranchContext {
  readonly branchId: SessionBranchId
  readonly uiStateJson: string
}

interface MutableMachineBranchContext {
  branchId: SessionBranchId
  uiStateJson: string
}

const MACHINE_SYSTEM_SPEC_LINES = [
  'Project: Multi-Model Software Engineering System.',
  'Goal: beat strong single-model coding workflows for website and game development by operating as an AI software company.',
  'Core idea:',
  '- Do not behave like one super AI.',
  '- Behave like an AI software company where specialized roles collaborate through a central orchestrator that maintains the complete understanding of the project.',
  'System architecture:',
  '- User Prompt -> Executive Planner (CEO) -> Product + Architecture Design -> Dependency Graph (DPM) -> Engineering Manager -> Frontend Workers / Backend Workers / Infrastructure Workers -> Code Review Pipeline -> Build / Test / Validate -> Failure Analyzer -> Repair Task Generator -> Repeat Until Green.',
  'Shared memory:',
  '- Every role reads and writes the same project memory.',
  '- Shared memory contains requirements, UI design, architecture, API contracts, database schema, folder structure, coding guidelines, dependency graph, progress, previous decisions, test results, bugs, and acceptance criteria.',
  '- Nobody works independently; everyone works from the same source of truth.',
  'Execution pipeline:',
  '- Understand Request.',
  '- Product Planning.',
  '- Architecture Design.',
  '- Generate Dependency Graph.',
  '- Break into Micro Tasks.',
  '- Route Tasks to Best Models.',
  '- Implement.',
  '- Review.',
  '- Build.',
  '- Test.',
  '- Repair.',
  '- Repeat until complete.',
  'Reference planning expectations:',
  '- For full-stack website work, cover features, pages, APIs, database, authentication, folder structure, UI theme, and acceptance tests when relevant.',
  '- For frontend-only work, cover pages, component graph, navbar, sidebar, charts, cards, tables, notifications, settings, responsiveness, accessibility, animation smoothness, design consistency, skeleton loading, empty states, and dark mode when relevant.',
  '- For backend-only work, cover database design, API design, business rules, authentication, middleware, permissions, stock or domain calculations, caching, audit logs, rate limiting, tests, API documentation, security scans, and performance benchmarks when relevant.',
  'Task routing:',
  '- Classify each task by specialty and adopt the best worker mindset for UI animation, React components, database queries, authentication, testing, security, and other domains.',
  'Review pipeline:',
  '- Every completed task must pass syntax review, logic review, architecture review, performance review, security review, style review, and acceptance testing.',
  '- If review fails, generate a repair task, fix the issue, and review again.',
  'Competitive coding:',
  '- For critical tasks, consider multiple implementation approaches and select or combine the best parts using correctness, readability, performance, accessibility, and maintainability as the scorecard.',
  'Integration loop:',
  '- Merge completed work, compile, lint, run unit tests, integration tests, UI tests, and performance tests, detect bugs, generate repair tasks, and repeat until green.',
  'Quality objective:',
  '- Achieve high quality, consistency, and speed through tiny well-scoped tasks, specialized execution, shared memory alignment, and strong global orchestration.',
] as const

function plannerPrompt(goal: string) {
  return [
    'Machine mode is enabled.',
    'You are the planning agent for a sequential coding workflow.',
    'Adopt the Multi-Model Software Engineering System below and compress it into one repository-aware machine-mode plan.',
    ...MACHINE_SYSTEM_SPEC_LINES,
    'Planner-specific instructions:',
    '- Act as the Executive Planner (CEO), product planner, architect, dependency planner, and engineering manager for this session.',
    "- Maintain the orchestrator's complete understanding of the project while planning.",
    '- Treat the repository, current conversation, active plan state, and existing files as the shared project memory for this run.',
    '- Before emitting tasks, internally cover requirements, UI design, architecture, API contracts, database schema, folder structure, coding guidelines, dependency graph, progress, previous decisions, test results, bugs, and acceptance criteria whenever they are relevant.',
    '- The ideal system can execute many tiny tasks in parallel, but this machine mode executes sequentially in a single repository session.',
    '- Therefore, produce the smallest ordered dependency-respecting plan that still captures the benefits of specialized roles, review gates, validation, failure analysis, and repair loops.',
    '- Break the request into tiny implementation-focused micro tasks whenever practical.',
    '- Every task should name a concrete artifact, scope, or outcome rather than a vague area of work.',
    '- Include frontend, backend, infrastructure, review, build, test, validation, and repair work when relevant.',
    '- Prefer concrete tasks such as creating a specific component, route, schema, API, validation rule, test, review pass, or repair step.',
    '- Keep tasks sequential for execution, but preserve dependency intent with dependsOn so the orchestration logic remains explicit.',
    'Return exactly one JSON object and no prose.',
    'Do not explain your reasoning.',
    'Do not include any conversational text.',
    'Do not say what you are about to do.',
    'Use this JSON shape:',
    '{',
    '  "goal": "string",',
    '  "tasks": [',
    '    {',
    '      "id": "task-1",',
    '      "title": "short title",',
    '      "prompt": "the exact instruction to execute next",',
    '      "dependsOn": ["task ids this task depends on"]',
    '    }',
    '  ]',
    '}',
    'Rules:',
    '- Keep tasks sequential, dependency-aware, and implementation-focused.',
    '- Every task prompt should be ready to send directly to the coding agent.',
    '- Reflect the shared memory and orchestration context in the task prompts when it matters for correctness.',
    '- Include acceptance intent and validation expectations inside task prompts whenever that improves execution quality.',
    '- Do not include markdown fences.',
    '- Do not include explanatory prose before or after the JSON.',
    '',
    'User request:',
    goal,
  ].join('\n')
}

function machineTaskExecutionPrompt(task: MachineExecutionTask, goal: string) {
  return [
    'Machine mode is executing a task from an approved plan.',
    'You are acting inside the Multi-Model Software Engineering System below while executing one approved task at a time.',
    ...MACHINE_SYSTEM_SPEC_LINES,
    'Execution-specific instructions:',
    "- Act as the best specialized worker for this task while preserving the central orchestrator's global understanding.",
    '- Treat the repository, active branch, current task state, prior task outputs, decisions, tests, and visible code as shared project memory.',
    'Carry out the requested repository change now.',
    'Do not create another plan.',
    'Do not restate the prompt.',
    'Make the code or file changes directly when they are needed.',
    '- Use the task-classifier mindset to choose the right engineering specialty for the work in front of you.',
    '- Apply the relevant review pipeline to what you change: syntax, logic, architecture, performance, security, style, and acceptance.',
    '- Run the relevant integration loop steps for the scope you touch: compile, lint, unit tests, integration tests, UI tests, performance checks, bug detection, repair, and re-validation when applicable.',
    '- If a failure appears, analyze it, repair it, and continue until the task is green or you hit a real blocker.',
    '- For critical choices, consider competing implementation approaches and choose the best tradeoff for correctness, readability, performance, accessibility, and maintainability.',
    '- Keep the implementation aligned with requirements, UI design, architecture, API contracts, database schema, folder structure, coding guidelines, dependency graph, progress, previous decisions, test results, bugs, and acceptance criteria.',
    'If the work is already complete, verify it and continue with minimal explanation.',
    '',
    `Overall goal: ${goal}`,
    `Current task: ${task.title}`,
    `Task id: ${task.id}`,
    `Task dependencies: ${task.dependsOn?.length ? task.dependsOn.join(', ') : 'none'}`,
    '',
    'Task instruction:',
    task.prompt,
  ].join('\n')
}

function hiddenPromptDelivery(task: MachinePlannerTask) {
  return {
    mode: 'hidden-custom-message' as const,
    customType: MACHINE_INTERNAL_CUSTOM_TYPE,
    details: {
      source: 'openwaggle',
      kind: 'machine-task',
      taskId: task.id,
      taskTitle: task.title,
    },
  }
}

function latestAssistantText(messages: readonly Message[]) {
  const assistantMessages = messages.filter((message) => message.role === 'assistant')
  const latestAssistant = assistantMessages[assistantMessages.length - 1]
  return latestAssistant ? getMessageText(latestAssistant).trim() : ''
}

export function isInternalToolHandoffAssistantText(text: string) {
  const normalized = text.trim()
  if (!normalized.startsWith('[TOOL_HANDOFF]')) {
    return false
  }

  const payloadText = normalized.slice('[TOOL_HANDOFF]'.length).trim()
  if (!payloadText.startsWith('{')) {
    return false
  }

  try {
    const parsed = JSON.parse(payloadText)
    return typeof parsed === 'object' && parsed !== null && 'type' in parsed && parsed.type === 'tool_handoff'
  } catch {
    return false
  }
}

export function getVisibleMachineTaskMessages(messages: readonly Message[]) {
  return messages.filter((message) => {
    if (message.role !== 'assistant') {
      return false
    }

    const text = getMessageText(message).trim()
    const hasRenderableNonTextPart = message.parts.some(
      (part) => part.type === 'tool-call' || part.type === 'tool-result' || part.type === 'reasoning',
    )

    return hasRenderableNonTextPart || (text.length > 0 && !isInternalToolHandoffAssistantText(text))
  })
}

function visibleMachineTaskMessageIds(messages: readonly Message[]) {
  return getVisibleMachineTaskMessages(messages).map((message) => String(message.id))
}

function extractJsonBlock(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()
  return text.trim()
}

function extractFirstJsonObject(text: string) {
  const start = text.indexOf('{')
  if (start === -1) {
    return null
  }

  let depth = 0
  let inString = false
  let isEscaped = false

  for (let index = start; index < text.length; index += 1) {
    const char = text[index]

    if (inString) {
      if (isEscaped) {
        isEscaped = false
        continue
      }
      if (char === '\\') {
        isEscaped = true
        continue
      }
      if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{') {
      depth += 1
      continue
    }

    if (char !== '}') {
      continue
    }

    depth -= 1
    if (depth === 0) {
      return text.slice(start, index + 1).trim()
    }
  }

  return null
}

export function parseMachinePlan(text: string): MachinePlan {
  const normalized = extractJsonBlock(text)
  let parsedPlan: unknown

  try {
    parsedPlan = parseJsonUnknown(normalized)
  } catch (error) {
    const recoveredJson = extractFirstJsonObject(normalized)
    if (!recoveredJson) {
      throw error
    }
    parsedPlan = parseJsonUnknown(recoveredJson)
  }

  const decoded = safeDecodeUnknown(machinePlanSchema, parsedPlan)
  if (!decoded.success) {
    throw new Error(decoded.issues.join('; '))
  }

  const goal = decoded.data.goal.trim()
  if (!goal) {
    throw new Error('Planner JSON is missing a non-empty "goal".')
  }

  const tasks = decoded.data.tasks.map((task, index) => {
    const id = task.id.trim()
    const title = task.title.trim()
    const prompt = task.prompt.trim()
    const dependsOn = [...new Set((task.dependsOn ?? []).map((value) => value.trim()).filter(Boolean))]

    if (!id || !title || !prompt) {
      throw new Error(`Task ${String(index + 1)} is missing id, title, or prompt.`)
    }

    return { id, title, prompt, dependsOn }
  })

  if (tasks.length === 0) {
    throw new Error('Planner JSON is missing a non-empty "tasks" array.')
  }
  validateMachinePlanTasks(tasks)
  return { goal, tasks }
}

function validateMachinePlanTasks(tasks: readonly MachinePlannerTask[]) {
  const seenIds = new Set<string>()
  for (const task of tasks) {
    if (seenIds.has(task.id)) {
      throw new Error(`Planner JSON contains a duplicate task id: ${task.id}`)
    }
    seenIds.add(task.id)
  }

  for (const task of tasks) {
    for (const dependency of task.dependsOn ?? []) {
      if (!seenIds.has(dependency)) {
        throw new Error(`Task "${task.id}" depends on unknown task "${dependency}".`)
      }
    }
  }
}

function planValidationError(message: string): MachineRunResult {
  return {
    outcome: 'error',
    message,
    code: 'machine-plan-invalid',
  }
}

function emitMachineLifecycleEvent(
  input: MachineTransportInput,
  name: string,
  value?: JsonValue,
) {
  input.onEvent({
    type: 'custom',
    name,
    ...(value ? { value } : {}),
    timestamp: Date.now(),
    model: input.model,
  })
}

function parseBranchUiStateRecord(uiStateJson: string) {
  try {
    const parsed = parseJsonUnknown(uiStateJson)
    return isRecord(parsed) ? { ...parsed } : {}
  } catch {
    return {}
  }
}

function readPersistedMachineState(uiStateJson: string): MachineExecutionState | null {
  const parsed = parseBranchUiStateRecord(uiStateJson)
  if (!('machine' in parsed)) {
    return null
  }

  const decoded = safeDecodeUnknown(machineExecutionStateSchema, parsed.machine)
  if (!decoded.success) {
    return null
  }

  return decoded.data as MachineExecutionState
}

export function readPersistedMachinePlanModel(uiStateJson: string): SupportedModelId | null {
  return readPersistedMachineState(uiStateJson)?.model ?? null
}

function mergeMachineStateIntoUiState(
  uiStateJson: string,
  machineState: MachineExecutionState | null,
): string {
  const parsed = parseBranchUiStateRecord(uiStateJson)
  if (machineState) {
    parsed.machine = machineState
  } else {
    delete parsed.machine
  }
  return JSON.stringify(parsed)
}

function taskDependencies(task: Pick<MachinePlannerTask, 'dependsOn'>) {
  return task.dependsOn ?? []
}

function createAwaitingApprovalState(
  plan: MachinePlan,
  model: SupportedModelId,
  thinkingLevel: AgentSendPayload['thinkingLevel'],
  originalRequest: string,
): MachineExecutionState {
  return {
    goal: plan.goal,
    originalRequest,
    phase: 'awaiting_approval',
    tasks: plan.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      prompt: task.prompt,
      dependsOn: task.dependsOn,
      status: 'pending',
      messageIds: [],
    })),
    model,
    thinkingLevel,
    generatedAt: Date.now(),
  }
}

function markMachinePlanApproved(state: MachineExecutionState): MachineExecutionState {
  return {
    ...state,
    phase: 'running',
    approvedAt: Date.now(),
    finishedAt: undefined,
    lastError: undefined,
  }
}

function markTaskRunning(
  state: MachineExecutionState,
  taskId: string,
): MachineExecutionState {
  return {
    ...state,
    phase: 'running',
    currentTaskId: taskId,
    lastError: undefined,
    tasks: state.tasks.map((task) =>
      task.id === taskId
        ? { ...task, status: 'running', lastError: undefined }
        : task.status === 'running'
          ? { ...task, status: 'pending', lastError: undefined }
          : task,
    ),
  }
}

function markTaskCompleted(
  state: MachineExecutionState,
  taskId: string,
  messageIds: readonly string[],
): MachineExecutionState {
  return {
    ...state,
    currentTaskId: undefined,
    tasks: state.tasks.map((task) =>
      task.id === taskId ? { ...task, status: 'completed', messageIds: [...messageIds], lastError: undefined } : task,
    ),
  }
}

function markTaskFailed(
  state: MachineExecutionState,
  taskId: string,
  message: string,
  messageIds: readonly string[] = [],
): MachineExecutionState {
  return {
    ...state,
    phase: 'failed',
    currentTaskId: taskId,
    finishedAt: Date.now(),
    lastError: message,
    tasks: state.tasks.map((task) =>
      task.id === taskId ? { ...task, status: 'failed', messageIds: [...messageIds], lastError: message } : task,
    ),
  }
}

function markPlanFailed(state: MachineExecutionState, message: string): MachineExecutionState {
  return {
    ...state,
    phase: 'failed',
    finishedAt: Date.now(),
    lastError: message,
  }
}

function markPlanCompleted(state: MachineExecutionState): MachineExecutionState {
  return {
    ...state,
    phase: 'completed',
    currentTaskId: undefined,
    finishedAt: Date.now(),
    lastError: undefined,
  }
}

function runnableTask(state: MachineExecutionState): MachineExecutionTask | null {
  const completedTaskIds = new Set(
    state.tasks.filter((task) => task.status === 'completed').map((task) => task.id),
  )

  for (const task of state.tasks) {
    if (task.status === 'completed') {
      continue
    }
    if (taskDependencies(task).every((dependency) => completedTaskIds.has(dependency))) {
      return task
    }
  }

  return null
}

function resolveBranchContext(
  sessionId: SessionId,
): Effect.Effect<MachineBranchContext, Error, SessionRepository> {
  return Effect.gen(function* () {
    const sessionRepo = yield* SessionRepository
    const workspace = yield* sessionRepo.getWorkspace(sessionId)
    if (!workspace?.activeBranchId) {
      return yield* Effect.fail(new Error('Machine mode requires an active session branch.'))
    }

    return {
      branchId: workspace.activeBranchId,
      uiStateJson: workspace.activeBranchState?.uiStateJson ?? EMPTY_BRANCH_UI_STATE_JSON,
    }
  })
}

/**
 * Keep each task's `isCompleted` flag in sync with its status. This is the single
 * choke point (via `persistMachineState`) so the persisted state, the timeline
 * card, and the on-disk plan file always agree — orchestration logic itself keeps
 * using `status`, so this flag can never drift the run.
 */
export function normalizeMachineState(state: MachineExecutionState): MachineExecutionState {
  return {
    ...state,
    tasks: state.tasks.map((task) => ({ ...task, isCompleted: task.status === 'completed' })),
  }
}

function persistMachineState(
  sessionId: SessionId,
  branchContext: MutableMachineBranchContext,
  machineState: MachineExecutionState | null,
): Effect.Effect<void, Error, SessionRepository | MachinePlanFileStore> {
  return Effect.gen(function* () {
    const normalized = machineState ? normalizeMachineState(machineState) : null
    const sessionRepo = yield* SessionRepository
    branchContext.uiStateJson = mergeMachineStateIntoUiState(branchContext.uiStateJson, normalized)
    yield* sessionRepo.updateBranchUiState(
      sessionId,
      branchContext.branchId,
      branchContext.uiStateJson,
    )

    // Mirror the plan to a file while the run is in progress; remove it once the
    // whole run has completed (or the plan was cleared).
    const planFileStore = yield* MachinePlanFileStore
    if (normalized && normalized.phase !== 'completed') {
      yield* planFileStore.write(sessionId, normalized)
    } else {
      yield* planFileStore.remove(sessionId)
    }
  })
}

function runTask(
  input: ExecuteApprovedMachinePlanInput,
  plan: MachineExecutionState,
  task: MachineExecutionTask,
  model: SupportedModelId,
  thinkingLevel: AgentSendPayload['thinkingLevel'],
) {
  emitMachineLifecycleEvent({ model, onEvent: input.onEvent }, 'machine:task-start', {
    taskId: task.id,
    title: task.title,
  })
  return executeAgentRun({
    sessionId: input.sessionId,
    runId: `${input.runId}:${task.id}`,
    payload: {
      text: machineTaskExecutionPrompt(task, plan.goal),
      thinkingLevel,
      attachments: [],
    },
    model,
    runMode: 'machine',
    promptDelivery: hiddenPromptDelivery(task),
    signal: input.signal,
    onEvent: input.onEvent,
  })
}

export function executeMachineRun(input: ExecuteMachineRunInput) {
  return Effect.gen(function* () {
    const branchContext: MutableMachineBranchContext = yield* resolveBranchContext(input.sessionId).pipe(
      Effect.map((value) => ({ ...value })),
    )

    emitMachineLifecycleEvent(input, 'machine:run-start')
    emitMachineLifecycleEvent(input, 'machine:planning-start', {
      goal: input.payload.text,
    })

    const plannerResult = yield* executeAgentRun({
      sessionId: input.sessionId,
      runId: `${input.runId}:planner`,
      payload: {
        ...input.payload,
        text: plannerPrompt(input.payload.text),
      },
      model: input.model,
      runMode: 'machine',
      signal: input.signal,
      onEvent: input.onEvent,
      onTitleAssigned: input.onTitleAssigned,
    })

    if (plannerResult.outcome !== 'success') {
      emitMachineLifecycleEvent(input, 'machine:run-end', {
        outcome: plannerResult.outcome,
      })
      return plannerResult
    }

    let plan: MachinePlan
    try {
      plan = parseMachinePlan(latestAssistantText(plannerResult.newMessages))
    } catch (error) {
      logger.warn('Machine mode planner returned invalid plan JSON', {
        sessionId: input.sessionId,
        error: formatErrorMessage(error),
      })
      emitMachineLifecycleEvent(input, 'machine:run-end', {
        outcome: 'error',
        code: 'machine-plan-invalid',
      })
      return planValidationError(
        error instanceof Error ? error.message : 'Planner returned invalid machine plan JSON.',
      )
    }

    const machineState = createAwaitingApprovalState(
      plan,
      input.model,
      input.payload.thinkingLevel,
      input.payload.text,
    )
    yield* persistMachineState(input.sessionId, branchContext, machineState)

    emitMachineLifecycleEvent(input, 'machine:plan-ready', {
      goal: plan.goal,
      taskCount: plan.tasks.length,
    })
    emitMachineLifecycleEvent(input, 'machine:awaiting-approval', {
      goal: plan.goal,
      taskCount: plan.tasks.length,
    })
    emitMachineLifecycleEvent(input, 'machine:run-end', {
      outcome: 'awaiting_approval',
      taskCount: plan.tasks.length,
    })

    return plannerResult
  })
}

export function executeApprovedMachinePlan(input: ExecuteApprovedMachinePlanInput) {
  return Effect.gen(function* () {
    const branchContext: MutableMachineBranchContext = yield* resolveBranchContext(input.sessionId).pipe(
      Effect.map((value) => ({ ...value })),
    )
    let machineState = readPersistedMachineState(branchContext.uiStateJson)
    if (!machineState || machineState.phase !== 'awaiting_approval') {
      return planValidationError('No machine plan is awaiting approval for this session.')
    }
    const machineModel = machineState.model

    emitMachineLifecycleEvent({ model: machineModel, onEvent: input.onEvent }, 'machine:run-start')
    machineState = markMachinePlanApproved(machineState)
    yield* persistMachineState(input.sessionId, branchContext, machineState)
    emitMachineLifecycleEvent({ model: machineModel, onEvent: input.onEvent }, 'machine:plan-approved', {
      goal: machineState.goal,
      taskCount: machineState.tasks.length,
    })

    let lastSuccessfulResult: MachineRunResult | null = null

    while (!input.signal.aborted) {
      const nextTask = runnableTask(machineState)
      if (!nextTask) {
        if (machineState.tasks.every((task) => task.status === 'completed')) {
          machineState = markPlanCompleted(machineState)
          yield* persistMachineState(input.sessionId, branchContext, machineState)
          emitMachineLifecycleEvent({ model: machineModel, onEvent: input.onEvent }, 'machine:run-end', {
            outcome: 'success',
            completedTasks: machineState.tasks.length,
            totalTasks: machineState.tasks.length,
          })
          return lastSuccessfulResult ?? planValidationError('Machine plan completed without task output.')
        }

        const stalledMessage =
          'Machine plan stalled because no runnable task remained. Check task dependencies.'
        machineState = markPlanFailed(machineState, stalledMessage)
        yield* persistMachineState(input.sessionId, branchContext, machineState)
        emitMachineLifecycleEvent({ model: machineModel, onEvent: input.onEvent }, 'machine:run-end', {
          outcome: 'error',
          code: 'machine-plan-stalled',
        })
        return planValidationError(stalledMessage)
      }

      machineState = markTaskRunning(machineState, nextTask.id)
      yield* persistMachineState(input.sessionId, branchContext, machineState)

      const taskResult = yield* runTask(
        input,
        machineState,
        nextTask,
        machineModel,
        machineState.thinkingLevel,
      )
      if (taskResult.outcome !== 'success') {
        const failureMessage =
          taskResult.outcome === 'aborted'
            ? 'Machine run was cancelled.'
            : 'message' in taskResult
              ? taskResult.message
              : 'Machine task failed.'
        machineState = markTaskFailed(machineState, nextTask.id, failureMessage)
        yield* persistMachineState(input.sessionId, branchContext, machineState)
        emitMachineLifecycleEvent({ model: machineModel, onEvent: input.onEvent }, 'machine:task-end', {
          taskId: nextTask.id,
          title: nextTask.title,
          outcome: taskResult.outcome,
        })
        emitMachineLifecycleEvent({ model: machineModel, onEvent: input.onEvent }, 'machine:run-end', {
          outcome: taskResult.outcome,
        })
        return taskResult
      }

      const taskMessageIds = visibleMachineTaskMessageIds(taskResult.newMessages)
      if (taskMessageIds.length === 0) {
        const failureMessage =
          'Machine task reported success without any visible execution output. The agent likely stopped at an internal tool handoff.'
        machineState = markTaskFailed(machineState, nextTask.id, failureMessage)
        yield* persistMachineState(input.sessionId, branchContext, machineState)
        emitMachineLifecycleEvent({ model: machineModel, onEvent: input.onEvent }, 'machine:task-end', {
          taskId: nextTask.id,
          title: nextTask.title,
          outcome: 'error',
          code: 'machine-task-no-visible-output',
        })
        emitMachineLifecycleEvent({ model: machineModel, onEvent: input.onEvent }, 'machine:run-end', {
          outcome: 'error',
          code: 'machine-task-no-visible-output',
        })
        return {
          outcome: 'error',
          message: failureMessage,
          code: 'machine-task-no-visible-output',
        } satisfies MachineRunResult
      }

      machineState = markTaskCompleted(machineState, nextTask.id, taskMessageIds)
      yield* persistMachineState(input.sessionId, branchContext, machineState)
      lastSuccessfulResult = taskResult
      emitMachineLifecycleEvent({ model: machineModel, onEvent: input.onEvent }, 'machine:task-end', {
        taskId: nextTask.id,
        title: nextTask.title,
        outcome: 'success',
        completedTasks: machineState.tasks.filter((task) => task.status === 'completed').length,
        totalTasks: machineState.tasks.length,
      })
    }

    const activeTaskId = machineState.currentTaskId ?? machineState.tasks.find((task) => task.status === 'running')?.id
    if (activeTaskId) {
      machineState = markTaskFailed(machineState, activeTaskId, 'Machine run was cancelled.')
    } else {
      machineState = markPlanFailed(machineState, 'Machine run was cancelled.')
    }
    yield* persistMachineState(input.sessionId, branchContext, machineState)
    emitMachineLifecycleEvent({ model: machineModel, onEvent: input.onEvent }, 'machine:run-end', {
      outcome: 'aborted',
    })
    return { outcome: 'aborted' } satisfies MachineRunResult
  })
}

export function discardMachinePlan(sessionId: SessionId) {
  return Effect.gen(function* () {
    const branchContext = yield* resolveBranchContext(sessionId)
    const sessionRepo = yield* SessionRepository
    const nextUiStateJson = mergeMachineStateIntoUiState(branchContext.uiStateJson, null)
    yield* sessionRepo.updateBranchUiState(sessionId, branchContext.branchId, nextUiStateJson)
    const planFileStore = yield* MachinePlanFileStore
    yield* planFileStore.remove(sessionId)
  })
}
