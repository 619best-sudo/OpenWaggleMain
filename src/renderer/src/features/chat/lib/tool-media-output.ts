/**
 * Media (image / video / audio) and HTML extraction from tool-result payloads.
 *
 * Tool results reach the renderer with their `content` array preserved verbatim
 * (see `piToolResultContentToPart` in main and `messagePartToUIParts` in the
 * renderer — neither filters block types). External/MCP tools can therefore
 * already emit media blocks today; this module is what lets the renderer
 * recognize and preview them.
 *
 * Two delivery conventions are auto-detected:
 *   - inline data URLs / base64 (works for all media kinds under the app CSP)
 *   - file paths / file:// URIs (resolved to bytes via the `tool-media:resolve`
 *     IPC handler before display)
 *
 * The module is pure (no React) so it is trivially unit-testable.
 */
import { normalizeToolResultPayload } from '@shared/utils/tool-result-state'
import { isRecord } from '@shared/utils/validation'

export type ToolMediaKind = 'image' | 'video' | 'audio' | 'html'

export interface ToolImageOutput {
  readonly kind: 'image'
  /** A displayable `src`: a data URL, or a path/`file://` URI to be resolved by IPC. */
  readonly src: string
  readonly alt?: string
  /** True when `src` still needs IPC resolution (it is a path, not a data URL). */
  readonly needsResolution: boolean
}

export interface ToolVideoOutput {
  readonly kind: 'video'
  readonly src: string
  readonly mimeType?: string
  readonly needsResolution: boolean
}

export interface ToolAudioOutput {
  readonly kind: 'audio'
  readonly src: string
  readonly mimeType?: string
  readonly needsResolution: boolean
}

/**
 * HTML output arrives two ways, and both must be representable:
 *   - INLINE  — a tool handed back markup directly.
 *   - BY PATH — a tool wrote an .html file (e.g. `write` creating index.html).
 *
 * The path form previously had nowhere to live: the type only carried `html`, so
 * a path was cast into a video/audio shape and the preview rendered
 * `html={undefined}` — the "Nothing to preview." card. Resolution goes through
 * the same `tool-media:resolve` IPC as other media (it already allows .html).
 */
export type ToolHtmlOutput =
  | { readonly kind: 'html'; readonly html: string; readonly needsResolution?: false }
  | { readonly kind: 'html'; readonly src: string; readonly needsResolution: true }

export type ToolMediaOutput = ToolImageOutput | ToolVideoOutput | ToolAudioOutput | ToolHtmlOutput

interface BaseMediaFields {
  readonly data?: unknown
  readonly source?: unknown
  readonly value?: unknown
  readonly mimeType?: unknown
  readonly mediaType?: unknown
  readonly alt?: unknown
}

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.svg',
  '.avif',
])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.ogg', '.ogv', '.m4v'])
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.oga', '.m4a', '.flac', '.aac'])
const HTML_EXTENSIONS = new Set(['.html', '.htm'])

const DATA_URL_PATTERN =
  /^data:([a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+)(;base64)?,/i
const FILE_URI_PATTERN = /^file:\/\//i

export function mediaKindFromExtension(filePath: string): ToolMediaKind | null {
  const dot = filePath.lastIndexOf('.')
  if (dot < 0) return null
  const ext = filePath.slice(dot).toLowerCase()
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (VIDEO_EXTENSIONS.has(ext)) return 'video'
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio'
  if (HTML_EXTENSIONS.has(ext)) return 'html'
  return null
}

/**
 * Derive a media kind from a MIME type. Tools that return assets by reference
 * (e.g. `assets_generator`) carry a `mimeType` but no `{ type: 'image' }` block
 * — they emit a generic `{ type: 'file', uri, mimeType }` — so the kind has to
 * come from the MIME rather than the block type or the path extension.
 */
export function mediaKindFromMimeType(mimeType: string | undefined): ToolMediaKind | null {
  if (!mimeType) return null
  const mime = mimeType.toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime === 'text/html' || mime === 'application/xhtml+xml') return 'html'
  return null
}

