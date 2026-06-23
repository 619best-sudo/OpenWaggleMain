import fs from 'node:fs'
import path from 'node:path'
import { ATTACHMENT } from '@shared/constants/resource-limits'
import type { AgentTransportToolExecutionEndEvent } from '@shared/types/stream'
import type { WaggleArtifact, WaggleStreamMetadata } from '@shared/types/waggle'
import type { PiImageContent, PiPromptInput } from '../pi-runtime-input'
import {
  buildWaggleArtifactReference,
  classifyWaggleArtifactKind,
  registerWaggleArtifact,
  type WaggleArtifactRegistry,
} from './waggle-artifact-registry'

const PROMPT_KEYS = new Set(['prompt', 'text', 'description', 'instructions', 'query', 'caption'])
const MAX_PROMPT_SUMMARY_LENGTH = 280
export const MAX_WAGGLE_TURN_IMAGES = 4

export interface WaggleTurnHandoffDraft {
  readonly promptSummaries: string[]
  readonly artifacts: WaggleArtifact[]
  readonly images: PiImageContent[]
  readonly loopDirectives: string[]
  readonly seenPromptSummaries: Set<string>
  readonly seenArtifactPaths: Set<string>
  readonly seenImagePaths: Set<string>
  readonly seenLoopDirectives: Set<string>
}

export interface WaggleTurnHandoff {
  readonly promptSummaries: readonly string[]
  readonly artifacts: readonly WaggleArtifact[]
  readonly images: readonly PiImageContent[]
  readonly loopDirectives: readonly string[]
}

export function createWaggleTurnHandoffDraft(): WaggleTurnHandoffDraft {
  return {
    promptSummaries: [],
    artifacts: [],
    images: [],
    loopDirectives: [],
    seenPromptSummaries: new Set(),
    seenArtifactPaths: new Set(),
    seenImagePaths: new Set(),
    seenLoopDirectives: new Set(),
  }
}

export function finalizeWaggleTurnHandoff(draft: WaggleTurnHandoffDraft): WaggleTurnHandoff | null {
  if (
    draft.promptSummaries.length === 0 &&
    draft.artifacts.length === 0 &&
    draft.images.length === 0 &&
    draft.loopDirectives.length === 0
  ) {
    return null
  }

  return {
    promptSummaries: [...draft.promptSummaries],
    artifacts: [...draft.artifacts],
    images: [...draft.images],
    loopDirectives: [...draft.loopDirectives],
  }
}

const MAX_COMPACTION_PROMPT_SUMMARIES = 3
const MAX_COMPACTION_ARTIFACTS = 4
const MAX_COMPACTION_TEXT_LENGTH = 360

export function collectToolExecutionHandoff(
  draft: WaggleTurnHandoffDraft,
  registry: WaggleArtifactRegistry,
  event: AgentTransportToolExecutionEndEvent,
  meta: WaggleStreamMetadata,
): WaggleArtifact[] {
  if (event.isError) return []
  const registeredArtifacts: WaggleArtifact[] = []

  const promptSummary = findPromptSummary(event.args)
  if (promptSummary && !draft.seenPromptSummaries.has(promptSummary)) {
    draft.seenPromptSummaries.add(promptSummary)
    draft.promptSummaries.push(promptSummary)
  }

  for (const filePath of findOutputPaths(event.result)) {
    const kind = classifyWaggleArtifactKind(filePath)
    if (!kind) continue

    const artifact = registerWaggleArtifact({
      registry,
      filePath,
      toolName: event.toolName,
      meta,
      ...(promptSummary ? { promptSummary } : {}),
    })

    if (!draft.seenArtifactPaths.has(filePath)) {
      draft.seenArtifactPaths.add(filePath)
      draft.artifacts.push(artifact)
      registeredArtifacts.push(artifact)
    }

    const image = hydrateImageArtifact(artifact)
    if (image && !draft.seenImagePaths.has(filePath)) {
      draft.seenImagePaths.add(filePath)
      draft.images.push(image)
    }
  }

  return registeredArtifacts
}

