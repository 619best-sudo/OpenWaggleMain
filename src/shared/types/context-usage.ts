export interface ContextUsageSnapshot {
  /** Estimated context tokens, or null when Pi marks usage unknown after compaction. */
  readonly tokens: number | null
  readonly contextWindow: number
  /** Percentage of context window used, or null when token usage is unknown. */
  readonly percent: number | null
  /**
   * What the meter measures, when it is not the literal model window. Pi's
   * transcript fills the window itself; the turing kernel measures thread
   * continuity against its own bounded budget. The renderer prefixes the
   * tooltip with this so "8% of 4k" is never misread as "8% of my model".
   */
  readonly label?: string
}

export interface ContextCompactionResult {
  readonly summary: string
  readonly firstKeptEntryId: string
  readonly tokensBefore: number
}
