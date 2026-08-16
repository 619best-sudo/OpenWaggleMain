/**
 * Invariants for the single model configuration.
 *
 * These exist because a wrong entry here fails in a way that is very hard to
 * read from the outside. The driver model was once declared image-capable when
 * it is text-only; a Playwright screenshot was serialised into the request, the
 * provider rejected the whole call, and an entire browser session died showing
 * only "Provider is temporarily unavailable". Nothing pointed at the config.
 *
 * These assertions are offline — they check the config against turing-harness's
 * MODEL_CATALOG, which is what the runtime actually trusts when deciding whether
 * to send an image. Verifying the catalog itself against live OpenRouter
 * metadata is a separate, network-dependent concern.
 */
import { resolveModel } from 'turing-harness'
import { describe, expect, it } from 'vitest'
import {
  assertUnambiguousEscalationRules,
  MODEL_ROUTING,
  routeModel,
  routedModelSlugs,
} from '../turing-model-routing'
import {
  allConfiguredModelSlugs,
  type EscalationRule,
  TURING_MODELS,
} from '../turing-models.config'

/** Human-readable rule label for assertion messages. */
function describeRule(rule: EscalationRule): string {
  const axes = [
    rule.kind ?? 'any-kind',
    rule.category ?? 'any-category',
    rule.rating ?? 'any-rating',
    rule.attachment === undefined ? 'any-attachment' : `attachment=${rule.attachment}`,
  ]
  return `[${axes.join('/')} -> ${rule.use}]`
}

describe('turing model config', () => {
  it('names a model for every role', () => {
    expect(TURING_MODELS.driver).toBeTruthy()
    expect(TURING_MODELS.vision).toBeTruthy()
    expect(TURING_MODELS.imageGeneration).toBeTruthy()
    for (const kind of ['read', 'write'] as const) {
      for (const rating of ['medium', 'high'] as const) {
        expect(TURING_MODELS.complexity[kind][rating]).toBeTruthy()
      }
    }
  })

  it('uses provider-qualified slugs', () => {
    // A bare name reaches OpenRouter verbatim and 404s. The backend no longer
    // rewrites the model, so the slug leaving this app must already be valid.
    for (const slug of allConfiguredModelSlugs()) {
      expect(slug, `${slug} should look like "provider/model"`).toMatch(/^[^/\s]+\/[^\s]+$/)
    }
  })

  it('the vision model can actually read images', () => {
    // The whole point of the role. If this is text-only, describing a screenshot
    // silently produces nothing useful and tool images are effectively lost.
    const vision = resolveModel(TURING_MODELS.vision)
    expect(vision.input, `${TURING_MODELS.vision} must accept image input`).toContain('image')
  })

  it('does not claim the driver reads images unless the catalog agrees', () => {
    // Not a requirement that the driver be multimodal — it is deliberately not.
    // The requirement is that the CATALOG tells the truth, because that is what
    // gates whether an image is put on the wire.
    const driver = resolveModel(TURING_MODELS.driver)
    expect(Array.isArray(driver.input)).toBe(true)
    expect(driver.input.length).toBeGreaterThan(0)
    expect(driver.input).toContain('text')
  })

  it('never escalates a read or write to the driver itself', () => {
    // Escalation exists to reach a STRONGER model. Routing back to the driver
    // spends an extra round-trip to re-derive what it already concluded.
    for (const kind of ['read', 'write'] as const) {
      for (const rating of ['medium', 'high'] as const) {
        expect(
          TURING_MODELS.complexity[kind][rating],
          `${kind}/${rating} escalates to the driver, which is a no-op`,
        ).not.toBe(TURING_MODELS.driver)
      }
    }
  })

  it('keeps the routing table reachable through the existing export', () => {
    // `turing-model-routing` re-exports this; importers must not have to change.
    expect(TURING_MODELS.complexity.read.high).toBeTruthy()
    expect(TURING_MODELS.complexity.write.high).toBeTruthy()
  })

  it('never escalates a grid rule to the driver either', () => {
    // Same invariant as the rating table, applied to the grid. A rule is easy to
    // add without re-reading the constraint it has to satisfy.
    for (const rule of TURING_MODELS.escalationRules) {
      expect(rule.use, `${describeRule(rule)} escalates to the driver, which is a no-op`).not.toBe(
        TURING_MODELS.driver,
      )
    }
  })

  it('every grid rule names a provider-qualified slug and says why it exists', () => {
    for (const rule of TURING_MODELS.escalationRules) {
      expect(rule.use, `${describeRule(rule)} should look like "provider/model"`).toMatch(
        /^[^/\s]+\/[^\s]+$/,
      )
      // A cell without a stated reason is how a grid like this rots.
      expect(rule.why.length, `${describeRule(rule)} needs a why`).toBeGreaterThan(10)
    }
  })

  it('every grid rule constrains at least one axis', () => {
    // A rule with no axes matches everything and silently becomes the whole policy.
    for (const rule of TURING_MODELS.escalationRules) {
      const axes = [rule.kind, rule.category, rule.rating, rule.attachment].filter(
        (a) => a !== undefined,
      )
      expect(axes.length, `${describeRule(rule)} constrains nothing`).toBeGreaterThan(0)
    }
  })
})