/** Best-effort MIME from a file extension; used when a tool gives only a path. */
export function mimeTypeForPath(filePath: string): string | undefined {
  const dot = filePath.lastIndexOf('.')
  if (dot < 0) return undefined
  const ext = filePath.slice(dot).toLowerCase()
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.avif': 'image/avif',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.ogg': 'video/ogg',
    '.ogv': 'video/ogg',
    '.m4v': 'video/x-m4v',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.oga': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.html': 'text/html',
    '.htm': 'text/html',
  }
  return map[ext]
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** Detect a `data:` URL and return its parsed MIME type, or null otherwise. */
export function parseDataUrl(value: string): { mimeType: string; isBase64: boolean } | null {
  const match = DATA_URL_PATTERN.exec(value)
  if (!match) return null
  return { mimeType: match[1].toLowerCase(), isBase64: !!match[2] }
}

function asString(value: unknown): string | undefined {
  return isNonEmptyString(value) ? value : undefined
}

/**
 * Build a `data:` URL from a base64 blob + mime. If `data` already looks like a
 * complete data URL, return it unchanged.
 */
function toDataUrl(data: string, mimeType: string): string {
  if (DATA_URL_PATTERN.test(data)) return data
  const mime = mimeType || 'application/octet-stream'
  return `data:${mime};base64,${data}`
}

function pickMime(fields: BaseMediaFields): string | undefined {
  return asString(fields.mimeType) ?? asString(fields.mediaType)
}

/** Recognize a path-like reference that should be fetched via IPC. */
export function isMediaFileRef(value: unknown): { path: string; mediaKind: ToolMediaKind } | null {
  const str = asString(value)
  if (!str) return null
  // An explicit file:// URI → take the path portion, classify by extension.
  if (FILE_URI_PATTERN.test(str)) {
    const path = str.replace(FILE_URI_PATTERN, '')
    const kind = mediaKindFromExtension(path)
    return kind ? { path, mediaKind: kind } : null
  }
  // A bare path ending in a known media extension (reject URLs with schemes
  // like http(s):// — those are remote and we don't fetch them here).
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(str)) return null
  const kind = mediaKindFromExtension(str)
  if (!kind) return null
  // Avoid mistaking prose for a path. The string must be a single bare token:
  // "Wrote /tmp/site/index.html" contains a slash and ends in .html, so an
  // OR-based guard accepted the WHOLE SENTENCE as the path — which then failed
  // to resolve as "Media file could not be found." A real path reference is one
  // token; a sentence that merely mentions one is not.
  if (/\s/.test(str)) return null
  return { path: str, mediaKind: kind }
}

function mediaFromFields(
  kind: 'image' | 'video' | 'audio',
  fields: BaseMediaFields,
): ToolImageOutput | ToolVideoOutput | ToolAudioOutput | null {
  const mime = pickMime(fields)
  const dataStr = asString(fields.data)
  const sourceValue = isRecord(fields.source)
    ? asString(fields.source.value)
    : asString(fields.source)

  // 1) Explicit base64 `data` + mime.
  if (dataStr) {
    const src = toDataUrl(dataStr, mime ?? `${kind}/*`)
    return needsResolutionFor(kind, src, mime)
  }
  // 2) `source.value` holding a data URL or path.
  if (sourceValue) {
    const fromDataUrl = tryInlineDataUrl(kind, sourceValue, mime)
    if (fromDataUrl) return fromDataUrl
    const ref = isMediaFileRef(sourceValue)
    if (ref && ref.mediaKind === kind) {
      return pathOutput(kind, ref.path, mime)
    }
  }
  return null
}

function tryInlineDataUrl(
  kind: 'image' | 'video' | 'audio',
  value: string,
  mime: string | undefined,
): ToolImageOutput | ToolVideoOutput | ToolAudioOutput | null {
  const parsed = parseDataUrl(value)
  if (!parsed) return null
  const resolvedMime = mime ?? parsed.mimeType
  if (kind === 'image') {
    return { kind: 'image', src: value, needsResolution: false, ...(resolvedMime ? {} : {}) }
  }
  return {
    kind,
    src: value,
    needsResolution: false,
    ...(resolvedMime ? { mimeType: resolvedMime } : {}),
  } as ToolVideoOutput | ToolAudioOutput
}

function needsResolutionFor(
  kind: 'image' | 'video' | 'audio',
  src: string,
  mime: string | undefined,
): ToolImageOutput | ToolVideoOutput | ToolAudioOutput {
  // `toDataUrl` always produces a data URL, so this path never needs resolution.
  if (kind === 'image') return { kind: 'image', src, needsResolution: false }
  return {
    kind,
    src,
    needsResolution: false,
    ...(mime ? { mimeType: mime } : {}),
  } as ToolVideoOutput | ToolAudioOutput
}

