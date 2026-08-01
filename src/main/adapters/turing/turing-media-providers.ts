/**
 * Media generation providers for turing-harness's `assets_generator`.
 *
 * The harness ships no real generator on purpose — image/video/audio APIs differ
 * too much in wire format, auth and async semantics for a library to pick one. It
 * exposes an `AssetBackend` seam instead, and this module is OpenWaggle's
 * implementation of it.
 *
 * Provider is selected by `OPENWAGGLE_ASSET_PROVIDER` so a second provider
 * (Runware) can be dropped in later without touching the harness or the run path:
 * only `assetBackendFor` below needs a new branch.
 *
 * Anything with no implementation falls through to the harness's placeholder,
 * which writes a stand-in file AND tells the model, in the tool output, that it
 * is not a real asset.
 */

import { readFile } from 'node:fs/promises'
import type { AssetBackend, AssetBackends, AssetRequest, MediaAnalysisBackend } from 'turing-harness'
import {
  createBackendImageBackend,
  createOpenRouterImageBackend as createHarnessOpenRouterImageBackend,
} from 'turing-harness'
import { env } from '../../env'
import { createLogger } from '../../logger'
import { isDirectOpenRouterEnabled, type TuringLlmConfig } from './turing-llm-config'
import { analyzeMediaViaTuring, generateImageViaTuring, type AnalysisImage } from './media/turing-media-client'

const logger = createLogger('turing-media-providers')

export type AssetProvider = 'turing' | 'openrouter' | 'runware'

/**
 * Image model used when none is pinned, overridable via `OPENWAGGLE_IMAGE_GEN_MODEL`
 * or a per-call `options.model`.
 *
 * Must be a slug served by OpenRouter's dedicated image endpoint. Note this is a
 * different requirement from "a chat model that can emit images": Riverflow is a
 * purpose-built image generation/editing model and is only reachable through
 * `/images`, which is why the request below is not a chat completion.
 */
const DEFAULT_IMAGE_MODEL = 'sourceful/riverflow-v2-fast'

/**
 * Which backend serves `assets_generator`.
 *
 * An explicit `OPENWAGGLE_ASSET_PROVIDER` always wins. With nothing configured
 * the answer follows the app-wide routing decision: 'turing' (backend proxy)
 * normally, 'openrouter' only when the direct escape hatch is on — so image
 * generation can never silently keep calling OpenRouter after the migration.
 */
export function resolveAssetProvider(): AssetProvider {
  const configured = env.OPENWAGGLE_ASSET_PROVIDER
  if (configured === 'runware') return 'runware'
  if (configured === 'turing') return 'turing'
  if (configured === 'openrouter') return 'openrouter'
  return isDirectOpenRouterEnabled() ? 'openrouter' : 'turing'
}

/**
 * OpenRouter image generation.
 *
 * Delegates the wire format to the harness's `/images` backend rather than
 * re-implementing it here: OpenRouter's documented image-generation surface is
 * `POST /images` returning `data[].b64_json`, and one implementation of that is
 * enough. What stays OpenWaggle's job is the part it actually owns — which model
 * to use, and reporting a missing key in terms of OpenWaggle's own env vars.
 *
 * Per-call `options` are forwarded verbatim by the harness backend, so
 * model-specific knobs (Riverflow's `font_inputs`, `super_resolution_references`)
 * work without a change here.
 */
export function createOpenRouterImageBackend(config: TuringLlmConfig): AssetBackend {
  return async (req, ctx) => {
    if (!config.apiKey) {
      throw new Error(
        'assets_generator: no OpenRouter API key configured — set OPENWAGGLE_OPENROUTER_API_KEY or sign in to the provider.',
      )
    }
    const model =
      typeof req.options?.model === 'string' && req.options.model.trim().length > 0
        ? req.options.model
        : (env.OPENWAGGLE_IMAGE_GEN_MODEL ?? DEFAULT_IMAGE_MODEL)

    const asset = await createHarnessOpenRouterImageBackend({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model,
    })(req, ctx)

    logger.info('Generated image via OpenRouter', {
      model,
      bytes: asset.bytes.byteLength,
      mimeType: asset.mimeType,
    })
    return asset
  }
}

