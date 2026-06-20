import fs from 'node:fs'
import path from 'node:path'
import type {
  WaggleArtifact,
  WaggleArtifactBase64Mode,
  WaggleArtifactKind,
  WaggleStreamMetadata,
} from '@shared/types/waggle'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg'])
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.webm'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm'])
const MCP_PATH_FIRST_FIELDS = ['path', 'filePath', 'inputPath'] as const
const MCP_URI_FALLBACK_FIELDS = ['uri', 'fileUri', 'url'] as const
const MAX_REASONABLE_INLINE_BASE64_BYTES = 512 * 1024

interface RegistryState {
  readonly byPath: Map<string, WaggleArtifact>
  nextIndex: number
}

export interface WaggleArtifactRegistry {
  readonly sessionId: string
  readonly state: RegistryState
}

export function createWaggleArtifactRegistry(sessionId: string): WaggleArtifactRegistry {
  return {
    sessionId,
    state: {
      byPath: new Map(),
      nextIndex: 1,
    },
  }
}

export function classifyWaggleArtifactKind(filePath: string): WaggleArtifactKind | null {
  const extension = path.extname(filePath).toLowerCase()
  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio'
  if (VIDEO_EXTENSIONS.has(extension)) return 'video'
  return null
}

export function buildWaggleArtifactReference(artifact: WaggleArtifact): string {
  return `${artifact.id} (${artifact.kind}) -> ${artifact.path}`
}

export function registerWaggleArtifact(input: {
  readonly registry: WaggleArtifactRegistry
  readonly filePath: string
  readonly toolName: string
  readonly meta: WaggleStreamMetadata
  readonly promptSummary?: string
}): WaggleArtifact {
  const existing = input.registry.state.byPath.get(input.filePath)
  if (existing) {
    return existing
  }

  const kind = classifyWaggleArtifactKind(input.filePath)
  if (!kind) {
    throw new Error(`Unsupported Waggle artifact path: ${input.filePath}`)
  }

  const id = `waggle-artifact-${String(input.registry.state.nextIndex).padStart(3, '0')}`
  input.registry.state.nextIndex += 1

  const artifact: WaggleArtifact = {
    id,
    kind,
    path: input.filePath,
    uri: `file://${encodeURI(input.filePath)}`,
    mimeType: mimeTypeForArtifact(kind, input.filePath) ?? undefined,
    sourceTool: input.toolName,
    createdByAgentIndex: input.meta.agentIndex,
    createdByAgentLabel: input.meta.agentLabel,
    turnNumber: input.meta.turnNumber,
    transport: buildWaggleArtifactTransport(input.filePath),
    ...(input.promptSummary ? { promptSummary: input.promptSummary } : {}),
  }
  input.registry.state.byPath.set(input.filePath, artifact)
  return artifact
}

function buildWaggleArtifactTransport(filePath: string) {
  const sizeBytes = fileSizeBytes(filePath)
  return {
    fileName: path.basename(filePath),
    ...(sizeBytes === null ? {} : { sizeBytes }),
    preferredFieldNames: MCP_PATH_FIRST_FIELDS,
    fallbackFieldNames: MCP_URI_FALLBACK_FIELDS,
    base64Mode: resolveBase64Mode(sizeBytes),
  }
}

function fileSizeBytes(filePath: string): number | null {
  try {
    const stats = fs.statSync(filePath)
    return stats.isFile() ? stats.size : null
  } catch {
    return null
  }
}

function resolveBase64Mode(sizeBytes: number | null): WaggleArtifactBase64Mode {
  if (sizeBytes === null) return 'avoid'
  return sizeBytes <= MAX_REASONABLE_INLINE_BASE64_BYTES ? 'reasonable-if-required' : 'avoid'
}

function mimeTypeForArtifact(kind: WaggleArtifactKind, filePath: string): string | null {
  const extension = path.extname(filePath).toLowerCase()
  if (kind === 'image') {
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

  if (kind === 'audio') {
    switch (extension) {
      case '.mp3':
        return 'audio/mpeg'
      case '.wav':
        return 'audio/wav'
      case '.m4a':
        return 'audio/mp4'
      case '.aac':
        return 'audio/aac'
      case '.ogg':
        return 'audio/ogg'
      case '.flac':
        return 'audio/flac'
      case '.webm':
        return 'audio/webm'
      default:
        return null
    }
  }

  switch (extension) {
    case '.mp4':
      return 'video/mp4'
    case '.mov':
      return 'video/quicktime'
    case '.avi':
      return 'video/x-msvideo'
    case '.mkv':
      return 'video/x-matroska'
    case '.webm':
      return 'video/webm'
    default:
      return null
  }
}
