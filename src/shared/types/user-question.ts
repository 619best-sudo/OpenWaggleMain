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

/**
 * A file moving in either direction across the exchange — one the agent showed
 * WITH its question, or one the user attached to their answer.
 *
 * Structurally the same as `PlanStepAttachment`, and produced by the same
 * staging call (`window.api.prepareAttachments`): a picked file is copied into
 * the project's attachment store and comes back with a stable on-disk path,
 * because a raw drag-and-drop path can be a temp file that is gone by the time
 * the agent reads it.
 */
export interface UserQuestionAttachment {
  readonly path: string
  readonly mimeType: string
  /** Why this file is here — the agent's caption, or the user's note. */
  readonly note?: string
}

/**
 * What the agent asked the user to attach.
 *
 * Some questions are not answerable in prose: the mockup to match, the
 * screenshot of the error, the CSV whose columns decide the schema. Asking for
 * those in words gets a paragraph describing the file, which is a worse answer
 * than none. `required` means the question is not answerable without a file, so
 * the card must not let an empty submission through.
 */
export interface UserQuestionAttachmentRequest {
  readonly mode: 'optional' | 'required'
  /** Picker hints — extensions or mime types (`'.png'`, `'image/*'`). Advisory. */
  readonly accept?: readonly string[]
  /** What to attach, in the user's terms ("the Figma export of the hero"). */
  readonly hint?: string
  /** Whether more than one file is wanted. */
  readonly multiple?: boolean
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
  /**
   * Whether a free-text box must be offered ALONGSIDE the options.
   *
   * The harness sets this on every question that carries choices. The agent
   * enumerated the paths it could see, and the answer the user wants is
   * frequently the one it could not ("neither — reuse the existing queue"). A
   * picker with no escape hatch forces that user to select something wrong or
   * kill the run, and the agent never learns what they actually meant.
   */
  readonly allowFreeText?: boolean
  /**
   * Files the AGENT is showing with the question — two candidate renders to
   * choose between, the capture of the defect it wants confirmed, a generated
   * asset it wants approved. A question about something visual is far cheaper to
   * answer with the thing on screen next to it.
   */
  readonly attachments?: readonly UserQuestionAttachment[]
  /** Set when the answer should include a file. See the interface for why. */
  readonly requestAttachments?: UserQuestionAttachmentRequest
}

export interface UserQuestionResolution {
  readonly request: PendingUserQuestionRequest
  /**
   * The typed/selected answer. May be EMPTY when `attachments` carries the whole
   * answer — "send me the mockup" is answered by the file, and demanding prose
   * alongside it would be pedantry.
   */
  readonly answer: string
  /**
   * Files the user attached. The harness threads images from here into the run's
   * live attachment set, so the next write/edit authors from the pixels exactly
   * as it would for a file attached to the original prompt.
   */
  readonly attachments?: readonly UserQuestionAttachment[]
}
