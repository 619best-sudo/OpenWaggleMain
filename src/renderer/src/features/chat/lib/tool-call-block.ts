import { isMatching, match, P } from '@diegogbrisa/ts-match'
import type { JsonObject } from '@shared/types/json'
import { normalizeToolResultPayload } from '@shared/utils/tool-result-state'
import { isRecord } from '@shared/utils/validation'
import { resolveLanguage } from '@/shared/lib/shiki/highlighter'

export const JSON_STRINGIFY_SPACES = 2
export const LONG_ARGUMENT_PREVIEW_CHARS = 120
export const LONG_ARGUMENT_MAX_HEIGHT_PX = 200
export const RESULT_MAX_HEIGHT_PX = 300
export const READ_VIEW_MAX_HEIGHT_PX = 320
export const READ_VIEW_MAX_LINES = 2_000
export const INLINE_DIFF_LINE_LIMIT = 32
export const OUTPUT_PREVIEW_LINES = 6
export const LINE_SPLIT_SEPARATOR = '\n'
export const HIGHLIGHT_MAX_CHARS = 80_000
export const HIGHLIGHT_MAX_LINES = 1_200
export const MIN_MARKDOWN_FENCE_LENGTH = 3
export const FILE_CONTENT_ARG_KEYS = new Set(['content', 'oldString', 'newString'])

export interface ToolCallResultPayload {
  readonly content: unknown
  readonly state: string
  readonly sourceMessageId?: string
  readonly error?: string
}

export interface UnifiedDiffLine {
  readonly type: 'add' | 'remove' | 'context' | 'meta'
  readonly content: string
}

export interface UnifiedDiffData {
  readonly text: string
  readonly lines: readonly UnifiedDiffLine[]
  readonly additions: number
  readonly deletions: number
}

function isTextContentBlock(
  value: unknown,
): value is { readonly type: 'text'; readonly text: string } {
  return isMatching({ type: 'text', text: P.string }, value)
}

function parseResultPayload(content: unknown) {
  return normalizeToolResultPayload(content)
}

function formatUnknownContent(content: unknown) {
  if (typeof content === 'string') return content
  if (typeof content === 'number' || typeof content === 'boolean') return String(content)
  if (content === null || content === undefined) return ''
  try {
    return JSON.stringify(content, null, JSON_STRINGIFY_SPACES)
  } catch {
    return String(content)
  }
}

function getToolResultDetails(content: unknown) {
  const parsed = parseResultPayload(content)
  return match(parsed)
    .with({ details: P.select() }, (details) => details)
    .otherwise(() => undefined)
}

/** A mark_concern_lines result: the lines flagged for a file + optional reason. */
export interface LineConcern {
  readonly path: string
  readonly lines: readonly number[]
  readonly why?: string
}

/**
 * Extract a {@link LineConcern} from a tool result payload. Only meaningful for
 * `mark_concern_lines`, whose `details = { path, lines, why? }`. Returns null for
 * any other shape so callers can scan a phase's tool results and collect
 * concerns to overlay onto the matching read.
 */
export function getConcernLinesFromResult(content: unknown): LineConcern | null {
  const details = getToolResultDetails(content)
  if (!isRecord(details)) return null
  const path = match(details.path)
    .with(P.string, (value) => value)
    .otherwise(() => null)
  if (!path) return null
  const rawLines = details.lines
  if (!Array.isArray(rawLines)) return null
  const lines = rawLines.filter(
    (n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1,
  )
  if (lines.length === 0) return null
  const why = match(details.why)
    .with(P.string, (value) => value)
    .otherwise(() => undefined)
  return why ? { path, lines, why } : { path, lines }
}

/** The path the harness resolved for a successful read (details.path), if any. */
export function getResultPath(content: unknown): string | null {
  const details = getToolResultDetails(content)
  if (!isRecord(details)) return null
  return match(details.path)
    .with(P.string, (value) => value)
    .otherwise(() => null)
}

export interface NumberedLine {
  /** 1-based line number shown in the gutter. */
  readonly number: number
  /** Line text with the harness's leading `<digits>\t` prefix stripped. */
  readonly text: string
}

/**
 * Split a read result into numbered lines. The harness `readTool` formats lines
 * as `<n>\t<text>` (with `n` honoring the requested `offset`), so we prefer the
 * embedded number when present and fall back to a 1-based index. A trailing
 * empty line (from a final `\n`) is dropped.
 */
export function splitNumberedFileLines(content: string): readonly NumberedLine[] {
  if (!content) return []
  const rawLines = content.split(LINE_SPLIT_SEPARATOR)
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') {
    rawLines.pop()
  }
  return rawLines.map((line, index) => {
    const match = /^(\d+)\t(.*)$/s.exec(line)
    if (match) {
      return { number: Number(match[1]), text: match[2] }
    }
    return { number: index + 1, text: line }
  })
}

function textFromContentBlocks(content: readonly unknown[]) {
  const textBlocks: string[] = []
  for (const block of content) {
    if (isTextContentBlock(block)) {
      textBlocks.push(block.text)
    }
  }
  return textBlocks.length > 0 ? textBlocks.join('\n') : null
}

