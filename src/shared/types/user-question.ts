/**
 * One offered answer, as the harness sends it.
 *
 * A bare label makes the user do the thinking the agent was supposed to do — the
 * point of offering choices is that each one states its consequence, and the agent
 * marks the one it would pick. `options` carries the labels alone for anything
 * that only needs a picker; this carries the reasoning next to them.
 */
export interface UserQuestionChoice {
  readonly label: string
  /** What choosing this means — the trade-off, not a restatement of the label. */
  readonly description?: string
  /** Set on the one option the agent recommends. At most one per question. */
  readonly recommended?: boolean
}

export interface PendingUserQuestionRequest {
  readonly phase: 'prepare' | 'plan' | 'perform' | 'perfect'
  readonly question: string
  readonly kind?: 'clarification' | 'plan_review'
  readonly reason?: string
  readonly placeholder?: string
  readonly answerMode?: 'text' | 'single-select' | 'multi-select'
  readonly options?: string[]
  /**
   * The same options with their trade-offs. Sent alongside `options` rather than
   * replacing it, so a renderer that only knows about labels keeps working.
   */
  readonly choices?: readonly UserQuestionChoice[]
}

export interface UserQuestionResolution {
  readonly request: PendingUserQuestionRequest
  readonly answer: string
}
