/**
 * Maps OpenWaggle's hydrated attachments onto turing-harness's `Attachment`
 * shape, and detects when the user's intent is "build this UI from the image".
 *
 * Without this, attachments never reach the harness at all: `agent.prompt` takes
 * an optional `Attachment[]`, and the run was calling it with only the prompt
 * text — so an attached mockup was invisible to the model and multimodal
 * write/edit authoring could never fire.
 *
 * The harness addresses media by PATH, not by inline bytes (it reads the file on
 * demand inside the tool, so a run that never looks at an image never pays to
 * load it). OpenWaggle's `AttachmentRecord.path` is already an on-disk path, so
 * the mapping carries it through as the ref uri.
 */
import type { HydratedAttachment } from '@shared/types/agent'
import type { Attachment, AttachmentType } from 'turing-harness'

/** OpenWaggle attachment kinds -> turing attachment types. */
function attachmentTypeFor(kind: HydratedAttachment['kind']): AttachmentType {
  return kind === 'image' ? 'image' : kind === 'pdf' ? 'document' : 'file'
}

/**
 * Project the run payload's attachments into the harness shape. Entries without
 * a usable on-disk path are dropped: the harness would not be able to read them,
 * and a broken path reaching a vision model produces a confusing "could not read
 * image" mid-analysis rather than a clean omission.
 */
export function toTuringAttachments(
  attachments: readonly HydratedAttachment[] | undefined,
): Attachment[] {
  if (!attachments?.length) return []
  const mapped: Attachment[] = []
  for (const att of attachments) {
    if (!att.path || att.path.trim().length === 0) continue
    mapped.push({
      id: att.id,
      type: attachmentTypeFor(att.kind),
      fileName: att.path,
      mimeType: att.mimeType,
      size: att.sizeBytes,
      // `ref.uri` is what the harness reads for vision authoring/analysis.
      ref: { id: att.id, uri: att.path, mimeType: att.mimeType, size: att.sizeBytes },
      ...(att.extractedText ? { extractedText: att.extractedText } : {}),
    })
  }
  return mapped
}

/** The image attachments alone, as the `{path, mimeType}` refs the harness uses. */
export function imageRefsFrom(
  attachments: readonly HydratedAttachment[] | undefined,
): Array<{ path: string; mimeType: string }> {
  return (attachments ?? [])
    .filter((att) => att.kind === 'image' && att.path && att.path.trim().length > 0)
    .map((att) => ({ path: att.path, mimeType: att.mimeType || 'image/png' }))
}

/**
 * Verbs that mean "produce an implementation", as opposed to "tell me about
 * this". Deliberately about the ACTION, not about UI vocabulary: "build this",
 * "make this page", and "recreate this" all imply authoring even when the word
 * "UI" never appears.
 */
const BUILD_INTENT =
  /\b(build|create|implement|make|code|recreate|replicate|convert|turn\s+this\s+into|clone|scaffold|generate)\b/i

/** Words that mean "explain it to me" — analysis, not authoring. */
const ANALYZE_INTENT =
  /\b(what|why|explain|describe|analyz|analys|review|check|compare|read|debug|diagnos|wrong|issue|bug)\b/i

export type AttachmentIntent = 'build-from-image' | 'analyze-image' | 'none'

/**
 * Classify what the user wants done with an attached image, so the run can steer
 * the model to the right tool instead of leaving it to guess.
 *
 * Build intent wins ties: "look at this and build it" is one instruction, and
 * routing it to analysis alone would stop short of the thing actually asked for
 * (the model can still analyze first — the steer names both, in order).
 */
export function detectAttachmentIntent(
  text: string,
  attachments: readonly HydratedAttachment[] | undefined,
): AttachmentIntent {
  if (!imageRefsFrom(attachments).length) return 'none'
  if (BUILD_INTENT.test(text)) return 'build-from-image'
  if (ANALYZE_INTENT.test(text)) return 'analyze-image'
  // An image with no verb at all ("here's the mockup") reads as build intent in a
  // coding agent — that is what users attach mockups to a code tool for.
  return 'build-from-image'
}

/**
 * The prompt section that tells the model what to do with the attached image(s).
 * Returns undefined when there is nothing to steer.
 *
 * This is the piece that makes "create the UI from this attachment" actually
 * work: the harness already lists AVAILABLE IMAGES, but listing them does not
 * tell the model to route them into `write`/`edit`'s `images` argument, which is
 * what triggers vision authoring of the file bytes.
 */
export function buildAttachmentIntentSection(
  text: string,
  attachments: readonly HydratedAttachment[] | undefined,
): string | undefined {
  const images = imageRefsFrom(attachments)
  if (!images.length) return undefined
  const list = images.map((img, i) => `  ${i + 1}. ${img.path} (${img.mimeType})`).join('\n')
  const intent = detectAttachmentIntent(text, attachments)

  if (intent === 'build-from-image') {
    return [
      'ATTACHED IMAGE(S) — THE USER WANTS THESE BUILT:',
      list,
      'Workflow:',
      '  1. Call `media_analysis` with these paths (`file`, or `files` for several) first to understand the layout, components, text, colors and spacing.',
      '  2. Then author the files by passing the SAME paths in the `images` argument of `write`/`edit`.',
      '     Passing `images` makes a vision model author the file bytes FROM the image, which is far more',
      '     faithful than transcribing the design into `content` yourself. Do NOT skip it.',
      "  3. Match the image for layout and visual structure; follow the user's text for intent and constraints.",
    ].join('\n')
  }

  return [
    'ATTACHED IMAGE(S) — THE USER IS ASKING ABOUT THESE:',
    list,
    "Call `media_analysis` with these paths (`file`, or `files` for several) and the user's question as `prompt`. Answer from what the image actually shows.",
  ].join('\n')
}
