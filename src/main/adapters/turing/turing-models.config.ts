/**
 * THE model configuration. Every model this app chooses is declared here.
 *
 * These choices used to live in four separate files — the driver model in
 * `turing-llm-config`, vision in `turing-vision-model`, image generation in
 * `turing-media-providers`, and the complexity routing table in
 * `turing-model-routing` — each with its own env override and its own default.
 * Changing "which model does X" meant knowing which file owned X, and there was
 * nowhere to see the whole picture at once. Those modules now read from here and
 * keep their existing public APIs, so this is the only file to edit.
 *
 * ## Before changing a slug
 *
 * Check the model's real capabilities on OpenRouter — the app trusts the
 * declared modality list in turing-harness's `MODEL_CATALOG`, and a wrong entry
 * fails in a way that is very hard to read. A real example: the driver was
 * declared image-capable when it is text-only, so a Playwright screenshot was
 * serialised into the request, the provider rejected the WHOLE call, and an
 * entire browser session died with "Provider is temporarily unavailable".
 *
 *   curl -s https://openrouter.ai/api/v1/models \
 *     | jq '.data[] | select(.id=="<slug>") | .architecture.input_modalities'
 *
 * `turing-models.config.unit.test.ts` asserts the invariants that matter, so a
 * bad edit here fails a test rather than a user's run.
 */

import type { ComplexityCategory } from 'turing-harness'

/** Complexity ratings that escalate. `low` never routes — see `complexity`. */
export type RoutedRating = 'medium' | 'high'

/**
 * One cell of the escalation grid.
 *
 * Escalation is decided on three INDEPENDENT axes, and a rule names only the ones
 * it cares about. An omitted axis means "any":
 *
 *   KIND       read | write   — comprehension vs authoring.
 *   CATEGORY   ui | svg | code — what the escalation model must be strong at.
 *   RATING     medium | high  — how hard the work is.
 *   ATTACHMENT true | false   — whether the call carries a design to build FROM.
 *
 * The axes are deliberately not collapsed into one compound key. They interact,
 * but they are not the same question: an `svg` write at `medium` WITH a reference
 * image is a different job from the same write without one, and stating that as a
 * rule keeps it readable. A flat `write.svg.medium.true` key would too, but it
 * forces every combination to be spelled out; a rule with two axes omitted covers
 * twelve cells.
 *
 * Resolution is by SPECIFICITY, not declaration order: the rule naming the most
 * axes wins, so adding a broad rule can never accidentally shadow a narrow one.
 * `assertUnambiguousEscalationRules` rejects two rules of equal specificity that
 * could both match, so a genuine ambiguity fails a test rather than resolving
 * arbitrarily at runtime.
 */
export interface EscalationRule {
  readonly kind?: 'read' | 'write'
  readonly category?: ComplexityCategory
  readonly rating?: RoutedRating
  readonly attachment?: boolean
  /** The model slug this cell routes to. */
  readonly use: string
  /** Why this cell differs from the plainer rule it overrides. */
  readonly why: string
}

export interface TuringModelConfig {
  /**
   * The model that drives a run: every conversational turn and tool-calling
   * decision. Cost and latency here dominate the product, so it is deliberately
   * a small fast model, with the heavier work escalated per call via
   * {@link TuringModelConfig.complexity}.
   *
   * Must be reasoning-capable or the UI shows an empty thinking pane with no
   * error — a model without the capability simply returns deltas containing no
   * `reasoning` field, and nothing anywhere reports a problem.
   *
   * Env override: none. This is the product's choice, not an environment's.
   */
  readonly driver: string

  /**
   * Multimodal model used whenever an image has to be understood:
   *   - the `media_analysis` tool
   *   - describing a TOOL's image output (a Playwright screenshot) when the
   *     driver is text-only, so the run still "sees" the page
   *
   * MUST accept image input.
   *
   * Env override: `OPENWAGGLE_VISION_MODEL`.
   */
  readonly vision: string

  /**
   * Image-OUTPUT model for `assets_generator`. Distinct from {@link vision}:
   * that one reads images, this one produces them.
   *
   * Env override: `OPENWAGGLE_IMAGE_GEN_MODEL`.
   */
  readonly imageGeneration: string

  /**
   * Escalation routing: which model handles a read or a write, by complexity.
   *
   * KIND — `read` escalations hand a file the driver was judged unable to reason
   *   about to a stronger model for comprehension. `write` escalations hand the
   *   actual bytes of a write/edit to a stronger model to author. They differ on
   *   purpose: comprehension rewards raw capability, authoring rewards
   *   instruction-following and diff discipline.
   *
   * RATING — `low` is deliberately absent. A low-rated call proceeds on the
   *   driver with no second call at all; escalating it would spend a model
   *   round-trip to re-derive something already known.
   */
  readonly complexity: Readonly<Record<'read' | 'write', Readonly<Record<RoutedRating, string>>>>

