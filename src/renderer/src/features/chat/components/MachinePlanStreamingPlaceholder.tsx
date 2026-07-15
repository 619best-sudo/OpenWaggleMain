/**
 * Shown in place of the raw machine-mode plan JSON while it streams. The plan is
 * replaced by the timeline card once it is parsed and persisted, so surfacing the
 * unformatted JSON in the meantime just looks broken.
 */
export function MachinePlanStreamingPlaceholder() {
  return (
    <output
      className="my-2 flex items-center gap-2 text-sm text-text-secondary"
      aria-live="polite"
      data-testid="machine-plan-streaming-placeholder"
    >
      <span
        className="inline-block size-2 animate-pulse rounded-full bg-text-tertiary"
        aria-hidden="true"
      />
      <span>Preparing plan…</span>
    </output>
  )
}
