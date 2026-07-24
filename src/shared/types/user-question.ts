export interface PendingUserQuestionRequest {
  readonly phase: 'prepare' | 'plan' | 'perform' | 'perfect'
  readonly question: string
  readonly kind?: 'clarification' | 'plan_review'
  readonly reason?: string
  readonly placeholder?: string
  readonly answerMode?: 'text' | 'single-select' | 'multi-select'
  readonly options?: string[]
}

export interface UserQuestionResolution {
  readonly request: PendingUserQuestionRequest
  readonly answer: string
}