/**
 * Runware slot. Not implemented yet — kept as an explicit branch so switching
 * providers is a one-function change rather than a refactor. Throwing here (with
 * the reason) beats silently falling back to a placeholder the user would then
 * mistake for a real generation.
 */
function createRunwareImageBackend(): AssetBackend {
  return async () => {
    throw new Error(
      'assets_generator: OPENWAGGLE_ASSET_PROVIDER=runware is selected but the Runware backend is not implemented yet. ' +
        'Set OPENWAGGLE_ASSET_PROVIDER=openrouter, or implement createRunwareImageBackend in turing-media-providers.ts.',
    )
  }
}

/**
 * Image generation routed through the backend's `/turing-machine/images` proxy
 * (JWT auth + central billing). Delegates to `generateImageViaTuring`, which
 * returns OpenRouter's image shape; the harness `createBackendImageBackend`
 * decodes it identically to the direct path.
 */
function createTuringImageBackend(config: TuringLlmConfig): AssetBackend {
  const defaultModel = env.OPENWAGGLE_IMAGE_GEN_MODEL ?? DEFAULT_IMAGE_MODEL
  return createBackendImageBackend({
    client: (req, ctx) =>
      generateImageViaTuring(
        {
          model: req.model || defaultModel,
          prompt: req.prompt,
          options: req.options,
        },
        ctx,
        // The client resolves the OpenRouter base URL from `config.baseUrl` only
        // to keep model selection coherent with the run; the actual call goes to
        // the turing-machine backend (resolveTuringMachineBaseUrl), not OpenRouter.
        { timeoutMs: 180_000 },
      ),
    model: defaultModel,
  })
}

/** The backend for a given kind under the selected provider, if one exists. */
export function assetBackendFor(
  kind: AssetRequest['kind'],
  config: TuringLlmConfig,
): AssetBackend | undefined {
  // Only image generation is wired today. video/audio/3d intentionally return
  // undefined so the harness placeholder handles them and says so out loud.
  if (kind !== 'image') return undefined
  const provider = resolveAssetProvider()
  if (provider === 'runware') return createRunwareImageBackend()
  if (provider === 'turing') return createTuringImageBackend(config)
  return createOpenRouterImageBackend(config)
}

/** The `AssetsGeneratorConfig.backends` value for a run. */
export function assetBackends(config: TuringLlmConfig): AssetBackends {
  const image = assetBackendFor('image', config)
  return image ? { image } : {}
}

/**
 * Vision analysis routed through the backend's `/turing-machine/media/analysis`
 * proxy (JWT auth + central billing). Reads each resolved attachment (inlining
 * bytes for small images, passing the path for large/video) and delegates to
 * `analyzeMediaViaTuring`. Returns text + usage, matching the harness
 * `MediaAnalysisBackend` contract.
 */
function createTuringMediaAnalysisBackend(visionModel: string): MediaAnalysisBackend {
  return async (req, ctx) => {
    const images: AnalysisImage[] = []
    for (const attachment of req.attachments) {
      if (attachment.inline) {
        const bytes = await readFile(attachment.path)
        images.push({
          mimeType: attachment.mimeType,
          data: bytes.toString('base64'),
        })
      } else {
        // Large/video: pass the path; the backend reads it as a URI. (The
        // backend DTO accepts `uri` for by-reference media.)
        images.push({ mimeType: attachment.mimeType, uri: attachment.path })
      }
    }
    const result = await analyzeMediaViaTuring(
      {
        prompt: req.prompt,
        systemPrompt: req.systemPrompt,
        images,
        model: req.model ?? visionModel,
      },
      ctx.signal,
    )
    return result
  }
}

/**
 * The harness `mediaAnalysis` config.
 *
 * Unless the direct escape hatch is on, vision goes through the backend's
 * dedicated `/turing-machine/media/analysis` route. This is keyed off the routing
 * flag rather than the asset provider so that selecting an unrelated image
 * provider (e.g. `runware`) cannot drag vision back onto the direct path.
 *
 * On the direct path we only pin the model; the bundled OpenRouter path via
 * `ctx.llm` handles the call.
 */
export function mediaAnalysisConfig(visionModel: string): {
  model: string
  analyze?: MediaAnalysisBackend
} {
  if (!isDirectOpenRouterEnabled()) {
    return { model: visionModel, analyze: createTuringMediaAnalysisBackend(visionModel) }
  }
  return { model: visionModel }
}
