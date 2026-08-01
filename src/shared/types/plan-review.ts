/**
 * Plan review types shared between main and renderer.
 *
 * The agent's `create_plan` tool drafts a plan and blocks until the user
 * approves it or sends it back with comments. These are the shapes that cross
 * the IPC boundary for that exchange — structurally aligned with
 * turing-harness's `PlanApprovalRequest` / `PlanApprovalDecision`, but declared
 * here so the renderer never imports the main-process agent library.
 */

export type PlanFileMutationMode = 'edit' | 'write'
export type PlanComplexity = 'low' | 'medium' | 'high'

/** A file the user attached to one step of the plan. */
export interface PlanStepAttachment {
  readonly path: string
  readonly mimeType: string
  /** Why the user attached it to this step. */
  readonly note?: string
}

/** One executable step of the plan, as rendered for review. */
export interface PlanReviewTask {
  readonly id: string
  readonly order: number
  readonly title: string
  readonly summary: string
  readonly files: readonly string[]
  readonly fileMutations: Readonly<Record<string, PlanFileMutationMode>>
  readonly complexity: PlanComplexity
  readonly verification?: string
  readonly risks?: string
  /** Instructions the user already added to this step (on a re-plan). */
  readonly userNotes?: string
  readonly attachments?: readonly PlanStepAttachment[]
}

export interface PlanReviewDocument {
  readonly id: string
  readonly title: string
  readonly summary: string
  readonly repo?: string
  readonly tasks: readonly PlanReviewTask[]
}

export interface PlanReviewSet {
  readonly plans: readonly PlanReviewDocument[]
  readonly executionOrder: readonly string[]
}

/** A drafted plan awaiting the user's verdict. */
export interface PendingPlanReviewRequest {
  /** Correlates the request with its resolution across IPC. */
  readonly planReviewId: string
  readonly planSet: PlanReviewSet
  /** 1-based draft number; increments on each re-plan. */
  readonly revision: number
  readonly task: string
  /** Comments from the previous round, when this is a re-draft. */
  readonly priorComments?: string
  /** Re-plans still available before the agent stops revising. */
  readonly revisionsRemaining: number
}

/** Per-step additions the user made while reviewing. */
export interface PlanReviewStepEdit {
  readonly taskId: string
  readonly notes?: string
  readonly attachments?: readonly PlanStepAttachment[]
}

/**
 * The user's verdict.
 *
 * `stepEdits` apply on BOTH decisions — approving the plan while attaching a
 * mockup to step 3 is the common case and must not force a re-planning round.
 */
export interface PlanReviewResolution {
  readonly planReviewId: string
  readonly decision: 'approved' | 'revise' | 'cancelled'
  /** How the plan should be redone. Only meaningful for 'revise'. */
  readonly comments?: string
  readonly stepEdits?: readonly PlanReviewStepEdit[]
}

export const PLAN_REVIEW_REQUEST_EVENT = 'openwaggle:plan-review:request'
export const PLAN_REVIEW_RESOLVED_EVENT = 'openwaggle:plan-review:resolved'
