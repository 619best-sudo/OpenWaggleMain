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
import type { ComplexityCategory, ModelRouter } from 'turing-harness'
import { type EscalationRule, type RoutedRating, TURING_MODELS } from './turing-models.config'

/**
 * Re-exported from the single model config so existing importers keep working.
 * Edit the table in `turing-models.config.ts`, not here.
 */
export const MODEL_ROUTING = TURING_MODELS.complexity

/**
 * The escalation grid: sparse rules over the category / rating / attachment axes.
 * Edit the rules in `turing-models.config.ts`, not here.
 */
export const ESCALATION_RULES = TURING_MODELS.escalationRules

/** How many axes a rule constrains. More axes ⇒ more specific ⇒ wins. */
function specificity(rule: EscalationRule): number {
  return (
    (rule.kind === undefined ? 0 : 1) +
    (rule.category === undefined ? 0 : 1) +
    (rule.rating === undefined ? 0 : 1) +
    (rule.attachment === undefined ? 0 : 1)
  )
}

/** Whether a rule's stated axes all agree with the call. Omitted axis ⇒ any. */
function matches(rule: EscalationRule, call: EscalationQuery): boolean {
  if (rule.kind !== undefined && rule.kind !== call.kind) return false
  if (rule.category !== undefined && rule.category !== call.category) return false
  if (rule.rating !== undefined && rule.rating !== call.rating) return false
  if (rule.attachment !== undefined && rule.attachment !== Boolean(call.hasAttachment)) return false
  return true
}

interface EscalationQuery {
  readonly kind: 'read' | 'write'
  readonly rating: RoutedRating
  readonly category?: ComplexityCategory
  readonly hasAttachment?: boolean
}

/**
 * Resolve one cell of the grid, or `undefined` when no rule applies and the caller
 * should fall back to {@link MODEL_ROUTING}.
 *
 * Specificity, not declaration order: a broad rule can never shadow a narrow one,
 * so rules can be grouped for readability instead of sorted for correctness.
 */
export function resolveEscalationRule(call: EscalationQuery): EscalationRule | undefined {
  let best: EscalationRule | undefined
  let bestScore = -1
  for (const rule of ESCALATION_RULES) {
    if (!matches(rule, call)) continue
    const score = specificity(rule)
    if (score > bestScore) {
      best = rule
      bestScore = score
    }
  }
  return best
}

/**
 * The hook handed to turing-harness. Returning `undefined` means "no opinion" —
 * the harness falls back to its candidate pool, and then to not escalating.
 *
 * A grid rule wins over the plain `(kind, rating)` table because it is the more
 * specific statement of policy. Anything the grid does not name falls through, so
 * the rule list stays sparse.
 */
export const routeModel: ModelRouter = ({ kind, rating, category, hasAttachment }) => {
  // Low PLAIN writes are authored by the driver — the designated author for the
  // trivial tier — routed EXPLICITLY here rather than left for the harness's old
  // silent driver-fallback (now removed). The harness errors if a plain write has
  // no routed author model, so every write tier must resolve. Low reads stay
  // unrouted (reads don't author bytes); low VISION writes stay unrouted so the
  // harness picks an image-capable model from the candidate pool (the driver is
  // text-only).
  if (rating === 'low' && kind === 'write' && !hasAttachment) {
    return TURING_MODELS.driver
  }
  if (rating !== 'medium' && rating !== 'high') return undefined
  const rule = resolveEscalationRule({
    kind,
    rating,
    ...(category ? { category } : {}),
    ...(hasAttachment ? { hasAttachment } : {}),
  })
  return rule?.use ?? MODEL_ROUTING[kind][rating]
}

/**
 * Reject two rules that are equally specific and could both match the same call.
 * Such a pair resolves arbitrarily at runtime, which is a bug that only shows up
 * as "why did this call use that model". Called from a unit test.
 */
export function assertUnambiguousEscalationRules(): void {
  const kinds = ['read', 'write'] as const
  const categories: readonly (ComplexityCategory | undefined)[] = ['ui', 'svg', 'code', undefined]
  const ratings = ['medium', 'high'] as const

  for (const kind of kinds) {
    for (const category of categories) {
      for (const rating of ratings) {
        for (const hasAttachment of [true, false]) {
          const query = { kind, rating, ...(category ? { category } : {}), hasAttachment }
          const hits = ESCALATION_RULES.filter((r) => matches(r, query))
          if (hits.length < 2) continue
          const top = Math.max(...hits.map(specificity))
          const tied = hits.filter((r) => specificity(r) === top)
          if (tied.length > 1 && new Set(tied.map((r) => r.use)).size > 1) {
            throw new Error(
              `Ambiguous escalation rules for ${kind}/${category ?? 'any'}/${rating}/` +
                `attachment=${hasAttachment}: ${tied.map((r) => r.use).join(' vs ')}. ` +
                'Add an axis to one of them.',
            )
          }
        }
      }
    }
  }
}

/**
 * Every slug the table can produce, de-duplicated. Useful for warming, for
 * validating configuration at startup, and as the candidate pool fallback.
 *
 * Includes the category overrides — a slug reachable only through a category
 * still has to be warmed and validated like any other.
 */
export function routedModelSlugs(): readonly string[] {
  return [
    ...new Set([
      ...Object.values(MODEL_ROUTING).flatMap((byRating) => Object.values(byRating)),
      ...ESCALATION_RULES.map((rule) => rule.use),
    ]),
  ]
}