describe('the escalation grid', () => {
  it('resolves the whole write grid to exactly the intended models', () => {
    // The full cross-product, written out. This is the readable statement of policy
    // — if a rule changes, this table is what says whether the change was intended.
    //
    // Policy: tencent/hy3 for every text-only write (medium and high, any
    // category), because hy3 is cheap and capable for code/SVG authored from a
    // text spec. The ONLY exception is an image-bearing write (a mockup to author
    // FROM), which MUST go to a vision-capable model — hy3 is text-only and would
    // be rejected by the provider. That exception is terra-pro at both ratings.
    const grid = (category: 'ui' | 'svg' | 'code', hasAttachment: boolean) =>
      (['medium', 'high'] as const).map((rating) =>
        routeModel({ kind: 'write', rating, category, hasAttachment }),
      )

    const HY3 = 'tencent/hy3'
    const PRO = 'openai/gpt-5.6-terra-pro'

    // Text-only writes: hy3 everywhere, regardless of category or rating.
    //                                         [medium, high]
    expect(grid('code', false)).toEqual([HY3, HY3])
    expect(grid('ui', false)).toEqual([HY3, HY3])
    expect(grid('svg', false)).toEqual([HY3, HY3])
    // Image-bearing writes: terra-pro everywhere (hy3 cannot see images).
    expect(grid('code', true)).toEqual([PRO, PRO])
    expect(grid('ui', true)).toEqual([PRO, PRO])
    expect(grid('svg', true)).toEqual([PRO, PRO])
  })

  it('attachment changes the answer; category alone does not (text-only is hy3 regardless)', () => {
    // Under the hy3-everywhere policy, category no longer changes a text-only
    // outcome — code, ui and svg all route to hy3. Only attachment (image input)
    // forces a different model, because hy3 is text-only.
    const base = { kind: 'write', rating: 'high', category: 'code' } as const
    // rating still matters: medium vs high are both hy3, so it does NOT change the
    // slug here (documented — the policy collapses the rating axis for text writes).
    expect(routeModel({ ...base, rating: 'medium' })).toBe(routeModel(base))
    // category does not change a text-only outcome
    expect(routeModel({ kind: 'write', rating: 'high', category: 'ui' })).toBe(
      routeModel({ kind: 'write', rating: 'high', category: 'code' }),
    )
    // attachment DOES change it: image input forces a vision model
    expect(routeModel({ ...base, hasAttachment: true })).not.toBe(
      routeModel({ ...base, hasAttachment: false }),
    )
  })

  it('a more specific rule wins regardless of declaration order', () => {
    // ui+attachment+medium is more specific than attachment+medium, so it wins even
    // though the broader rule is declared first in the file. Both resolve to
    // terra-pro under the hy3-everywhere-except-images policy.
    expect(routeModel({ kind: 'write', rating: 'medium', category: 'ui', hasAttachment: true })).toBe(
      'openai/gpt-5.6-terra-pro',
    )
    expect(
      routeModel({ kind: 'write', rating: 'medium', category: 'code', hasAttachment: true }),
    ).toBe('openai/gpt-5.6-terra-pro')
  })

  it('has no ambiguous pair of equally specific rules', () => {
    // Two equally specific rules matching one call resolve arbitrarily, which shows
    // up only as "why did this call use that model".
    expect(() => assertUnambiguousEscalationRules()).not.toThrow()
  })

  it('falls through to the rating table wherever the grid is silent', () => {
    // Reads are not covered by any rule, so they must resolve exactly as before the
    // grid existed.
    expect(routeModel({ kind: 'read', rating: 'medium', category: 'svg' })).toBe(
      MODEL_ROUTING.read.medium,
    )
    expect(routeModel({ kind: 'read', rating: 'high', category: 'ui' })).toBe(
      MODEL_ROUTING.read.high,
    )
    expect(routeModel({ kind: 'read', rating: 'high', category: 'ui', hasAttachment: true })).toBe(
      MODEL_ROUTING.read.high,
    )
    // And an uncategorised write with no attachment is the plain table too.
    expect(routeModel({ kind: 'write', rating: 'high' })).toBe(MODEL_ROUTING.write.high)
  })

  it('carries no rule that resolves to the slug it would have got anyway', () => {
    // A no-op rule reads as policy while changing nothing.
    for (const rule of TURING_MODELS.escalationRules) {
      if (!rule.kind || !rule.rating) continue
      expect(rule.use, `${describeRule(rule)} is a no-op`).not.toBe(
        MODEL_ROUTING[rule.kind][rule.rating],
      )
    }
  })

  it('an absent category behaves identically to before', () => {
    expect(routeModel({ kind: 'write', rating: 'high' })).toBe(MODEL_ROUTING.write.high)
    expect(routeModel({ kind: 'read', rating: 'high' })).toBe(MODEL_ROUTING.read.high)
  })

  it('routes low PLAIN writes to the driver explicitly; low reads and low vision writes stay unrouted', () => {
    // A low-rated plain write is authored by the driver — the designated author
    // for the trivial tier — but routed EXPLICITLY here (returned, logged as
    // host-pinned by the harness) rather than left as a silent driver-fallback.
    // The harness now consults routeModel for EVERY write, so every tier must
    // resolve or the write errors; routing low to the driver keeps it authored
    // without the orchestrator silently writing code.
    expect(routeModel({ kind: 'write', rating: 'low', category: 'ui' })).toBe(TURING_MODELS.driver)
    expect(routeModel({ kind: 'write', rating: 'low' })).toBe(TURING_MODELS.driver)
    // Reads never author bytes, so low reads stay unrouted.
    expect(routeModel({ kind: 'read', rating: 'low', category: 'svg' })).toBeUndefined()
    // A low VISION write stays unrouted so the harness picks an image-capable
    // model from the candidate pool (the driver is text-only).
    expect(routeModel({ kind: 'write', rating: 'low', hasAttachment: true })).toBeUndefined()
  })

  it('routedModelSlugs covers slugs reachable only through a grid rule', () => {
    // Anything routable has to be warmed and validated, including a slug that no
    // plain (kind, rating) pair can produce.
    const slugs = routedModelSlugs()
    for (const rule of TURING_MODELS.escalationRules) {
      expect(slugs, `${describeRule(rule)} is routable but unlisted`).toContain(rule.use)
    }
    // And the base table is still fully covered.
    expect(slugs).toContain(MODEL_ROUTING.write.high)
    expect(slugs).toContain(MODEL_ROUTING.read.high)
  })
})
