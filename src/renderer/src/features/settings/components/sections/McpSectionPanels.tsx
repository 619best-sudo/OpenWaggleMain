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

function formatDirectTools(mode: McpServerSummary['directTools']) {
  if (mode === 'enabled') return 'Direct tools'
  if (mode === 'partial') return 'Selected direct tools'
  if (mode === 'disabled') return 'Proxy only'
  return 'Inherits direct-tools setting'
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
          ? 'border-accent/30 bg-accent/[0.06] text-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
          : 'border-white/6 bg-white/[0.02] text-text-secondary hover:border-white/10 hover:bg-white/[0.03]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium">{source.label}</div>
          <div className="mt-1 truncate text-[11px] text-text-muted">{source.path}</div>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium',
            source.parseError
              ? 'border-error/20 bg-error/10 text-error'
              : source.exists
                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                : 'border-white/8 bg-white/[0.04] text-text-muted',
          )}
        >
          {statusLabel}
        </span>
      </div>
      {source.parseError ? (
        <div className="mt-2 line-clamp-2 text-[11px] text-error">{source.parseError}</div>
      ) : (
        <div className="mt-3 flex gap-2 text-[11px] text-text-tertiary">
          <span className="rounded-full bg-white/[0.04] px-2 py-0.5">
            {source.serverCount} active
          </span>
          <span className="rounded-full bg-white/[0.04] px-2 py-0.5">
            {source.disabledServerCount} disabled
          </span>
        </div>
      )}
    </Button>
  )
}

function ServerRow({
  server,
  busy,
  onToggle,
}: {
  readonly server: McpServerSummary
  readonly busy: boolean
  readonly onToggle: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/6 px-4 py-3.5 last:border-b-0 hover:bg-white/[0.02] transition-colors">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-text-primary">{server.name}</span>
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[10px] font-medium',
              server.enabled
                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                : 'border-white/8 bg-white/[0.04] text-text-muted',
            )}
          >
            {server.enabled ? 'Enabled' : 'Disabled'}
          </span>
          <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-text-tertiary">
            {formatDirectTools(server.directTools)}
          </span>
        </div>
        <div className="mt-1 truncate text-[12px] text-text-tertiary">
          {formatServerDetail(server)}
        </div>
        <div className="mt-1 truncate text-[11px] text-text-muted">
          Source: {server.sourceLabel}
        </div>
      </div>
      <ToggleSwitch
        checked={server.enabled}
        disabled={busy}
        label={`${server.enabled ? 'Disable' : 'Enable'} ${server.name}`}
        onCheckedChange={onToggle}
      />
    </div>
  )
}