  /**
   * Sparse per-CATEGORY overrides on top of {@link complexity}.
   *
   * CATEGORY is the third axis, and it is orthogonal to rating: it says what the
   * escalation model must be GOOD AT, never whether to escalate. The rating alone
   * cannot express that, because a trivial SVG tweak and a hairy one are both
   * `svg`.
   *
   * Note this is a CAPABILITY-TIER axis, not a modality one. Every model in
   * {@link complexity} already accepts image input — only the driver is
   * text-only — so "needs eyes" is not what this decides, and a call that
   * actually carries images is escalated separately by the harness's own vision
   * check. What differs by category is the kind of strength wanted: spatial and
   * visual reasoning for `ui`/`svg`, ordinary code reasoning for `code`.
   *
   * For write/edit the category is DECLARED by the model making the call, which
   * is strictly better than inferring it — a `.tsx` file is frequently pure
   * logic. For reads the harness infers it from the file extension, since there
   * is no declaration available and asking would cost a second rater call.
   *
   * SPARSE by design: anything no rule matches falls through to
   * {@link complexity}. Add a rule only where an axis genuinely changes the
   * answer, and only with a slug whose modalities have been verified (see the curl
   * at the top of this file).
   */
  readonly escalationRules: readonly EscalationRule[]
}

export const TURING_MODELS: TuringModelConfig = {
  // The orchestrator/driver — the work-loop model for every run. Vision is routed
  // separately to `vision` below, so keep this a text model.
  driver: 'poolside/laguna-xs-2.1',

  // Verified multimodal: ["file","image","text","audio","video"].
  vision: 'google/gemini-2.5-flash',

  imageGeneration: 'sourceful/riverflow-v2-fast',

  complexity: {
    read: {
      medium: 'tencent/hy3',
      high: 'tencent/hy3',
    },
    write: {
      medium: 'tencent/hy3',
      high: 'tencent/hy3',
    },
  },

  escalationRules: [
    // ---- ATTACHMENT axis (image-bearing writes) ----------------------------
    // tencent/hy3 is TEXT-ONLY (verified on OpenRouter: input_modalities
    // ["text"]). A write that carries an image (a mockup to author FROM) must go
    // to a vision-capable model, or the provider rejects the whole request — the
    // documented failure mode this file warns about (see header comment). So the
    // base grid routes everything to hy3, and these rules are the ONLY exceptions:
    // any image-bearing write stays on a vision model, at both ratings.
    {
      kind: 'write',
      attachment: true,
      rating: 'medium',
      use: 'openai/gpt-5.6-terra-pro',
      why: 'hy3 is text-only; authoring from an image needs a vision-capable model',
    },
    {
      kind: 'write',
      attachment: true,
      rating: 'high',
      use: 'openai/gpt-5.6-terra-pro',
      why: 'hy3 is text-only; authoring from an image needs a vision-capable model',
    },

    // ---- CATEGORY x ATTACHMENT ---------------------------------------------
    // Visual work WITH a design in hand: same reasoning as the plain attachment
    // rules — the image forces a vision model regardless of category. Kept
    // separate so the intent ("category + attachment → vision") stays readable.
    {
      kind: 'write',
      category: 'ui',
      attachment: true,
      rating: 'medium',
      use: 'openai/gpt-5.6-terra-pro',
      why: 'hy3 is text-only; UI authoring from a mockup needs a vision model',
    },
    {
      kind: 'write',
      category: 'svg',
      attachment: true,
      rating: 'medium',
      use: 'openai/gpt-5.6-terra-pro',
      why: 'hy3 is text-only; SVG authoring from a reference needs a vision model',
    },

    // No `read.*` rules: reads never carry authoring images (a read escalation
    // hands a hard file to a stronger model for comprehension, not for authoring
    // from a design), so hy3's text-only modality is never a constraint there.
    // The attachment rules above are the only place a vision model is selected.
  ],
}

/** Every slug this config can produce, de-duplicated. Useful for validation. */
export function allConfiguredModelSlugs(): readonly string[] {
  return [
    ...new Set([
      TURING_MODELS.driver,
      TURING_MODELS.vision,
      TURING_MODELS.imageGeneration,
      ...Object.values(TURING_MODELS.complexity).flatMap((byRating) => Object.values(byRating)),
    ]),
  ]
}
