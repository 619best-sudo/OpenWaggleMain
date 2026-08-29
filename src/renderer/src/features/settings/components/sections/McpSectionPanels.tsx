import type {
  McpConfigSourceId,
  McpConfigSourceSummary,
  McpServerSummary,
  McpSettingsView,
} from '@shared/types/mcp'
import {
  AlertTriangle,
  CheckCircle2,
  Globe,
  Network,
  Plus,
  RotateCw,
  TerminalSquare,
  Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { Select } from '@/shared/ui/Select'
import { TextInput } from '@/shared/ui/TextInput'
import { ToggleSwitch } from '@/shared/ui/ToggleSwitch'

function formatServerDetail(server: McpServerSummary) {
  if (server.transport === 'http' && server.url) return server.url
  if (server.transport === 'stdio' && server.command) return server.command
  return 'No transport configured'
}

function SourceButton({
  source,
  selected,
  onSelect,
}: {
  readonly source: McpConfigSourceSummary
  readonly selected: boolean
  readonly onSelect: () => void
}) {
  const statusLabel = source.parseError ? 'Invalid' : source.exists ? 'Found' : 'Empty'
  return (
    <Button
      variant="unstyled"
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-xl border p-3.5 text-left transition-all',
        selected
          ? 'border-info/35 bg-info/10 text-text-primary shadow-[inset_0_1px_0_var(--theme-panel-shadow-highlight),0_0_0_1px_color-mix(in_srgb,var(--color-info)_12%,transparent)]'
          : 'border-[var(--theme-border-overlay-subtle)] bg-[var(--theme-surface-overlay-subtle)] text-text-secondary hover:border-[var(--theme-border-overlay-strong)] hover:bg-[var(--theme-surface-overlay)]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-medium">{source.label}</div>
          <div className="mt-1 truncate text-[10px] text-text-muted">{source.path}</div>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium',
            source.parseError
              ? 'border-error/20 bg-error/10 text-error'
              : source.exists
                ? 'border-success/25 bg-success/10 text-success'
                : 'border-[var(--theme-border-overlay-subtle)] bg-[var(--theme-surface-overlay)] text-text-muted',
          )}
        >
          {statusLabel}
        </span>
      </div>
      {source.parseError ? (
        <div className="mt-2 line-clamp-2 text-[10px] text-error">{source.parseError}</div>
      ) : (
        <div className="mt-3 flex gap-2 text-[10px] text-text-tertiary">
          <span
            className={cn(
              'rounded-full px-2 py-0.5',
              selected ? 'bg-info/12 text-info' : 'bg-[var(--theme-surface-overlay)]',
            )}
          >
            {source.serverCount} active
          </span>
          <span
            className={cn(
              'rounded-full px-2 py-0.5',
              selected ? 'bg-info/10 text-text-secondary' : 'bg-[var(--theme-surface-overlay)]',
            )}
          >
            {source.disabledServerCount} disabled
          </span>
        </div>
      )}
    </Button>
  )
}

function ServerRow({
  server,
  index,
  busy,
  removable,
  onToggle,
  onRemove,
}: {
  readonly server: McpServerSummary
  readonly index: number
  readonly busy: boolean
  readonly removable: boolean
  readonly onToggle: () => void
  readonly onRemove: () => void
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 border-b border-border/50 px-4 py-2.5 transition-colors last:border-b-0',
        index % 2 === 0 ? 'bg-bg-secondary/55' : 'bg-bg-tertiary/35',
        'hover:bg-bg-hover/60',
      )}
    >
      <div className="min-w-0 flex-1 flex items-center gap-3">
        <span className="text-[12px] font-medium text-text-primary min-w-[140px] truncate">
          {server.name}
        </span>
        <span className="truncate text-[10px] text-text-tertiary">
          {formatServerDetail(server)}
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <ToggleSwitch
          checked={server.enabled}
          disabled={busy}
          label={`${server.enabled ? 'Disable' : 'Enable'} ${server.name}`}
          onCheckedChange={onToggle}
        />
        <Button
          variant="unstyled"
          type="button"
          disabled={!removable || busy}
          onClick={onRemove}
          title={
            removable
              ? `Remove ${server.name} from ${server.sourceLabel}`
              : `"${server.sourceLabel}" is read-only and cannot be edited here`
          }
          aria-label={`Remove ${server.name}`}
          className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-error/10 hover:text-error disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-tertiary"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