export function McpSectionHeading() {
  return (
    <div className="space-y-1">
      <h2 className="text-[20px] font-semibold text-text-primary">MCP</h2>
      <p className="max-w-[760px] text-[13px] leading-5 text-text-tertiary">
        Connect external tools, APIs, and file systems to your assistant using the Model Context
        Protocol.
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
    <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-300">
      <CheckCircle2 className="size-3" />
      Enabled
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded bg-bg-tertiary px-1.5 py-0.5 text-[11px] text-text-muted">
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
    <div className="rounded-2xl border border-white/6 bg-[linear-gradient(180deg,#111418,#0d1014)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <Network className="size-4 text-accent" />
            <h3 className="text-[16px] font-semibold text-text-primary">MCP Connection</h3>
            <McpAdapterStatus enabled={adapterEnabled} />
          </div>
          <p className="text-[12px] text-text-tertiary">
            Manages the bridge between your assistant and configured MCP servers.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button disabled={busy} onClick={onRefresh} leftIcon={<RotateCw className="size-3" />}>
            Refresh
          </Button>
          <div className="flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5">
            <span className="text-[12px] font-medium text-text-secondary">
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

const MCP_STARTER_PRESETS = [
  {
    id: 'playwright',
    label: 'Playwright',
    transport: 'stdio' as const,
    name: 'playwright',
    command: 'npx',
    args: '-y @playwright/mcp@latest',
    url: '',
  },
  {
    id: 'filesystem',
    label: 'Filesystem',
    transport: 'stdio' as const,
    name: 'filesystem',
    command: 'npx',
    args: '-y @modelcontextprotocol/server-filesystem .',
    url: '',
  },
  {
    id: 'http',
    label: 'HTTP Server',
    transport: 'http' as const,
    name: 'my-http-server',
    command: '',
    args: '',
    url: 'http://localhost:3000/mcp',
  },
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

  const availableTarget = useMemo(() => {
    if (!selectedSource) return 'Pick a project or global MCP source to install into.'
    if (!selectedSource.editable)
      return 'This source is read-only. Pick another source to add a server.'
    return `New servers will be written to ${selectedSource.path}.`
  }, [selectedSource])

  async function handleAdd() {
    await onAddServer({
      transport,
      name,
      command,
      args,
      url,
    })
  }

  function applyPreset(preset: (typeof MCP_STARTER_PRESETS)[number]) {
    setTransport(preset.transport)
    setName(preset.name)
    setCommand(preset.command)
    setArgs(preset.args)
    setUrl(preset.url ?? '')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="space-y-1">
          <p className="max-w-[500px] text-[13px] leading-5 text-text-tertiary">
            Choose a preset or configure a custom connection. New servers are saved into your active
            configuration.
          </p>
        </div>
        {sources.length > 0 && (
          <label className="flex shrink-0 items-center gap-2">
            <span className="text-[12px] font-medium text-text-secondary">Save to:</span>
            <Select
              value={selectedSource?.id ?? ''}
              disabled={busy}
              onChange={(e) => onSelectSource(e.target.value as McpConfigSourceId)}
              className="w-[200px] text-[12px] py-1.5 pl-3 pr-8 h-8 rounded-lg border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"
            >
              <option value="" disabled>
                Select source...
              </option>
              {sources
                .filter((s) => s.editable)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
            </Select>
          </label>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {MCP_STARTER_PRESETS.map((preset) => (
          <Button
            key={preset.id}
            variant="unstyled"
            size="sm"
            disabled={busy}
            onClick={() => applyPreset(preset)}
            className="rounded-full bg-white/[0.02] px-4 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-white/[0.04] hover:text-text-primary transition-colors"
          >
            {preset.label}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        <div className="grid gap-3 rounded-xl border border-white/6 bg-black/20 p-4 md:grid-cols-[180px_minmax(0,1fr)]">
          <label className="space-y-1.5">
            <span className="text-[12px] font-medium text-text-primary">Connection Type</span>
            <Select
              value={transport}
              disabled={busy}
              onChange={(event) => setTransport(event.target.value as 'stdio' | 'http')}
              className="w-full text-[12px] h-9 bg-white/[0.02] border-transparent hover:bg-white/[0.04] focus:border-white/10"
            >
              <option value="stdio">Local Command</option>
              <option value="http">Remote URL</option>
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="text-[12px] font-medium text-text-primary">Server Name</span>
            <TextInput
              value={name}
              disabled={busy}
              placeholder="my-server"
              onChange={(event) => setName(event.target.value)}
              className="w-full text-[12px] h-9 bg-white/[0.02] border-transparent hover:bg-white/[0.04] focus:border-white/10 placeholder:text-text-muted"
            />
          </label>
        </div>

        {transport === 'stdio' ? (
          <div className="grid gap-3 rounded-xl border border-white/6 bg-black/20 p-4 md:grid-cols-[180px_minmax(0,1fr)]">
            <label className="space-y-1.5">
              <span className="flex items-center gap-1.5 text-[12px] font-medium text-text-primary">
                <TerminalSquare className="size-3.5 text-text-tertiary" />
                Command
              </span>
              <TextInput
                value={command}
                disabled={busy}
                placeholder="npx"
                onChange={(event) => setCommand(event.target.value)}
                className="w-full text-[12px] h-9 bg-white/[0.02] border-transparent hover:bg-white/[0.04] focus:border-white/10 placeholder:text-text-muted"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-[12px] font-medium text-text-primary">Arguments</span>
              <TextInput
                value={args}
                disabled={busy}
                placeholder="-y @modelcontextprotocol/server-example"
                onChange={(event) => setArgs(event.target.value)}
                className="w-full text-[12px] h-9 bg-white/[0.02] border-transparent hover:bg-white/[0.04] focus:border-white/10 placeholder:text-text-muted"
              />
            </label>
          </div>
        ) : (
          <div className="rounded-xl border border-white/6 bg-black/20 p-4">
            <label className="space-y-1.5">
              <span className="flex items-center gap-1.5 text-[12px] font-medium text-text-primary">
                <Globe className="size-3.5 text-text-tertiary" />
                Server URL
              </span>
              <TextInput
                value={url}
                disabled={busy}
                placeholder="http://localhost:3000/mcp"
                onChange={(event) => setUrl(event.target.value)}
                className="w-full text-[12px] h-9 bg-white/[0.02] border-transparent hover:bg-white/[0.04] focus:border-white/10 placeholder:text-text-muted"
              />
            </label>
          </div>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between gap-4 pt-4 border-t border-white/6">
        <p className="min-w-0 text-[12px] text-text-muted">{availableTarget}</p>
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
    <div className="rounded-2xl border border-white/6 bg-[linear-gradient(180deg,#111418,#0d1014)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h3 className="text-[16px] font-semibold text-text-primary">Sources</h3>
          <p className="mt-1 text-[12px] text-text-tertiary">
            Choose where new MCP servers should be written and which config you want to edit.
          </p>
        </div>
        <span className="rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[11px] text-text-secondary">
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
  busy,
  onToggleServer,
}: {
  readonly servers: readonly McpServerSummary[]
  readonly busy: boolean
  readonly onToggleServer: (server: McpServerSummary) => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[16px] font-semibold text-text-primary">Connected Servers</h3>
        <span className="rounded-full border border-white/6 bg-white/[0.02] px-2 py-0.5 text-[10px] text-text-muted">
          {servers.length} total
        </span>
      </div>
      <div className="overflow-hidden rounded-xl border border-white/6 bg-black/20">
        {servers.length > 0 ? (
          servers.map((server) => (
            <ServerRow
              key={`${server.sourceId}:${server.name}`}
              server={server}
              busy={busy}
              onToggle={() => onToggleServer(server)}
            />
          ))
        ) : (
          <p className="px-4 py-6 text-[13px] text-text-muted">No MCP servers configured.</p>
        )}
      </div>
    </div>
  )
}
