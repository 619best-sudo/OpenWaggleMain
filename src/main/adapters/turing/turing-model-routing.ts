/**
 * Escalation routing: which model handles a read or a write, by complexity.
 *
 * This file is the single source of truth for that decision. turing-harness
 * consumes it through the `routeModel` hook on the harness config, so the policy
 * lives here in the app rather than being implied by the ordering and arity of a
 * candidate pool (`toolModelCandidates`, whose tier is `floor(score * length)` —
 * correct, but impossible to read as policy and easy to shift by accident when
 * someone appends a model).
 *
 * Two axes:
 *
 *   KIND — `read` escalations hand a file the loop's model was judged unable to
 *     reason about to a stronger model for comprehension. `write` escalations
 *     hand the actual bytes of a write/edit to a stronger model to author. They
 *     get different models on purpose: comprehension rewards raw capability,
 *     authoring rewards instruction-following and diff discipline.
 *
 *   RATING — `low` is deliberately absent. A low-rated call proceeds on the
 *     loop's own model with no second call at all; escalating it would spend a
 *     model round-trip to re-derive something already known. Only `medium` and
 *     `high` route.
 *
 * The loop's default/driver model is configured separately (`TuringLlmConfig.
 * modelSlug`) and is unaffected by anything here.
 */
import type { ModelRouter } from 'turing-harness'

/** Complexity ratings that actually escalate. `low` never routes. */
type RoutedRating = 'medium' | 'high'

/**
 * The table. Edit this to change routing — nothing else needs to move.
 *
 * Every slug must exist on OpenRouter AND, for anything that runs as the driver,
 * be reasoning-capable: a model without the capability returns stream deltas
 * carrying only `content`/`role`, so the client renders no thinking and nothing
 * anywhere reports an error.
 */
export const MODEL_ROUTING: Readonly<Record<'read' | 'write', Readonly<Record<RoutedRating, string>>>> = {
  read: {
    medium: 'deepseek/deepseek-v4-flash-0731',
    high: 'openai/gpt-5.6-terra-pro',
  },
  write: {
    medium: 'deepseek/deepseek-v4-flash-0731',
    // Deliberately `terra`, not `terra-pro`: authoring wants the model that
    // follows the edit instruction closely, not the one that reasons hardest.
    high: 'openai/gpt-5.6-terra',
  },
}

/**
 * The hook handed to turing-harness. Returning `undefined` means "no opinion" —
 * the harness falls back to its candidate pool, and then to not escalating.
 */
export const routeModel: ModelRouter = ({ kind, rating }) => {
  if (rating !== 'medium' && rating !== 'high') return undefined
  return MODEL_ROUTING[kind][rating]
}

/**
 * Every slug the table can produce, de-duplicated. Useful for warming, for
 * validating configuration at startup, and as the candidate pool fallback.
 */
export function routedModelSlugs(): readonly string[] {
  return [
    ...new Set(Object.values(MODEL_ROUTING).flatMap((byRating) => Object.values(byRating))),
  ]
}
