import path from 'node:path'
import type { AuthStorage, ExtensionFactory, ToolInfo } from '@mariozechner/pi-coding-agent'
import { parseModelRef } from '@shared/types/llm'

const TURING_MACHINE_PROVIDER_ID = 'turing-machine'
const MAX_SELECTION_CACHE_ENTRIES = 64
const SELECTOR_REQUEST_TIMEOUT_MS = 2500
const SELECTOR_JOIN_TIMEOUT_MS = 1500

type JsonRecord = Record<string, unknown>
type ProviderPayload = JsonRecord & {
  readonly model?: unknown
  readonly messages?: unknown
  readonly tools?: unknown
  readonly tool_choice?: unknown
  readonly metadata?: unknown
}
type TuringMachineExtensionContext = {
  readonly getModel: () => { readonly provider?: string } | undefined
  readonly getAllTools: () => ToolInfo[]
}

type ToolSelectionResponse = {
  readonly selectedExternalCategories: readonly string[]
}

type ToolSelectionCacheEntry = {
  promise: Promise<ToolSelectionResponse>
  updatedAt: number
  selectedExternalCategories: readonly string[] | null
}

type RoutingMetadata = {
  readonly origin: 'builtin' | 'external'
  readonly kind?: 'mcp' | 'skill'
  readonly categories?: readonly string[]
  readonly keywords?: readonly string[]
  readonly source?: string
  readonly scope?: string
  readonly sourcePath?: string
  readonly sourceBaseDir?: string
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function uniqueStrings(values: readonly string[]) {
  const normalized = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const token = normalizeToken(value)
    if (!token || normalized.has(token)) {
      continue
    }
    normalized.add(token)
    result.push(token)
  }
  return result
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(errorMessage))
    }, timeoutMs)

    promise.then(
      (value) => {
        clearTimeout(timeoutId)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timeoutId)
        reject(error)
      },
    )
  })
}

function selectExternalTools(tools: unknown) {
  if (!Array.isArray(tools)) {
    return tools
  }

  return tools.filter((tool) => {
    if (!isRecord(tool)) {
      return false
    }
    const metadata = isRecord(tool.metadata) ? tool.metadata : {}
    return metadata.origin === 'external'
  })
}

function extractToolName(tool: unknown) {
  if (!isRecord(tool)) {
    return null
  }
  if (typeof tool.name === 'string') {
    return tool.name
  }
  const fn = isRecord(tool.function) ? tool.function : null
  return typeof fn?.name === 'string' ? fn.name : null
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .map((part) => {
      if (typeof part === 'string') {
        return part
      }
      if (!isRecord(part)) {
        return ''
      }
      return typeof part.text === 'string' ? part.text : ''
    })
    .filter(Boolean)
    .join('\n')
}

export function extractLatestUserMessageText(messages: unknown): string | null {
  if (!Array.isArray(messages)) {
    return null
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!isRecord(message) || message.role !== 'user') {
      continue
    }
    const text = extractTextFromContent(message.content).trim()
    if (text) {
      return text
    }
  }

  return null
}

function buildToolSignature(tools: unknown) {
  if (!Array.isArray(tools)) {
    return ''
  }

  return tools
    .map((tool) => {
      if (!isRecord(tool)) {
        return ''
      }
      const name = extractToolName(tool) ?? ''
      const metadata = isRecord(tool.metadata) ? tool.metadata : {}
      const categories = Array.isArray(metadata.categories)
        ? metadata.categories.filter((value): value is string => typeof value === 'string')
        : []
      const origin = typeof metadata.origin === 'string' ? metadata.origin : ''
      return JSON.stringify({ name, origin, categories })
    })
    .filter(Boolean)
    .sort()
    .join('|')
}

export function buildToolSelectionCacheKey(input: {
  readonly latestUserMessage: string
  readonly tools: unknown
}) {
  return JSON.stringify({
    latestUserMessage: input.latestUserMessage.trim(),
    tools: buildToolSignature(input.tools),
  })
}

function trimSelectionCache(cache: Map<string, ToolSelectionCacheEntry>) {
  if (cache.size <= MAX_SELECTION_CACHE_ENTRIES) {
    return
  }

  const oldestEntries = [...cache.entries()].sort(
    (left, right) => left[1].updatedAt - right[1].updatedAt,
  )
  for (const [key] of oldestEntries.slice(0, cache.size - MAX_SELECTION_CACHE_ENTRIES)) {
    cache.delete(key)
  }
}

function withMergedMetadata(tool: JsonRecord, metadata: RoutingMetadata) {
  const existingMetadata = isRecord(tool.metadata) ? tool.metadata : {}
  return {
    ...tool,
    metadata: {
      ...existingMetadata,
      ...metadata,
    },
  }
}