export function McpSectionHeading() {
  return (
    <div className="space-y-1">
      <h2 className="text-[17px] font-semibold text-text-primary">MCP</h2>
      <p className="max-w-[760px] text-[12px] leading-5 text-text-tertiary">
        Connect external tools and services to Turing Machine using the Model Context Protocol.
      </p>
    </div>
  )
}

export function McpErrorAlert({ message }: { readonly message: string | null | undefined }) {
  if (!message) return null
  return (
    <p
      role="alert"
      className="rounded-lg border border-error/25 bg-error/6 px-3 py-2 text-sm text-error"
    >
      {message}
    </p>
  )
}

function McpAdapterStatus({ enabled }: { readonly enabled: boolean }) {
  return enabled ? (
    <span className="inline-flex items-center gap-1 rounded bg-success/10 px-1.5 py-0.5 text-[10px] text-success">
      <CheckCircle2 className="size-3" />
      Enabled
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] text-text-muted">
      <AlertTriangle className="size-3" />
      Off
    </span>
  )
}

export function McpAdapterCard({
  view,
  busy,
  onRefresh,
  onToggle,
}: {
  readonly view: McpSettingsView | null
  readonly busy: boolean
  readonly onRefresh: () => void
  readonly onToggle: () => void
}) {
  const adapterEnabled = view?.adapter.enabled ?? false
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-bg-secondary p-4 shadow-[inset_0_1px_0_var(--theme-panel-shadow-highlight)]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Network className="size-4 text-accent" />
          <h3 className="text-[12px] font-medium text-text-primary">MCP Connection</h3>
          <McpAdapterStatus enabled={adapterEnabled} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={onRefresh}
            leftIcon={<RotateCw className="size-3" />}
            className="h-7 text-[10px] px-2.5"
          >
            Refresh
          </Button>
          <div className="flex items-center gap-2 rounded-full border border-border bg-bg-tertiary px-2.5 py-1">
            <span className="text-[10px] font-medium text-text-secondary">
              {adapterEnabled ? 'On' : 'Off'}
            </span>
            <ToggleSwitch
              checked={adapterEnabled}
              disabled={!view || busy}
              label={`${adapterEnabled ? 'Disable' : 'Enable'} MCP Connection`}
              onCheckedChange={onToggle}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

interface McpQuickInstallPanelProps {
  readonly sources?: readonly McpConfigSourceSummary[]
  readonly selectedSource: McpConfigSourceSummary | null
  readonly busy: boolean
  readonly onSelectSource: (sourceId: McpConfigSourceId) => void
  readonly onAddServer: (input: {
    transport: 'stdio' | 'http'
    name: string
    command?: string
    args?: string
    url?: string
  }) => Promise<void>
}

type McpInstallTarget = {
  readonly id: McpConfigSourceId
  readonly label: string
  readonly helper: string
}

const PROJECT_SOURCE_PREFERENCE: readonly McpConfigSourceId[] = [
  'project-turing-machine',
  'project-standard',
  'project-agents',
  'project-pi',
] as const

const GLOBAL_SOURCE_PREFERENCE: readonly McpConfigSourceId[] = [
  'global-standard',
  'global-pi',
] as const

export function McpQuickInstallPanel({
  sources = [],
  selectedSource,
  busy,
  onSelectSource,
  onAddServer,
}: McpQuickInstallPanelProps) {
  const [transport, setTransport] = useState<'stdio' | 'http'>('stdio')
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [url, setUrl] = useState('')

  const canInstall =
    !busy &&
    !!selectedSource?.editable &&
    name.trim().length > 0 &&
    (transport === 'http' ? url.trim().length > 0 : command.trim().length > 0)

  const installTargets = useMemo(() => {
    const editableSources = sources.filter((source) => source.editable)
    const projectSources = editableSources.filter((source) => source.scope === 'project')
    const globalSources = editableSources.filter((source) => source.scope === 'global')

    const preferredProjectSource = choosePreferredSource(projectSources, PROJECT_SOURCE_PREFERENCE)
    const preferredGlobalSource = choosePreferredSource(globalSources, GLOBAL_SOURCE_PREFERENCE)

    const activeProjectSource =
      selectedSource?.editable && selectedSource.scope === 'project'
        ? selectedSource
        : preferredProjectSource
    const activeGlobalSource =
      selectedSource?.editable && selectedSource.scope === 'global'
        ? selectedSource
        : preferredGlobalSource

    const targets: McpInstallTarget[] = []
    if (activeProjectSource) {
      targets.push({
        id: activeProjectSource.id,
        label: 'This Project Only',
        helper: 'Recommended. Keeps this MCP just for the project you are working in.',
      })
    }
    if (activeGlobalSource) {
      targets.push({
        id: activeGlobalSource.id,
        label: 'All Projects On This Computer',
        helper: 'Makes this MCP available everywhere in Turing Machine on this device.',
      })
    }
    return targets
  }, [selectedSource, sources])

  const selectedInstallTarget = useMemo(
    () => installTargets.find((target) => target.id === selectedSource?.id) ?? null,
    [installTargets, selectedSource?.id],
  )

  const availableTarget = useMemo(() => {
    if (!selectedSource) return 'Choose where this MCP should be available.'
    if (!selectedSource.editable)
      return 'This destination is read-only. Pick another place to add this MCP.'
    return selectedInstallTarget?.helper ?? 'Choose where this MCP should be available.'
  }, [selectedInstallTarget, selectedSource])

  async function handleAdd() {
    await onAddServer({
      transport,
      name,
      command,
      args,
      url,
    })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="space-y-1">
          <p className="max-w-[500px] text-[12px] leading-5 text-text-tertiary">
            Configure a server manually by giving its command and arguments, or a remote URL.
          </p>
        </div>
        {sources.length > 0 && (
          <label className="flex shrink-0 items-center gap-2">
            <span className="text-[11px] font-medium text-text-secondary">Install for:</span>
            <Select
              value={selectedSource?.id ?? ''}
              disabled={busy}
              onChange={(e) => onSelectSource(e.target.value as McpConfigSourceId)}
              className="h-8 w-[200px] rounded-lg border-[var(--theme-border-overlay-strong)] bg-[var(--theme-surface-overlay-subtle)] py-1.5 pl-3 pr-8 text-[11px] hover:bg-[var(--theme-surface-overlay)]"
            >
              <option value="" disabled>
                Choose destination...
              </option>
              {installTargets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.label}
                </option>
              ))}
            </Select>
          </label>
        )}
      </div>

      <div className="space-y-3">
        <div className="grid gap-3 rounded-xl border border-[var(--theme-border-overlay-subtle)] bg-[var(--theme-surface-overlay-subtle)] p-4 md:grid-cols-[180px_minmax(0,1fr)]">
          <label className="space-y-1.5">
            <span className="text-[11px] font-medium text-text-primary">Connection Type</span>
            <Select
              value={transport}
              disabled={busy}
              onChange={(event) => setTransport(event.target.value as 'stdio' | 'http')}
              className="h-9 w-full border-transparent bg-[var(--theme-surface-overlay-subtle)] text-[11px] hover:bg-[var(--theme-surface-overlay)] focus:border-[var(--theme-border-overlay-strong)]"
            >
              <option value="stdio">Local Command</option>
              <option value="http">Remote URL</option>
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-medium text-text-primary">Server Name</span>
            <TextInput
              value={name}
              disabled={busy}
              placeholder="playwright"
              onChange={(event) => setName(event.target.value)}
              className="h-9 w-full border-transparent bg-[var(--theme-surface-overlay-subtle)] text-[11px] hover:bg-[var(--theme-surface-overlay)] focus:border-[var(--theme-border-overlay-strong)] placeholder:text-text-muted"
            />
          </label>
        </div>

        {transport === 'stdio' ? (
          <div className="grid gap-3 rounded-xl border border-[var(--theme-border-overlay-subtle)] bg-[var(--theme-surface-overlay-subtle)] p-4 md:grid-cols-[180px_minmax(0,1fr)]">
            <label className="space-y-1.5">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-text-primary">
                <TerminalSquare className="size-3.5 text-text-tertiary" />
                Command
              </span>
              <TextInput
                value={command}
                disabled={busy}
                placeholder="npx"
                onChange={(event) => setCommand(event.target.value)}
                className="h-9 w-full border-transparent bg-[var(--theme-surface-overlay-subtle)] text-[11px] hover:bg-[var(--theme-surface-overlay)] focus:border-[var(--theme-border-overlay-strong)] placeholder:text-text-muted"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-[11px] font-medium text-text-primary">Arguments</span>
              <TextInput
                value={args}
                disabled={busy}
                placeholder="-y @playwright/mcp@latest"
                onChange={(event) => setArgs(event.target.value)}
                className="h-9 w-full border-transparent bg-[var(--theme-surface-overlay-subtle)] text-[11px] hover:bg-[var(--theme-surface-overlay)] focus:border-[var(--theme-border-overlay-strong)] placeholder:text-text-muted"
              />
            </label>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--theme-border-overlay-subtle)] bg-[var(--theme-surface-overlay-subtle)] p-4">
            <label className="space-y-1.5">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-text-primary">
                <Globe className="size-3.5 text-text-tertiary" />
                Server URL
              </span>
              <TextInput
                value={url}
                disabled={busy}
                placeholder="http://localhost:3000/mcp"
                onChange={(event) => setUrl(event.target.value)}
                className="h-9 w-full border-transparent bg-[var(--theme-surface-overlay-subtle)] text-[11px] hover:bg-[var(--theme-surface-overlay)] focus:border-[var(--theme-border-overlay-strong)] placeholder:text-text-muted"
              />
            </label>
          </div>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between gap-4 border-t border-[var(--theme-border-overlay-subtle)] pt-4">
        <p className="min-w-0 text-[11px] text-text-muted">{availableTarget}</p>
        <Button
          variant={canInstall ? 'accent' : 'secondary'}
          disabled={!canInstall}
          onClick={() => void handleAdd()}
          leftIcon={<Plus className="size-4" />}
          className={
            canInstall
              ? 'px-6 bg-accent/10 text-accent hover:bg-accent/20 border border-accent/20 font-medium'
              : 'px-6'
          }
        >
          Add Server
        </Button>
      </div>
    </div>
  )
}

