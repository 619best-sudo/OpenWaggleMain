import { Check, Plug, PlugZap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useProject } from '@/features/sessions/hooks'
import { useComposerStore } from '../state/composer-store'
import { api } from '@/shared/lib/ipc'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { Popover } from '@/shared/ui/Popover'

/**
 * The composer's MCP picker: which ENABLED external MCP servers the user
 * offers to THIS run.
 *
 * Why selection exists at all: before it, merely enabling a server in settings
 * put its tools into every QA hop of every project — a Flutter/iOS run opened
 * with ~62 tools, two-thirds of them browser tools it could not use, and the
 * model reasoned "my connected automation is browser-based" instead of using
 * the device toolkit. Connection is not selection: selected servers join every
 * categorizer, unselected ones stay connected in the pool but out of the chain.
 *
 * The list is the project's enabled stdio servers (what the run can actually
 * attach); toggling anything else is a settings-page concern, not a composer
 * one. Selection is sticky across sends — a mode, not an attachment.
 */
export function ComposerMcpPicker() {
  const { projectPath } = useProject()
  const selected = useComposerStore((s) => s.mcpServers)
  const toggleMcpServer = useComposerStore((s) => s.toggleMcpServer)
  const [open, setOpen] = useState(false)
  const [servers, setServers] = useState<Array<{ name: string; sourceLabel?: string }> | null>(null)

  useEffect(() => {
    if (!open || servers || !projectPath) return
    let cancelled = false
    api
      .getMcpSettings(projectPath)
      .then((view) => {
        if (cancelled) return
        // The same filter the run preflight applies: enabled stdio servers with
        // a command are what can attach. Everything else would be a toggle that
        // does nothing.
        setServers(
          view.servers
            .filter((s) => s.enabled && s.transport === 'stdio' && Boolean(s.command))
            .map((s) => ({ name: s.name, sourceLabel: s.sourceLabel })),
        )
      })
      .catch(() => {
        if (!cancelled) setServers([])
      })
    return () => {
      cancelled = true
    }
  }, [open, servers, projectPath])

  const label = useMemo(() => {
    if (!selected.length) return 'MCPs'
    return selected.length === 1 ? `MCP: ${selected[0]}` : `MCPs: ${selected.length}`
  }, [selected])

  const triggerLabel = `MCP servers offered to this run: ${selected.length ? selected.join(', ') : 'none'}`

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="top-start"
      className="w-[280px] p-1.5"
      trigger={
        <Button
          variant="unstyled"
          type="button"
          onClick={() => setOpen((current) => !current)}
          className={cn(
            'home-panel-frame-soft flex h-6 shrink items-center gap-1 rounded-[5px] px-2 text-[12px] transition-colors hover:bg-bg-hover',
            selected.length ? 'text-text-primary' : 'text-text-secondary',
          )}
          title={triggerLabel}
          aria-label={triggerLabel}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          {selected.length ? (
            <PlugZap className="size-[13px] shrink-0 text-text-tertiary" />
          ) : (
            <Plug className="size-[13px] shrink-0 text-text-tertiary" />
          )}
          <span className="whitespace-nowrap">{label}</span>
          <span className="shrink-0 text-[9px] text-text-tertiary">&#x2228;</span>
        </Button>
      }
    >
      <div className="rounded-md">
        <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-text-muted">
          MCPs for this run
        </div>
        <div className="space-y-1">
          {servers === null ? (
            <div className="px-2.5 py-2 text-[11px] text-text-muted">Loading servers…</div>
          ) : servers.length === 0 ? (
            <div className="px-2.5 py-2 text-[11px] text-text-muted">
              No enabled stdio MCP servers for this project. Enable one in Settings → MCPs.
            </div>
          ) : (
            servers.map((server) => {
              const active = selected.includes(server.name)
              return (
                <Button
                  key={server.name}
                  variant="unstyled"
                  type="button"
                  onClick={() => toggleMcpServer(server.name)}
                  className={cn(
                    'flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors',
                    active ? 'bg-bg-hover text-text-primary' : 'text-text-secondary hover:bg-bg-hover',
                  )}
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[12px] font-medium">{server.name}</span>
                    {server.sourceLabel ? (
                      <span className="truncate text-[11px] text-text-muted">{server.sourceLabel}</span>
                    ) : null}
                  </div>
                  {active ? <Check className="mt-0.5 size-3.5 shrink-0 text-accent" /> : null}
                </Button>
              )
            })
          )}
        </div>
        <div className="border-t border-border px-2.5 py-1.5 text-[10px] leading-snug text-text-muted">
          Selected servers join every phase of this run. Unselected ones stay connected but out of the
          agent&rsquo;s tools.
        </div>
      </div>
    </Popover>
  )
}