function classifyToolRouting(input: {
  readonly toolName: string
  readonly toolInfo: ToolInfo | undefined
  readonly mcpServerNames: readonly string[]
}): RoutingMetadata {
  const { toolName, toolInfo, mcpServerNames } = input
  const sourceInfo = toolInfo?.sourceInfo
  const sourcePath = sourceInfo?.path ?? ''
  const normalizedName = normalizeToken(toolName)
  const nameSegments = uniqueStrings(toolName.split(/[_-]+/g))
  const categories = new Set<string>()
  const keywords = new Set<string>(nameSegments)

  const isBuiltin =
    sourceInfo?.source === 'builtin' || sourcePath.startsWith('<builtin:') || sourcePath === ''

  if (!isBuiltin) {
    const normalizedServerNames = mcpServerNames.map((serverName) => ({
      raw: serverName,
      token: normalizeToken(serverName),
    }))
    const matchingServerNames = normalizedServerNames
      .filter(({ raw, token }) => {
        const normalizedRaw = raw.replace(/-/g, '_').toLowerCase()
        return (
          normalizedName === token ||
          normalizedName.startsWith(`${token}-`) ||
          toolName.toLowerCase() === normalizedRaw ||
          toolName.toLowerCase().startsWith(`${normalizedRaw}_`)
        )
      })
      .map(({ token }) => token)

    if (
      toolName === 'mcp' ||
      sourcePath.includes('pi-mcp-adapter') ||
      matchingServerNames.length > 0
    ) {
      categories.add('mcp')
      for (const serverName of matchingServerNames.length > 0
        ? matchingServerNames
        : mcpServerNames) {
        categories.add(normalizeToken(serverName))
      }
      return {
        origin: 'external',
        kind: 'mcp',
        categories: [...categories],
        keywords: [...keywords, ...categories],
        source: sourceInfo?.source,
        scope: sourceInfo?.scope,
        sourcePath: sourceInfo?.path,
        sourceBaseDir: sourceInfo?.baseDir,
      }
    }

    const skillMarker = `${path.sep}skills${path.sep}`
    if (sourcePath.includes(skillMarker)) {
      const skillId = normalizeToken(path.basename(path.dirname(sourcePath)))
      if (skillId) {
        categories.add(skillId)
      }
      return {
        origin: 'external',
        kind: 'skill',
        categories: [...categories],
        keywords: [...keywords, ...categories],
        source: sourceInfo?.source,
        scope: sourceInfo?.scope,
        sourcePath: sourceInfo?.path,
        sourceBaseDir: sourceInfo?.baseDir,
      }
    }

    if (nameSegments[0]) {
      categories.add(nameSegments[0])
    }
  }

  return {
    origin: isBuiltin ? 'builtin' : 'external',
    ...(categories.size > 0 ? { categories: [...categories] } : {}),
    keywords: [...keywords, ...categories],
    source: sourceInfo?.source,
    scope: sourceInfo?.scope,
    sourcePath: sourceInfo?.path,
    sourceBaseDir: sourceInfo?.baseDir,
  }
}

export function annotateTuringMachineTools(input: {
  readonly tools: unknown
  readonly allTools: readonly ToolInfo[]
  readonly mcpServerNames: readonly string[]
}) {
  if (!Array.isArray(input.tools)) {
    return input.tools
  }

  const toolInfoByName = new Map(input.allTools.map((tool) => [tool.name, tool]))
  return input.tools.map((tool) => {
    if (!isRecord(tool)) {
      return tool
    }
    const toolName = extractToolName(tool)
    if (!toolName) {
      return tool
    }
    const routing = classifyToolRouting({
      toolName,
      toolInfo: toolInfoByName.get(toolName),
      mcpServerNames: input.mcpServerNames,
    })
    return withMergedMetadata(tool, routing)
  })
}

function mergeSelectedExternalCategories(metadata: unknown, categories: readonly string[]) {
  const normalizedCategories = uniqueStrings(categories)
  const baseMetadata = isRecord(metadata) ? metadata : {}
  const existingToolSelection = isRecord(baseMetadata.toolSelection)
    ? baseMetadata.toolSelection
    : {}

  return {
    ...baseMetadata,
    selectedExternalToolCategories: normalizedCategories,
    toolSelection: {
      ...existingToolSelection,
      selectedExternalToolCategories: normalizedCategories,
      categories: normalizedCategories,
    },
  }
}

