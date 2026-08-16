/**
 * Multimodal (media-INPUT) model selection for turing-harness's `media_analysis`.
 *
 * The harness tool resolves its model as `args.model ?? config.model ??
 * ctx.model.openRouterSlug ?? <harness default>`. With no `config.model` supplied
 * it therefore falls through to the RUN's own model — and OpenWaggle's driver
 * (see `TURING_MODELS.driver`) is text-to-text. The attachments were being
 * inlined as base64 blocks and handed to a model that cannot read them, so every
 * analysis came back as prose about nothing.
 *
 * `media_analysis` covers images, video, audio and documents, so the model pinned
 * here should ideally handle more than vision alone.
 *
 * Pinning a multimodal slug here is the fix. It is deliberately independent of the
 * run model: the orchestrator can stay a cheap text model while the one tool that
 * genuinely needs vision gets a model that has it.
 *
 * This is NOT the same knob as `OPENWAGGLE_IMAGE_GEN_MODEL` — that one is
 * image-OUTPUT (asset generation, `/images`); this one is image-INPUT (chat
 * completion with image content blocks).
 */

import { env } from '../../env'
import { TURING_MODELS } from './turing-models.config'

/**
 * Multimodal default. Gemini 2.5 Flash is served by OpenRouter as a regular chat
 * model that accepts image content blocks, is cheap enough to call on every
 * screenshot, and is also turing-harness's own default — so pinning it makes the
 * behavior explicit rather than changing it. Override with
 * `OPENWAGGLE_VISION_MODEL` for a stronger reader (e.g. a Claude or GPT vision
 * slug) without touching the run model.
 */
export const DEFAULT_VISION_MODEL = TURING_MODELS.vision

/** The OpenRouter slug `media_analysis` should use for its vision pass. */
export function resolveVisionModel(): string {
  const configured = env.OPENWAGGLE_VISION_MODEL?.trim()
  return configured && configured.length > 0 ? configured : DEFAULT_VISION_MODEL
}