export function appendTurnHandoffToPrompt(
  baseText: string,
  handoff: WaggleTurnHandoff | null,
): string {
  if (!handoff) return baseText

  const lines = [baseText]

  if (handoff.loopDirectives.length > 0) {
    lines.push('', 'Critical loop directives:')
    for (const directive of handoff.loopDirectives) {
      lines.push(`- ${directive}`)
    }
  }

  lines.push(
    '',
    'Media handoff:',
    'Use the concise prompt summary and attached/generated artifacts below instead of relying on raw tool result blobs from the previous turn.',
  )

  if (handoff.promptSummaries.length > 0) {
    lines.push('Generation prompt summary:')
    for (const promptSummary of handoff.promptSummaries) {
      lines.push(`- ${promptSummary}`)
    }
  }

  if (handoff.artifacts.length > 0) {
    lines.push('Waggle artifacts:')
    for (const artifact of handoff.artifacts) {
      lines.push(`- ${buildWaggleArtifactReference(artifact)}`)
      lines.push(`  uri: ${artifact.uri}`)
      lines.push(`  source tool: ${artifact.sourceTool}`)
      lines.push('  MCP starter payload:')
      for (const payloadLine of JSON.stringify(buildMcpStarterPayload(artifact), null, 2).split(
        '\n',
      )) {
        lines.push(`  ${payloadLine}`)
      }
      lines.push(
        `  preferred fields: ${artifact.transport.preferredFieldNames.map((field) => `\`${field}\``).join(', ')}`,
      )
      lines.push(
        `  fallback fields: ${artifact.transport.fallbackFieldNames.map((field) => `\`${field}\``).join(', ')}`,
      )
      lines.push(
        `  base64 mode: ${artifact.transport.base64Mode === 'reasonable-if-required' ? 'reasonable if the MCP explicitly requires bytes' : 'avoid unless there is no path or URI option'}`,
      )
    }
    lines.push('Artifact usage rules:')
    lines.push(
      '- When using MCPs, always map artifact starter payload values into the tool schema exactly.',
    )
    lines.push(
      '- When calling an MCP or merge/edit tool, start by mapping the MCP schema to the starter payload shown above.',
    )
    lines.push(
      '- Prefer absolute path fields first, usually `path`, `filePath`, or `inputPath`. Use `uri`, `fileUri`, or `url` only when the MCP explicitly expects a URI/URL value.',
    )
    lines.push(
      '- Do not paraphrase, shorten, or rename artifact paths. Do not inline base64 unless the tool explicitly requires raw bytes.',
    )
  }

  lines.push(
    'If you generate media this turn, register it as a Waggle artifact by returning a concrete file path or file URL. Later Waggle agents will receive the artifact id and resolved path. Do not paste raw tool result JSON.',
  )

  return lines.join('\n')
}

export function buildWaggleTurnCompactionInstructions(input: {
  readonly handoff: WaggleTurnHandoff | null
  readonly responseText: string
  readonly meta: WaggleStreamMetadata
}): string {
  const lines = [
    'Compact this Pi Waggle session before the next agent handoff.',
    'Goal: reduce transcript token growth while preserving only the durable context needed for the next Waggle turn.',
    'Prefer concise bullets. Remove repeated reasoning, raw tool logs, and large tool result blobs.',
    'Keep these facts in the compact summary:',
    `- Completed turn: ${String(input.meta.turnNumber + 1)} by ${input.meta.agentLabel} using ${input.meta.agentModel}.`,
    '- Preserve the original user goal, constraints, and acceptance criteria.',
    '- Preserve unresolved blockers, rollback requirements, and the exact next-agent obligations when present.',
  ]

  const responseSummary = summarizeForCompaction(input.responseText)
  if (responseSummary) {
    lines.push(`- Latest turn outcome: ${responseSummary}`)
  }

  if (input.handoff?.loopDirectives.length) {
    lines.push('- Critical loop directives:')
    for (const directive of input.handoff.loopDirectives) {
      lines.push(`  - ${summarizeForCompaction(directive)}`)
    }
  }

  const promptSummaries = input.handoff?.promptSummaries.slice(0, MAX_COMPACTION_PROMPT_SUMMARIES) ?? []
  if (promptSummaries.length > 0) {
    lines.push('- Preserve these concise prompt summaries:')
    for (const promptSummary of promptSummaries) {
      lines.push(`  - ${summarizeForCompaction(promptSummary)}`)
    }
  }

  const artifacts = input.handoff?.artifacts.slice(0, MAX_COMPACTION_ARTIFACTS) ?? []
  if (artifacts.length > 0) {
    lines.push('- Preserve these artifact references exactly:')
    for (const artifact of artifacts) {
      lines.push(
        `  - ${artifact.id} (${artifact.kind}) path=${artifact.path} uri=${artifact.uri} sourceTool=${artifact.sourceTool}`,
      )
    }
    lines.push('- Keep artifact ids, absolute paths, and URIs exactly as written.')
  }

  return lines.join('\n')
}

export function collectResponseDirectiveHandoff(
  draft: WaggleTurnHandoffDraft,
  input: { readonly responseText: string; readonly includeRollbackDirective?: boolean },
): void {
  if (readKeepOrRevertDecision(input.responseText) !== 'revert') {
    return
  }

  if (input.includeRollbackDirective !== false) {
    addLoopDirective(
      draft,
      'Rollback required: the previous fix attempt was rejected. Before planning or editing further, first revert or undo the failed fix so the next loop starts from the last known good baseline.',
    )
  }

  const failedAttemptLearning = readSectionValue(
    input.responseText,
    'failed-attempt learning for next planner pass',
  )
  if (!isNoneValue(failedAttemptLearning)) {
    addLoopDirective(
      draft,
      `Carry this failed-attempt learning into the next planner pass: ${failedAttemptLearning}`,
    )
  }

  const exactNextLoopInstructions = readSectionValue(input.responseText, 'exact next loop instructions')
  if (!isNoneValue(exactNextLoopInstructions)) {
    addLoopDirective(
      draft,
      `Verifier-required next loop instructions: ${exactNextLoopInstructions}`,
    )
  }
}

export function mergeTurnHandoffImages(
  baseImages: readonly PiPromptInput['images'][number][],
  handoff: WaggleTurnHandoff | null,
  supportsImageInput: boolean,
): readonly PiPromptInput['images'][number][] {
  if (!supportsImageInput) {
    return []
  }

  if (baseImages.length >= MAX_WAGGLE_TURN_IMAGES) {
    return baseImages.slice(0, MAX_WAGGLE_TURN_IMAGES)
  }

  if (!handoff || handoff.images.length === 0) {
    return [...baseImages]
  }

  const remainingSlots = MAX_WAGGLE_TURN_IMAGES - baseImages.length
  return [...baseImages, ...handoff.images.slice(-remainingSlots)]
}

function findPromptSummary(value: unknown): string | null {
  const promptText = findPreferredString(value)
  if (!promptText) return null

  const normalized = promptText.replace(/\s+/g, ' ').trim()
  if (!normalized) return null
  return normalized.length > MAX_PROMPT_SUMMARY_LENGTH
    ? `${normalized.slice(0, MAX_PROMPT_SUMMARY_LENGTH)}...`
    : normalized
}

function addLoopDirective(draft: WaggleTurnHandoffDraft, directive: string) {
  if (draft.seenLoopDirectives.has(directive)) {
    return
  }
  draft.seenLoopDirectives.add(directive)
  draft.loopDirectives.push(directive)
}

function summarizeForCompaction(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return ''
  }
  return normalized.length > MAX_COMPACTION_TEXT_LENGTH
    ? `${normalized.slice(0, MAX_COMPACTION_TEXT_LENGTH)}...`
    : normalized
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function sectionLabelPattern(section: string) {
  const words = section
    .trim()
    .toLocaleLowerCase()
    .split(/[\s_-]+/)
    .filter((word) => word.length > 0)

  if (words.length === 0) {
    return escapeRegExp(section.trim().toLocaleLowerCase())
  }

  return words.map((word) => escapeRegExp(word)).join('[\\s_-]+')
}

function readSectionValue(text: string, section: string) {
  const pattern = new RegExp(
    `(?:^|\\n)\\s*(?:[-*]\\s*)?(?:\\*\\*)?${sectionLabelPattern(section)}(?:\\*\\*)?\\s*:\\s*(.*)$`,
    'im',
  )
  const match = pattern.exec(text)
  return match?.[1]?.trim() ?? null
}

function isNoneValue(value: string | null) {
  if (!value) {
    return true
  }
  return /^(?:none|n\/a|na|null)$/i.test(value.trim())
}

export function readKeepOrRevertDecision(text: string): 'keep' | 'revert' | null {
  const keepOrRevert = readSectionValue(text, 'keep or revert current fix')
  const normalized = keepOrRevert?.trim().toLocaleLowerCase() ?? ''
  if (normalized === 'keep' || normalized === 'revert') {
    return normalized
  }
  return null
}

export function appendLoopDirective(draft: WaggleTurnHandoffDraft, directive: string) {
  addLoopDirective(draft, directive)
}

function findPreferredString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const candidate = findPreferredString(entry)
      if (candidate) return candidate
    }
    return null
  }

  if (!isRecord(value)) {
    return null
  }

  for (const [key, candidate] of Object.entries(value)) {
    if (PROMPT_KEYS.has(key) && typeof candidate === 'string' && candidate.trim()) {
      return candidate
    }
  }

  for (const candidate of Object.values(value)) {
    const nested = findPreferredString(candidate)
    if (nested) return nested
  }

  return null
}

function findOutputPaths(value: unknown): string[] {
  const paths: string[] = []
  collectOutputPaths(value, paths)
  return [...new Set(paths)]
}

function collectOutputPaths(value: unknown, found: string[]): void {
  if (typeof value === 'string') {
    const normalizedPath = normalizePossiblePath(value)
    if (normalizedPath && classifyWaggleArtifactKind(normalizedPath) !== null) {
      found.push(normalizedPath)
    }
    return
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectOutputPaths(entry, found)
    }
    return
  }

  if (!isRecord(value)) {
    return
  }

  for (const entry of Object.values(value)) {
    collectOutputPaths(entry, found)
  }
}

function normalizePossiblePath(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('file://')) {
    const withoutProtocol = decodeURIComponent(trimmed.slice('file://'.length))
    return path.isAbsolute(withoutProtocol) ? withoutProtocol : null
  }
  return path.isAbsolute(trimmed) ? trimmed : null
}

function buildMcpStarterPayload(artifact: WaggleArtifact) {
  return {
    artifactId: artifact.id,
    kind: artifact.kind,
    mimeType: artifact.mimeType ?? null,
    path: artifact.path,
    filePath: artifact.path,
    inputPath: artifact.path,
    uri: artifact.uri,
    fileUri: artifact.uri,
    url: artifact.uri,
    fileName: artifact.transport.fileName,
    sizeBytes: artifact.transport.sizeBytes ?? null,
  }
}

function hydrateImageArtifact(artifact: WaggleArtifact): PiImageContent | null {
  if (artifact.kind !== 'image') return null

  try {
    const stats = fs.statSync(artifact.path)
    if (!stats.isFile() || stats.size > ATTACHMENT.MAX_SIZE_BYTES) {
      return null
    }

    const mimeType = artifact.mimeType ?? imageMimeType(artifact.path)
    if (!mimeType) return null

    return {
      type: 'image',
      data: fs.readFileSync(artifact.path).toString('base64'),
      mimeType,
    }
  } catch {
    return null
  }
}

function imageMimeType(filePath: string): string | null {
  return imageExtensionToMimeType(path.extname(filePath).toLowerCase())
}

function imageExtensionToMimeType(extension: string): string | null {
  switch (extension) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.bmp':
      return 'image/bmp'
    case '.svg':
      return 'image/svg+xml'
    default:
      return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