async function fetchToolSelection(input: {
  readonly payload: ProviderPayload
  readonly authStorage: AuthStorage
  readonly baseUrl: string
}) {
  const selectorTools = selectExternalTools(input.payload.tools)
  const credential = input.authStorage.get(TURING_MACHINE_PROVIDER_ID)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (credential?.type === 'api_key' && credential.key.trim()) {
    headers.Authorization = `Bearer ${credential.key.trim()}`
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), SELECTOR_REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(`${input.baseUrl}/tool-selection`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        messages: input.payload.messages,
        tools: selectorTools,
        tool_choice: input.payload.tool_choice,
        metadata: input.payload.metadata,
      }),
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Tool selection timed out after ${SELECTOR_REQUEST_TIMEOUT_MS}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
  if (!response.ok) {
    throw new Error(`Tool selection failed with status ${response.status}`)
  }

  const payload = await response.json()
  const selectedExternalCategories = isRecord(payload)
    ? Array.isArray(payload.selectedExternalCategories)
      ? payload.selectedExternalCategories.filter(
          (value): value is string => typeof value === 'string',
        )
      : []
    : []
  return {
    selectedExternalCategories: uniqueStrings(selectedExternalCategories),
  } satisfies ToolSelectionResponse
}

function shouldHandleTuringMachinePayload(
  payload: ProviderPayload,
  ctx: TuringMachineExtensionContext,
) {
  const model = ctx.getModel()
  if (model?.provider === TURING_MACHINE_PROVIDER_ID) {
    return true
  }
  if (payload.model === 'turing-machine') {
    return true
  }
  if (typeof payload.model !== 'string') {
    return false
  }
  return parseModelRef(payload.model)?.provider === TURING_MACHINE_PROVIDER_ID
}

function annotatePayloadTools(input: {
  readonly payload: ProviderPayload
  readonly ctx: TuringMachineExtensionContext
  readonly mcpServerNames: readonly string[]
}): ProviderPayload {
  return {
    ...input.payload,
    tools: annotateTuringMachineTools({
      tools: input.payload.tools,
      allTools: input.ctx.getAllTools(),
      mcpServerNames: input.mcpServerNames,
    }),
  }
}

export function createTuringMachineToolSelectionExtension(input: {
  readonly authStorage: AuthStorage
  readonly baseUrl: string
  readonly mcpServerNames?: readonly string[]
}): ExtensionFactory {
  const selectionCache = new Map<string, ToolSelectionCacheEntry>()
  const mcpServerNames = uniqueStrings(input.mcpServerNames ?? [])

  return (pi) => {
    const clearSelectionCache = () => selectionCache.clear()

    pi.on('session_start', () => {
      clearSelectionCache()
    })
    pi.on('session_shutdown', clearSelectionCache)
    pi.on('before_provider_request', async (event, ctx) => {
      const extensionContext = ctx as unknown as TuringMachineExtensionContext
      if (!isRecord(event.payload)) {
        return event.payload
      }

      const payload = event.payload as ProviderPayload
      if (!shouldHandleTuringMachinePayload(payload, extensionContext)) {
        return event.payload
      }

      const annotatedPayload = annotatePayloadTools({
        payload,
        ctx: extensionContext,
        mcpServerNames,
      })
      // Model routing is no longer applied to the orchestrator turn here. Routed
      // tool authoring is performed per tool call by the runtime (see
      // `tool-model-route.ts` and the patched pi-agent-core loop), so this hook
      // only annotates tools and runs tool selection.
      const routedPayload = annotatedPayload
      const latestUserMessage = extractLatestUserMessageText(annotatedPayload.messages)
      if (!latestUserMessage) {
        return routedPayload
      }

      const cacheKey = buildToolSelectionCacheKey({
        latestUserMessage,
        tools: annotatedPayload.tools,
      })
      const existingEntry = selectionCache.get(cacheKey)

      if (!existingEntry) {
        const entry: ToolSelectionCacheEntry = {
          promise: fetchToolSelection({
            payload: routedPayload,
            authStorage: input.authStorage,
            baseUrl: input.baseUrl,
          }),
          updatedAt: Date.now(),
          selectedExternalCategories: null,
        }
        entry.promise
          .then((response) => {
            entry.updatedAt = Date.now()
            entry.selectedExternalCategories = response.selectedExternalCategories
          })
          .catch(() => {
            entry.updatedAt = Date.now()
            entry.selectedExternalCategories = null
          })
        selectionCache.set(cacheKey, entry)
        trimSelectionCache(selectionCache)
        return routedPayload
      }

      existingEntry.updatedAt = Date.now()
      let selectedExternalCategories = existingEntry.selectedExternalCategories
      if (selectedExternalCategories === null) {
        try {
          const response = await withTimeout(
            existingEntry.promise,
            SELECTOR_JOIN_TIMEOUT_MS,
            `Tool selection join timed out after ${SELECTOR_JOIN_TIMEOUT_MS}ms`,
          )
          selectedExternalCategories = response.selectedExternalCategories
          existingEntry.selectedExternalCategories = response.selectedExternalCategories
        } catch {
          return routedPayload
        }
      }

      if (selectedExternalCategories.length === 0) {
        return routedPayload
      }

      return {
        ...routedPayload,
        metadata: mergeSelectedExternalCategories(
          routedPayload.metadata,
          selectedExternalCategories,
        ),
      }
    })
  }
}
