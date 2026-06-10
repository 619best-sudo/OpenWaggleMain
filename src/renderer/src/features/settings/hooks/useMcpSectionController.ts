import { matchBy } from '@diegogbrisa/ts-match'
import { MCP_CONFIG } from '@shared/constants/mcp'
import type {
  McpConfigFile,
  McpConfigObject,
  McpConfigSourceId,
  McpConfigSourceSummary,
  McpServerSummary,
  McpSettingsView,
} from '@shared/types/mcp'
import { useEffect, useReducer } from 'react'
import { api } from '@/shared/lib/ipc'
import { useUIStore } from '@/shell/ui-store'

type LoadState = 'idle' | 'loading' | 'saving'

interface McpSectionState {
  readonly view: McpSettingsView | null
  readonly selectedSourceId: McpConfigSourceId
  readonly rawEdits: Partial<Record<McpConfigSourceId, string>>
  readonly loadState: LoadState
  readonly error: string | null
}

type McpSectionAction =
  | { readonly type: 'load:start' }
  | { readonly type: 'load:success'; readonly view: McpSettingsView }
  | { readonly type: 'load:error'; readonly error: string }
  | { readonly type: 'save:start' }
  | { readonly type: 'mutation:success'; readonly view: McpSettingsView }
  | {
      readonly type: 'source-save:success'
      readonly view: McpSettingsView
      readonly sourceId: McpConfigSourceId
    }
  | { readonly type: 'mutation:error'; readonly error: string }
  | { readonly type: 'source:select'; readonly sourceId: McpConfigSourceId }
  | {
      readonly type: 'raw-edit:change'
      readonly sourceId: McpConfigSourceId
      readonly rawJson: string
    }

const INITIAL_SELECTED_SOURCE_ID: McpConfigSourceId = 'global-standard'

const MCP_SECTION_INITIAL_STATE: McpSectionState = {
  view: null,
  selectedSourceId: INITIAL_SELECTED_SOURCE_ID,
  rawEdits: {},
  loadState: 'idle',
  error: null,
}

function withoutRawEdit(
  rawEdits: Partial<Record<McpConfigSourceId, string>>,
  sourceId: McpConfigSourceId,
): Partial<Record<McpConfigSourceId, string>> {
  const remainingEdits = { ...rawEdits }
  delete remainingEdits[sourceId]
  return remainingEdits
}