function pathOutput(
  kind: 'image' | 'video' | 'audio',
  path: string,
  mime: string | undefined,
): ToolImageOutput | ToolVideoOutput | ToolAudioOutput {
  const resolvedMime = mime ?? mimeTypeForPath(path)
  if (kind === 'image') {
    return { kind: 'image', src: path, needsResolution: true, ...(resolvedMime ? {} : {}) }
  }
  return {
    kind,
    src: path,
    needsResolution: true,
    ...(resolvedMime ? { mimeType: resolvedMime } : {}),
  } as ToolVideoOutput | ToolAudioOutput
}

/**
 * Resolve a `{ type: 'file', uri/path, mimeType }` reference block (the shape
 * `assets_generator` and other disk-writing tools return) into a previewable
 * media item. The kind comes from the MIME when present, falling back to the
 * path extension; the bytes are fetched through the `tool-media:resolve` IPC by
 * `ToolMediaPreview` (which already handles `.html` files too).
 */
function mediaOutputFromFileBlock(block: unknown): ToolMediaOutput | null {
  if (!isRecord(block)) return null
  const rawPath = asString(block.uri) ?? asString(block.path) ?? asString(block.name)
  if (!rawPath) return null
  const mime = asString(block.mimeType) ?? asString(block.mediaType)
  // Kind: prefer the MIME (the tool knows what it wrote), then the extension.
  const kind = mediaKindFromMimeType(mime) ?? mediaKindFromExtension(rawPath)
  if (!kind) return null
  if (kind === 'html') {
    return { kind: 'html', src: rawPath, needsResolution: true }
  }
  return pathOutput(kind, rawPath, mime)
}

function htmlFromFields(fields: BaseMediaFields & { readonly text?: unknown }): string | null {
  const direct = asString(fields.data) ?? asString(fields.value)
  if (direct?.trim()) return direct
  const sourceValue = isRecord(fields.source)
    ? asString(fields.source.value)
    : asString(fields.source)
  if (sourceValue?.trim()) return sourceValue
  const text = asString(fields.text)
  if (text?.trim()) return text
  return null
}

/**
 * Recognize a single media block from a content-array entry. Supports the
 * Claude/Chat-style `{ type, source: { value } }` and the MCP/pi-runtime-style
 * `{ type, data, mimeType }` conventions.
 */
export function mediaOutputFromBlock(block: unknown): ToolMediaOutput | null {
  if (!isRecord(block)) return null
  const rawType = asString(block.type)
  if (!rawType) return null
  const type = rawType.toLowerCase()

  // A generic `{ type: 'file', uri/path, mimeType }` block — how tools that
  // write the asset to disk return it (`assets_generator`, and MCP tools that
  // surface a generated file by reference). The kind is not in the block type,
  // so derive it from the MIME (then the path extension) and resolve the bytes
  // through the same IPC path other path-sourced media uses.
  if (type === 'file') {
    return mediaOutputFromFileBlock(block)
  }

  if (type === 'image') {
    const out = mediaFromFields('image', block as BaseMediaFields)
    if (out) {
      const alt = asString((block as BaseMediaFields).alt)
      return alt ? { ...(out as ToolImageOutput), alt } : out
    }
  }
  if (type === 'video') return mediaFromFields('video', block as BaseMediaFields)
  if (type === 'audio') return mediaFromFields('audio', block as BaseMediaFields)
  if (type === 'html' || type === 'text/html') {
    const html = htmlFromFields(block as BaseMediaFields & { readonly text?: unknown })
    if (html) return { kind: 'html', html }
  }
  return null
}

