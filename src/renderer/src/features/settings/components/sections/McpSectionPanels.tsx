import type {
  McpConfigSourceId,
  McpConfigSourceSummary,
  McpServerSummary,
  McpSettingsView,
} from '@shared/types/mcp'
import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
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
          <div className="text-[13px] font-medium">{source.label}</div>
          <div className="mt-1 truncate text-[11px] text-text-muted">{source.path}</div>
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
        <div className="mt-2 line-clamp-2 text-[11px] text-error">{source.parseError}</div>
      ) : (
        <div className="mt-3 flex gap-2 text-[11px] text-text-tertiary">
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
  onToggle,
}: {
  readonly server: McpServerSummary
  readonly index: number
  readonly busy: boolean
  readonly onToggle: () => void
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
        <span className="text-[13px] font-medium text-text-primary min-w-[140px] truncate">
          {server.name}
        </span>
        <span className="truncate text-[11px] text-text-tertiary">
          {formatServerDetail(server)}
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span
          className={cn(
            'text-[11px] font-medium',
            server.enabled ? 'text-success' : 'text-text-muted',
          )}
        >
          {server.enabled ? 'Enabled' : 'Disabled'}
        </span>
        <ToggleSwitch
          checked={server.enabled}
          disabled={busy}
          label={`${server.enabled ? 'Disable' : 'Enable'} ${server.name}`}
          onCheckedChange={onToggle}
        />
      </div>
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
    <span className="inline-flex items-center gap-1 rounded bg-success/10 px-1.5 py-0.5 text-[11px] text-success">
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
    <div className="overflow-hidden rounded-xl border border-border bg-bg-secondary p-4 shadow-[inset_0_1px_0_var(--theme-panel-shadow-highlight)]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Network className="size-4 text-accent" />
          <h3 className="text-[13px] font-medium text-text-primary">MCP Connection</h3>
          <McpAdapterStatus enabled={adapterEnabled} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" size="sm" disabled={busy} onClick={onRefresh} leftIcon={<RotateCw className="size-3" />} className="h-7 text-[11px] px-2.5">
            Refresh
          </Button>
          <div className="flex items-center gap-2 rounded-full border border-border bg-bg-tertiary px-2.5 py-1">
            <span className="text-[11px] font-medium text-text-secondary">
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

type McpInstallMethod = 'manual' | 'github'
type McpInstallTarget = {
  readonly id: McpConfigSourceId
  readonly label: string
  readonly helper: string
}

const PROJECT_SOURCE_PREFERENCE: readonly McpConfigSourceId[] = [
  'project-openwaggle',
  'project-standard',
  'project-agents',
  'project-pi',
] as const

const GLOBAL_SOURCE_PREFERENCE: readonly McpConfigSourceId[] = ['global-standard', 'global-pi'] as const

export function McpQuickInstallPanel({
  sources = [],
  selectedSource,
  busy,
  onSelectSource,
  onAddServer,
}: McpQuickInstallPanelProps) {
  const [installMethod, setInstallMethod] = useState<McpInstallMethod>('manual')
  const [transport, setTransport] = useState<'stdio' | 'http'>('stdio')
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [url, setUrl] = useState('')
  const [githubUrl, setGitHubUrl] = useState('')

  const githubInstall = useMemo(() => {
    if (githubUrl.trim().length === 0) {
      return null
    }

    try {
      return buildGitHubInstallInput(githubUrl)
    } catch {
      return null
    }
  }, [githubUrl])

  const githubValidationMessage = useMemo(() => {
    if (githubUrl.trim().length === 0) {
      return 'Paste a GitHub repository URL to generate a ready-to-run MCP command.'
    }

    try {
      buildGitHubInstallInput(githubUrl)
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Enter a valid GitHub repository URL.'
    }
  }, [githubUrl])

  const canInstall =
    !busy &&
    !!selectedSource?.editable &&
    (installMethod === 'github'
      ? githubInstall !== null
      : name.trim().length > 0 &&
        (transport === 'http' ? url.trim().length > 0 : command.trim().length > 0))

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
      selectedSource?.editable && selectedSource.scope === 'global' ? selectedSource : preferredGlobalSource

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
        helper: 'Makes this MCP available everywhere in OpenWaggle on this device.',
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
    if (installMethod === 'github') {
      if (!githubInstall) return
      await onAddServer(githubInstall)
      return
    }

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
          <p className="max-w-[500px] text-[13px] leading-5 text-text-tertiary">
            Technical users can configure a server manually. Everyone else can paste a GitHub
            repository URL and let OpenWaggle prepare the command for them.
          </p>
        </div>
        {sources.length > 0 && (
          <label className="flex shrink-0 items-center gap-2">
            <span className="text-[12px] font-medium text-text-secondary">Install for:</span>
            <Select
              value={selectedSource?.id ?? ''}
              disabled={busy}
              onChange={(e) => onSelectSource(e.target.value as McpConfigSourceId)}
              className="h-8 w-[200px] rounded-lg border-[var(--theme-border-overlay-strong)] bg-[var(--theme-surface-overlay-subtle)] py-1.5 pl-3 pr-8 text-[12px] hover:bg-[var(--theme-surface-overlay)]"
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

      <div className="mb-6 space-y-3">
        <div
          className="grid w-full grid-cols-2 rounded-xl border border-[var(--theme-border-overlay-subtle)] bg-[var(--theme-surface-overlay-subtle)] p-1"
          aria-label="MCP install method"
        >
          <Button
            variant="unstyled"
            disabled={busy}
            aria-pressed={installMethod === 'manual'}
            onClick={() => setInstallMethod('manual')}
            fullWidth
            className={cn(
              'rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors',
              installMethod === 'manual'
                ? 'bg-[var(--theme-surface-overlay)] text-text-primary shadow-sm'
                : 'text-text-tertiary hover:bg-[var(--theme-surface-overlay)] hover:text-text-secondary',
            )}
          >
            Manual Setup
          </Button>
          <Button
            variant="unstyled"
            disabled={busy}
            aria-pressed={installMethod === 'github'}
            onClick={() => setInstallMethod('github')}
            fullWidth
            className={cn(
              'rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors',
              installMethod === 'github'
                ? 'bg-[var(--theme-surface-overlay)] text-text-primary shadow-sm'
                : 'text-text-tertiary hover:bg-[var(--theme-surface-overlay)] hover:text-text-secondary',
            )}
          >
            GitHub URL
          </Button>
        </div>
      </div>

      {installMethod === 'manual' ? (
        <div className="space-y-3">
          <div className="grid gap-3 rounded-xl border border-[var(--theme-border-overlay-subtle)] bg-[var(--theme-surface-overlay-subtle)] p-4 md:grid-cols-[180px_minmax(0,1fr)]">
            <label className="space-y-1.5">
              <span className="text-[12px] font-medium text-text-primary">Connection Type</span>
              <Select
                value={transport}
                disabled={busy}
                onChange={(event) => setTransport(event.target.value as 'stdio' | 'http')}
                className="h-9 w-full border-transparent bg-[var(--theme-surface-overlay-subtle)] text-[12px] hover:bg-[var(--theme-surface-overlay)] focus:border-[var(--theme-border-overlay-strong)]"
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
                placeholder="playwright"
                onChange={(event) => setName(event.target.value)}
                className="h-9 w-full border-transparent bg-[var(--theme-surface-overlay-subtle)] text-[12px] hover:bg-[var(--theme-surface-overlay)] focus:border-[var(--theme-border-overlay-strong)] placeholder:text-text-muted"
              />
            </label>
          </div>

          {transport === 'stdio' ? (
            <div className="grid gap-3 rounded-xl border border-[var(--theme-border-overlay-subtle)] bg-[var(--theme-surface-overlay-subtle)] p-4 md:grid-cols-[180px_minmax(0,1fr)]">
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
                  className="h-9 w-full border-transparent bg-[var(--theme-surface-overlay-subtle)] text-[12px] hover:bg-[var(--theme-surface-overlay)] focus:border-[var(--theme-border-overlay-strong)] placeholder:text-text-muted"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-[12px] font-medium text-text-primary">Arguments</span>
                <TextInput
                  value={args}
                  disabled={busy}
                  placeholder="-y @playwright/mcp@latest"
                  onChange={(event) => setArgs(event.target.value)}
                  className="h-9 w-full border-transparent bg-[var(--theme-surface-overlay-subtle)] text-[12px] hover:bg-[var(--theme-surface-overlay)] focus:border-[var(--theme-border-overlay-strong)] placeholder:text-text-muted"
                />
              </label>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--theme-border-overlay-subtle)] bg-[var(--theme-surface-overlay-subtle)] p-4">
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
                  className="h-9 w-full border-transparent bg-[var(--theme-surface-overlay-subtle)] text-[12px] hover:bg-[var(--theme-surface-overlay)] focus:border-[var(--theme-border-overlay-strong)] placeholder:text-text-muted"
                />
              </label>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-[var(--theme-border-overlay-subtle)] bg-[var(--theme-surface-overlay-subtle)] p-4">
            <label className="space-y-1.5">
              <span className="flex items-center gap-1.5 text-[12px] font-medium text-text-primary">
                <GitBranch className="size-3.5 text-text-tertiary" />
                GitHub Repository URL
              </span>
              <TextInput
                value={githubUrl}
                disabled={busy}
                placeholder="https://github.com/owner/repo"
                onChange={(event) => setGitHubUrl(event.target.value)}
                className="h-9 w-full border-transparent bg-[var(--theme-surface-overlay-subtle)] text-[12px] hover:bg-[var(--theme-surface-overlay)] focus:border-[var(--theme-border-overlay-strong)] placeholder:text-text-muted"
              />
            </label>
            <p
              className={cn(
                'mt-2 text-[11px] leading-5',
                githubValidationMessage ? 'text-text-tertiary' : 'text-text-muted',
              )}
            >
              {githubValidationMessage ??
                'OpenWaggle will save a generated npx command so the MCP is ready to run from this repository.'}
            </p>
          </div>

          <div className="grid gap-3 rounded-xl border border-[var(--theme-border-overlay-subtle)] bg-[var(--theme-surface-overlay-subtle)] p-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <span className="text-[12px] font-medium text-text-primary">Server Name</span>
              <div className="flex min-h-10 items-center rounded-lg border border-transparent bg-[var(--theme-surface-overlay)] px-3 py-2 text-[12px] text-text-secondary">
                {githubInstall?.name ?? 'Derived from the repository name'}
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="text-[12px] font-medium text-text-primary">Generated Command</span>
              <div className="flex min-h-10 items-center rounded-lg border border-transparent bg-[var(--theme-surface-overlay)] px-3 py-2 font-mono text-[11px] text-text-secondary">
                {githubInstall
                  ? `${githubInstall.command} ${githubInstall.args ?? ''}`.trim()
                  : 'npx -y github:owner/repo'}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 flex items-center justify-between gap-4 border-t border-[var(--theme-border-overlay-subtle)] pt-4">
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
          {installMethod === 'github' ? 'Add From GitHub' : 'Add Server'}
        </Button>
      </div>
    </div>
  )
}

function buildGitHubInstallInput(sourceUrl: string): {
  transport: 'stdio'
  name: string
  command: string
  args: string
} {
  const url = parseGitHubUrl(sourceUrl)
  const packageSpec = url.ref
    ? `github:${url.owner}/${url.repo}#${url.ref}`
    : `github:${url.owner}/${url.repo}`

  return {
    transport: 'stdio',
    name: normalizeGitHubRepoName(url.repo),
    command: 'npx',
    args: `-y ${packageSpec}`,
  }
}

function parseGitHubUrl(sourceUrl: string) {
  let url: URL
  try {
    url = new URL(sourceUrl.trim())
  } catch {
    throw new Error('Enter a valid GitHub repository URL.')
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    !['github.com', 'www.github.com'].includes(url.hostname)
  ) {
    throw new Error('Enter a valid GitHub repository URL.')
  }

  const segments = url.pathname
    .replace(/\.git$/, '')
    .split('/')
    .filter(Boolean)
  const [owner, repo, mode, ref] = segments

  if (!owner || !repo) {
    throw new Error('GitHub URLs must include both an owner and repository name.')
  }

  return {
    owner,
    repo,
    ref: mode === 'tree' || mode === 'blob' ? ref : undefined,
  }
}

function normalizeGitHubRepoName(repo: string) {
  const normalized = repo
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (!normalized) {
    throw new Error('Could not derive an MCP server name from that repository URL.')
  }

  return normalized
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
          <h3 className="text-[16px] font-semibold text-text-primary">Sources</h3>
          <p className="mt-1 text-[12px] text-text-tertiary">
            Choose where new MCP servers should be written and which config you want to edit.
          </p>
        </div>
        <span className="rounded-full border border-[var(--theme-border-overlay-subtle)] bg-[var(--theme-surface-overlay-subtle)] px-2.5 py-1 text-[11px] text-text-secondary">
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
    <div className="flex flex-col bg-bg-primary">
      {servers.length > 0 ? (
        servers.map((server, index) => (
          <ServerRow
            key={`${server.sourceId}:${server.name}`}
            server={server}
            index={index}
            busy={busy}
            onToggle={() => onToggleServer(server)}
          />
        ))
      ) : (
        <p className="px-4 py-6 text-[13px] text-text-muted text-center">No MCP servers configured.</p>
      )}
    </div>
  )
}