function choosePreferredSource(
  sources: readonly McpConfigSourceSummary[],
  preference: readonly McpConfigSourceId[],
) {
  for (const sourceId of preference) {
    const match = sources.find((source) => source.id === sourceId)
    if (match) return match
  }

  return sources[0] ?? null
}

export function McpSourcesPanel({
  sources,
  selectedSource,
  onSelectSource,
}: {
  readonly sources: readonly McpConfigSourceSummary[]
  readonly selectedSource: McpConfigSourceSummary | null
  readonly onSelectSource: (sourceId: McpConfigSourceId) => void
}) {
  return (
    <div className="rounded-2xl border border-[var(--theme-border-overlay-subtle)] bg-[linear-gradient(180deg,var(--theme-panel-gradient-start),var(--theme-panel-gradient-end))] p-5 shadow-[inset_0_1px_0_var(--theme-panel-shadow-highlight)]">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h3 className="text-[14px] font-semibold text-text-primary">Sources</h3>
          <p className="mt-1 text-[11px] text-text-tertiary">
            Choose where new MCP servers should be written and which config you want to edit.
          </p>
        </div>
        <span className="rounded-full border border-[var(--theme-border-overlay-subtle)] bg-[var(--theme-surface-overlay-subtle)] px-2.5 py-1 text-[10px] text-text-secondary">
          {sources.length} total
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {sources.map((source) => (
          <SourceButton
            key={source.id}
            source={source}
            selected={selectedSource?.id === source.id}
            onSelect={() => onSelectSource(source.id)}
          />
        ))}
      </div>
    </div>
  )
}

export function McpServersPanel({
  servers,
  sources,
  busy,
  onToggleServer,
  onRemoveServer,
}: {
  readonly servers: readonly McpServerSummary[]
  readonly sources: readonly McpConfigSourceSummary[]
  readonly busy: boolean
  readonly onToggleServer: (server: McpServerSummary) => void
  readonly onRemoveServer: (server: McpServerSummary) => void
}) {
  const editableSourceIds = useMemo(
    () => new Set(sources.filter((source) => source.editable).map((source) => source.id)),
    [sources],
  )

  return (
    <div className="flex flex-col bg-bg-primary">
      {servers.length > 0 ? (
        servers.map((server, index) => (
          <ServerRow
            key={`${server.sourceId}:${server.name}`}
            server={server}
            index={index}
            busy={busy}
            removable={editableSourceIds.has(server.sourceId)}
            onToggle={() => onToggleServer(server)}
            onRemove={() => onRemoveServer(server)}
          />
        ))
      ) : (
        <p className="px-4 py-6 text-[12px] text-text-muted text-center">
          No MCP servers configured.
        </p>
      )}
    </div>
  )
}