function mcpSectionReducer(state: McpSectionState, action: McpSectionAction): McpSectionState {
  return matchBy(action, 'type')
    .with('load:start', () => ({ ...state, loadState: 'loading', error: null }))
    .with('load:success', (value) => ({
      ...state,
      view: value.view,
      rawEdits: {},
      loadState: 'idle',
      error: null,
    }))
    .with('load:error', (value) => ({ ...state, loadState: 'idle', error: value.error }))
    .with('save:start', () => ({ ...state, loadState: 'saving', error: null }))
    .with('mutation:success', (value) => ({
      ...state,
      view: value.view,
      loadState: 'idle',
      error: null,
    }))
    .with('source-save:success', (value) => ({
      ...state,
      view: value.view,
      rawEdits: withoutRawEdit(state.rawEdits, value.sourceId),
      loadState: 'idle',
      error: null,
    }))
    .with('mutation:error', (value) => ({ ...state, loadState: 'idle', error: value.error }))
    .with('source:select', (value) => ({ ...state, selectedSourceId: value.sourceId }))
    .with('raw-edit:change', (value) => ({
      ...state,
      rawEdits: { ...state.rawEdits, [value.sourceId]: value.rawJson },
    }))
    .exhaustive()
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function sourceById(sources: readonly McpConfigSourceSummary[], sourceId: McpConfigSourceId) {
  return sources.find((source) => source.id === sourceId) ?? null
}

function getSelectedSource(view: McpSettingsView, selectedSourceId: McpConfigSourceId) {
  return sourceById(view.sources, selectedSourceId) ?? view.sources[0] ?? null
}

interface AddMcpServerInput {
  readonly transport: 'stdio' | 'http'
  readonly name: string
  readonly command?: string
  readonly args?: string
  readonly url?: string
}

export function useMcpSectionController(projectPath: string | null) {
  const [state, dispatch] = useReducer(mcpSectionReducer, MCP_SECTION_INITIAL_STATE)
  const showToast = useUIStore((state) => state.showToast)
  const { view, selectedSourceId, rawEdits, loadState, error } = state

  useEffect(() => {
    let active = true

    async function load() {
      dispatch({ type: 'load:start' })
      try {
        const nextView = await api.getMcpSettings(projectPath)
        if (active) dispatch({ type: 'load:success', view: nextView })
      } catch (loadError) {
        if (active) dispatch({ type: 'load:error', error: getErrorMessage(loadError) })
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [projectPath])

  async function refresh() {
    dispatch({ type: 'load:start' })
    try {
      dispatch({ type: 'load:success', view: await api.getMcpSettings(projectPath) })
    } catch (refreshError) {
      dispatch({ type: 'load:error', error: getErrorMessage(refreshError) })
    }
  }

  async function toggleAdapter() {
    if (!view) return
    dispatch({ type: 'save:start' })
    try {
      dispatch({
        type: 'mutation:success',
        view: await api.setMcpAdapterEnabled(!view.adapter.enabled, projectPath),
      })
    } catch (toggleError) {
      dispatch({ type: 'mutation:error', error: getErrorMessage(toggleError) })
    }
  }

  async function toggleServer(server: McpServerSummary) {
    dispatch({ type: 'save:start' })
    try {
      const nextView = await api.setMcpServerEnabled({
        projectPath,
        sourceId: server.sourceId,
        serverName: server.name,
        enabled: !server.enabled,
      })
      dispatch({ type: 'mutation:success', view: nextView })
    } catch (toggleError) {
      dispatch({ type: 'mutation:error', error: getErrorMessage(toggleError) })
    }
  }

  async function saveSelectedSource() {
    if (!view) return
    const selectedSource = getSelectedSource(view, selectedSourceId)
    if (!selectedSource) return

    dispatch({ type: 'save:start' })
    try {
      const nextView = await api.writeMcpSourceConfig({
        projectPath,
        sourceId: selectedSource.id,
        rawJson: rawEdits[selectedSource.id] ?? selectedSource.rawJson,
      })
      dispatch({ type: 'source-save:success', view: nextView, sourceId: selectedSource.id })
      showToast('MCP JSON saved.', 'success')
    } catch (saveError) {
      const message = getErrorMessage(saveError)
      dispatch({ type: 'mutation:error', error: message })
      showToast(`MCP JSON was not saved: ${message}`, 'error')
    }
  }

  async function addServer(input: AddMcpServerInput) {
    if (!view) return
    const selectedSource = getSelectedSource(view, selectedSourceId)
    if (!selectedSource) {
      showToast('Select an MCP source first.', 'error')
      return
    }
    if (!selectedSource.editable) {
      showToast('The selected MCP source is read-only.', 'error')
      return
    }

    let nextRawJson: string
    try {
      const parsed = parseMcpSource(rawEdits[selectedSource.id] ?? selectedSource.rawJson)
      const nextConfig = buildConfigWithServer(parsed, input)
      nextRawJson = JSON.stringify(nextConfig, null, MCP_CONFIG.JSON_INDENT_SPACES)
      if (!nextRawJson.endsWith('\n')) {
        nextRawJson = `${nextRawJson}\n`
      }
    } catch (error) {
      const message = getErrorMessage(error)
      dispatch({ type: 'mutation:error', error: message })
      showToast(`Quick add failed: ${message}`, 'error')
      return
    }

    dispatch({ type: 'save:start' })
    try {
      const nextView = await api.writeMcpSourceConfig({
        projectPath,
        sourceId: selectedSource.id,
        rawJson: nextRawJson,
      })
      dispatch({ type: 'source-save:success', view: nextView, sourceId: selectedSource.id })
      showToast(`Added MCP server "${input.name}".`, 'success')
    } catch (saveError) {
      const message = getErrorMessage(saveError)
      dispatch({ type: 'mutation:error', error: message })
      showToast(`Quick add failed: ${message}`, 'error')
    }
  }

  const selectedSource = view ? getSelectedSource(view, selectedSourceId) : null
  const rawJson = selectedSource ? (rawEdits[selectedSource.id] ?? selectedSource.rawJson) : ''

  return {
    view,
    error,
    selectedSource,
    rawJson,
    busy: loadState !== 'idle',
    refresh,
    toggleAdapter,
    toggleServer,
    saveSelectedSource,
    addServer,
    selectSource: (sourceId: McpConfigSourceId) => dispatch({ type: 'source:select', sourceId }),
    updateRawJson: (sourceId: McpConfigSourceId, rawJson: string) =>
      dispatch({ type: 'raw-edit:change', sourceId, rawJson }),
  }
}

function parseMcpSource(rawJson: string): McpConfigFile {
  const raw = rawJson.trim().length > 0 ? rawJson : MCP_CONFIG.EMPTY_CONFIG_RAW_JSON
  const parsed = JSON.parse(raw) as unknown
  if (!isRecord(parsed)) {
    throw new Error('Selected source must be a JSON object.')
  }
  return parsed as McpConfigFile
}

function buildConfigWithServer(config: McpConfigFile, input: AddMcpServerInput): McpConfigFile {
  const name = input.name.trim()
  if (!name) {
    throw new Error('Server name is required.')
  }

  const existingServers = isRecord(config.mcpServers) ? { ...config.mcpServers } : {}
  if (name in existingServers) {
    throw new Error(`Server "${name}" already exists in this source.`)
  }

  existingServers[name] =
    input.transport === 'http'
      ? buildHttpServerDefinition(input)
      : buildStdioServerDefinition(input)

  return {
    ...config,
    mcpServers: existingServers,
  }
}

function buildHttpServerDefinition(input: AddMcpServerInput): McpConfigObject {
  const url = input.url?.trim() ?? ''
  if (!url) {
    throw new Error('Server URL is required for HTTP transport.')
  }
  return { url }
}

function buildStdioServerDefinition(input: AddMcpServerInput): McpConfigObject {
  const command = input.command?.trim() ?? ''
  if (!command) {
    throw new Error('Command is required for stdio transport.')
  }

  const args = parseArgumentText(input.args ?? '')
  return args.length > 0 ? { command, args } : { command }
}

function parseArgumentText(value: string) {
  const matches = value.match(/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|\S+/g) ?? []
  return matches.map((token) => stripMatchingQuotes(token))
}

function stripMatchingQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