function textFromResultRecord(parsed: { readonly [key: string]: unknown }) {
  const contentText = match(parsed)
    .with({ content: P.select('content', P.array(P._)) }, ({ content }) =>
      textFromContentBlocks(content),
    )
    .otherwise(() => null)

  if (contentText) {
    return contentText
  }

  const message = match(parsed.message)
    .with(P.string, (value) => value)
    .otherwise(() => null)
  if (message) {
    return message
  }

  return match(parsed.error)
    .with(P.string, (value) => value)
    .otherwise(() => null)
}

export function getToolResultText(content: unknown) {
  const parsed = parseResultPayload(content)
  return match(parsed)
    .with(P.string, (value) => value)
    .when(isRecord, (value) => textFromResultRecord(value) ?? formatUnknownContent(value))
    .otherwise((value) => formatUnknownContent(value))
}

export function getStringArg(args: JsonObject, key: string) {
  const value = args[key]
  return typeof value === 'string' ? value : null
}

export function inferLanguageFromPath(path: string | null) {
  if (!path) {
    return undefined
  }

  const extension = path.split('.').pop()
  if (!extension || extension === path) {
    return undefined
  }

  return resolveLanguage(extension.toLowerCase())
}

function exceedsLineLimit(text: string, maxLines: number) {
  if (!text) return false

  let lineCount = 1
  for (const char of text) {
    if (char !== LINE_SPLIT_SEPARATOR) {
      continue
    }
    lineCount += 1
    if (lineCount > maxLines) {
      return true
    }
  }
  return false
}

export function shouldHighlightCode(text: string) {
  return text.length <= HIGHLIGHT_MAX_CHARS && !exceedsLineLimit(text, HIGHLIGHT_MAX_LINES)
}

export function buildFencedCodeMarkdown(code: string, language: string | undefined) {
  const fenceLength = Math.max(
    MIN_MARKDOWN_FENCE_LENGTH,
    ...Array.from(code.matchAll(/`+/g)).map((match) => match[0].length + 1),
  )
  const fence = '`'.repeat(fenceLength)
  return `${fence}${language ?? ''}\n${code}\n${fence}`
}

export function getResultError(result: ToolCallResultPayload | undefined) {
  if (!result) return null
  if (result.error) return result.error
  if (result.state === 'error') {
    const text = getToolResultText(result.content).trim()
    return text || 'Tool execution failed.'
  }

  const parsed = parseResultPayload(result.content)
  if (isRecord(parsed) && typeof parsed.error === 'string') {
    return parsed.error
  }
  return null
}

function parseUnifiedDiff(diffText: string): UnifiedDiffData {
  let additions = 0
  let deletions = 0
  const lines = diffText.split(LINE_SPLIT_SEPARATOR).map((line): UnifiedDiffLine => {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) {
      return { type: 'meta', content: line }
    }
    if (line.startsWith('+')) {
      additions += 1
      return { type: 'add', content: line }
    }
    if (line.startsWith('-')) {
      deletions += 1
      return { type: 'remove', content: line }
    }
    return { type: 'context', content: line }
  })

  return { text: diffText, lines, additions, deletions }
}

export function getUnifiedDiffLineClassName(type: UnifiedDiffLine['type']) {
  return match(type)
    .with('add', () => 'bg-success/10 text-success')
    .with('remove', () => 'bg-error/10 text-error')
    .with('meta', () => 'text-text-muted')
    .with('context', () => 'text-text-secondary')
    .exhaustive()
}

function countWrittenLines(content: string) {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\n+$/g, '')
  if (!normalized) {
    return 0
  }
  return normalized.split(LINE_SPLIT_SEPARATOR).length
}

function buildWriteSummary(content: string): UnifiedDiffData | null {
  const additions = countWrittenLines(content)
  if (additions === 0) {
    return null
  }
  return { text: '', lines: [], additions, deletions: 0 }
}

export function getToolDiffData(
  content: unknown,
  name: string,
  args?: JsonObject,
): UnifiedDiffData | null {
  if (name !== 'edit' && name !== 'write') {
    return null
  }

  // Prefer the harness-computed unified diff carried on the tool result. Both
  // `edit` and `write` now return `details.diff` (write diffs the previous file
  // contents against what was actually written). Using it shows the REAL added/
  // removed lines and accurate +/- counts — crucially for authoring writes, where
  // `args.content` is only the model's draft, not the bytes written to disk.
  const details = getToolResultDetails(content)
  const diff = match(details)
    .with({ diff: P.select('diff', P.string) }, ({ diff }) => diff)
    .otherwise(() => null)
  if (diff?.trim()) {
    return parseUnifiedDiff(diff)
  }

  if (name === 'write') {
    // No result diff yet (e.g. the args are still streaming in, before the tool
    // finished) — fall back to an all-additions summary from the drafted content.
    const rawContent = args?.content
    return typeof rawContent === 'string' ? buildWriteSummary(rawContent) : null
  }

  const parsed = parseResultPayload(content)
  if (
    isRecord(parsed) &&
    typeof parsed.beforeContent === 'string' &&
    typeof parsed.afterContent === 'string' &&
    parsed.beforeContent !== parsed.afterContent
  ) {
    return null
  }

  return null
}

export function buildTailPreview(text: string) {
  const lines = text.trim().split(LINE_SPLIT_SEPARATOR)
  return lines.slice(-OUTPUT_PREVIEW_LINES).join('\n')
}