/** A bare string content payload that is itself a data URL or media path. */
function mediaOutputFromString(value: string): ToolMediaOutput | null {
  const dataUrl = parseDataUrl(value)
  if (dataUrl) {
    if (dataUrl.mimeType.startsWith('image/')) {
      return { kind: 'image', src: value, needsResolution: false }
    }
    if (dataUrl.mimeType.startsWith('video/')) {
      return { kind: 'video', src: value, needsResolution: false, mimeType: dataUrl.mimeType }
    }
    if (dataUrl.mimeType.startsWith('audio/')) {
      return { kind: 'audio', src: value, needsResolution: false, mimeType: dataUrl.mimeType }
    }
  }
  const ref = isMediaFileRef(value)
  if (ref) {
    const mime = mimeTypeForPath(ref.path)
    if (ref.mediaKind === 'image') {
      return { kind: 'image', src: ref.path, needsResolution: true }
    }
    // Handled explicitly rather than swept into the cast below: an .html path
    // has no `mimeType`/`src` slot on the video/audio shape, and pretending
    // otherwise is what produced an unpreviewable card.
    if (ref.mediaKind === 'html') {
      return { kind: 'html', src: ref.path, needsResolution: true }
    }
    return {
      kind: ref.mediaKind,
      src: ref.path,
      needsResolution: true,
      ...(mime ? { mimeType: mime } : {}),
    } as ToolVideoOutput | ToolAudioOutput
  }
  return null
}

/**
 * Scan a tool result payload and return the first renderable media/HTML item.
 * Recognizes `{ content: [...blocks], details }` payloads, bare strings, and
 * structured-wrapper shapes. Returns null when nothing renderable is present.
 */
export function getToolMediaOutput(content: unknown): ToolMediaOutput | null {
  const normalized = normalizeToolResultPayload(content)

  if (typeof normalized === 'string') {
    return mediaOutputFromString(normalized)
  }
  if (!isRecord(normalized)) return null

  const contentArr = normalized.content
  if (Array.isArray(contentArr)) {
    for (const block of contentArr) {
      const found = mediaOutputFromBlock(block)
      if (found) return found
      // A text block may itself contain a data URL or media path.
      if (isRecord(block) && block.type === 'text') {
        const text = asString((block as { text?: unknown }).text)
        if (text) {
          const fromText = mediaOutputFromString(text)
          if (fromText) return fromText
        }
      }
    }
  }

  // Fallback: a tool that returns the asset only as a reference on `details`
  // (e.g. `{ details: { uri, mimeType } }` with no media block in `content`).
  // `assets_generator` puts a `file` block in `content`, but other disk-writing
  // tools may surface the path solely here.
  const fromDetails = mediaOutputFromFileBlock(normalized.details)
  if (fromDetails) return fromDetails

  return null
}

export function hasToolMedia(content: unknown): boolean {
  return getToolMediaOutput(content) !== null
}

// ─── HTML sanitization ───────────────────────────────────────────────────
//
// Tool HTML output is rendered inline as sanitized HTML (no scripts). We parse
// with the browser-native DOMParser (no new dependency) and walk the tree,
// dropping disallowed tags and attributes against an explicit allowlist. This
// mirrors what rehype-sanitize would do, but operates on a raw HTML string
// (the markdown pipeline only handles markdown, and its sanitize layer strips
// `<video>`/`<audio>`/`<iframe>` and `data:` URLs, so HTML tool output needs
// its own path).

const ALLOWED_HTML_TAGS = new Set([
  'a',
  'abbr',
  'address',
  'article',
  'aside',
  'b',
  'bdi',
  'bdo',
  'blockquote',
  'br',
  'caption',
  'cite',
  'code',
  'col',
  'colgroup',
  'data',
  'dd',
  'del',
  'details',
  'dfn',
  'div',
  'dl',
  'dt',
  'em',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'hr',
  'i',
  'img',
  'ins',
  'kbd',
  'li',
  'main',
  'mark',
  'nav',
  'ol',
  'p',
  'picture',
  'pre',
  'q',
  'rp',
  'rt',
  'ruby',
  's',
  'samp',
  'section',
  'small',
  'source',
  'span',
  'strong',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'time',
  'tr',
  'u',
  'ul',
  'var',
  'wbr',
])

// Tags that are removed together with their children — never rendered, never
// re-parented. (script/iframe/etc. here.)
const DROP_WITH_CHILDREN = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'applet',
  'frame',
  'frameset',
  'noscript',
  'template',
  'link',
  'meta',
  'base',
  'title',
  'head',
  'form',
  'input',
  'button',
  'select',
  'option',
  'textarea',
  'fieldset',
  'legend',
  'label',
])

const ALLOWED_GLOBAL_ATTRS = new Set([
  'class',
  'id',
  'title',
  'dir',
  'lang',
  'alt',
  'colspan',
  'rowspan',
  'width',
  'height',
  'span',
  'start',
  'reversed',
  'value',
  'datetime',
  'open',
  'cite',
])

const ALLOWED_ATTRS_BY_TAG: Record<string, Set<string>> = {
  a: new Set(['href', 'name', 'target', 'rel', 'download']),
  img: new Set(['src', 'srcset', 'sizes', 'width', 'height', 'loading', 'decoding']),
  source: new Set(['src', 'srcset', 'sizes', 'type', 'media']),
  picture: new Set(),
  time: new Set(['datetime']),
  td: new Set(['colspan', 'rowspan', 'headers', 'scope']),
  th: new Set(['colspan', 'rowspan', 'headers', 'scope', 'abbr']),
  col: new Set(['span']),
  colgroup: new Set(['span']),
  ol: new Set(['reversed', 'start', 'type']),
}

function isDangerousUrl(value: string): boolean {
  const trimmed = value.trim().toLowerCase()
  if (trimmed.startsWith('javascript:')) return true
  if (trimmed.startsWith('data:text/html')) return true
  if (trimmed.startsWith('vbscript:')) return true
  return false
}

function sanitizeAttributes(tagName: string, element: Element): Array<[string, string]> {
  const allowed = ALLOWED_ATTRS_BY_TAG[tagName] ?? new Set<string>()
  const result: Array<[string, string]> = []
  for (const attr of Array.from(element.attributes)) {
    const name = attr.name.toLowerCase()
    // Drop every inline event handler (onclick, onerror, …).
    if (name.startsWith('on')) continue
    // Only `style` (global) and explicitly allowlisted attrs survive.
    if (name !== 'style' && !ALLOWED_GLOBAL_ATTRS.has(name) && !allowed.has(name)) continue
    const value = attr.value
    if (
      (name === 'href' || name === 'src' || name === 'srcset' || name === 'cite') &&
      isDangerousUrl(value)
    ) {
      continue
    }
    // Force safe rel on anchors that open in a new window.
    if (tagName === 'a' && name === 'target' && value === '_blank') {
      result.push(['rel', 'noopener noreferrer'])
    }
    result.push([name, value])
  }
  return result
}

function sanitizeNode(node: ChildNode, parent: Element): void {
  // ChildNode is the DOM interface; we operate via Node/Element/Text.
  const domNode = node as Node
  if (domNode.nodeType === 3 /* TEXT_NODE */ || domNode.nodeType === 8 /* COMMENT_NODE */) {
    return
  }
  if (domNode.nodeType !== 1 /* ELEMENT_NODE */) {
    parent.removeChild(domNode)
    return
  }
  const element = domNode as Element
  const tagName = element.tagName.toLowerCase()

  if (DROP_WITH_CHILDREN.has(tagName)) {
    parent.removeChild(element)
    return
  }
  if (!ALLOWED_HTML_TAGS.has(tagName)) {
    // Unknown tag: unwrap (keep children, drop the tag itself).
    while (element.firstChild) {
      parent.insertBefore(element.firstChild, element)
    }
    parent.removeChild(element)
    return
  }
  const keptAttrs = sanitizeAttributes(tagName, element)
  for (const attr of Array.from(element.attributes)) {
    element.removeAttribute(attr.name)
  }
  for (const [name, value] of keptAttrs) {
    element.setAttribute(name, value)
  }
  // Recurse into children. Copy the list first since we mutate during iteration.
  const children = Array.from(element.childNodes) as ChildNode[]
  for (const child of children) {
    sanitizeNode(child, element)
  }
}

/**
 * Sanitize a raw HTML string for inline rendering. Strips scripts, event
 * handlers, dangerous URIs, and disallowed tags. Returns the cleaned HTML
 * string (empty when nothing safe remains or DOMParser is unavailable, e.g.
 * during SSR/unit-test without a DOM).
 */
export function sanitizeToolHtml(html: string): string {
  if (typeof window === 'undefined' || typeof window.DOMParser !== 'function') {
    return ''
  }
  if (!html || !html.trim()) return ''
  const doc = new window.DOMParser().parseFromString(`<div id="__root">${html}</div>`, 'text/html')
  const root = doc.getElementById('__root')
  if (!root) return ''
  const children = Array.from(root.childNodes) as ChildNode[]
  for (const child of children) {
    sanitizeNode(child, root)
  }
  return root.innerHTML
}
