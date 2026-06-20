import { Code2, Plus, X } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useMcpSectionController } from '@/features/settings/hooks/useMcpSectionController'
import { usePreferences } from '@/features/settings/hooks/useSettings'
import { useEscapeHotkey } from '@/shared/hooks/useEscapeHotkey'
import { Button } from '@/shared/ui/Button'
import {
  McpAdapterCard,
  McpErrorAlert,
  McpQuickInstallPanel,
  McpSectionHeading,
  McpServersPanel,
} from './McpSectionPanels'
import { McpSourceEditor } from './McpSourceEditor'

interface McpDialogShellProps {
  readonly title: string
  readonly description: string
  readonly maxWidthClassName: string
  readonly icon: ReactNode
  readonly onClose: () => void
  readonly children: ReactNode
}

function McpDialogShell({
  title,
  description,
  maxWidthClassName,
  icon,
  onClose,
  children,
}: McpDialogShellProps) {
  useEscapeHotkey(onClose)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" onClick={onClose} />
      <div
        className={`relative flex max-h-full w-full flex-col overflow-hidden rounded-2xl border border-border-light bg-bg shadow-2xl ${maxWidthClassName}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border bg-bg-secondary/50 px-5 py-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <div className="flex size-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
                {icon}
              </div>
              <h2 className="text-[15px] font-semibold text-text-primary">{title}</h2>
            </div>
            <p className="max-w-[560px] text-[13px] leading-5 text-text-tertiary">
              {description}
            </p>
          </div>
          <Button
            variant="unstyled"
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary"
            title="Close"
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-bg p-5">{children}</div>
      </div>
    </div>
  )
}

export function McpSection({ showHeading = true }: { readonly showHeading?: boolean }) {
  const { settings } = usePreferences()
  const controller = useMcpSectionController(settings.projectPath)
  const sources = controller.view?.sources ?? []
  const servers = controller.view?.servers ?? []

  const [showAddModal, setShowAddModal] = useState(false)
  const [showAdvancedModal, setShowAdvancedModal] = useState(false)

  return (
    <div className="space-y-6 relative">
      {showHeading && (
        <div className="mb-2">
          <McpSectionHeading />
        </div>
      )}

      <McpErrorAlert message={controller.error} />
      <McpErrorAlert message={controller.view?.adapter.lastError} />

      <McpAdapterCard
        view={controller.view}
        busy={controller.busy}
        onRefresh={() => void controller.refresh()}
        onToggle={() => void controller.toggleAdapter()}
      />

      <div className="overflow-hidden rounded-xl border border-border bg-bg-secondary shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <div className="flex items-center justify-between border-b border-border bg-bg-secondary px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-medium text-text-primary">Connected Servers</h3>
            <span className="rounded-full border border-border/60 bg-bg-tertiary px-2 py-0.5 text-[10px] text-text-muted">
              {servers.length} total
            </span>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowAdvancedModal(true)}
              leftIcon={<Code2 className="size-3.5" />}
              className="h-7 text-[11px] px-2.5"
            >
              Advanced
            </Button>
            <Button
              variant="accent"
              size="sm"
              onClick={() => setShowAddModal(true)}
              leftIcon={<Plus className="size-3.5" />}
              className="h-7 text-[11px] px-2.5"
            >
              Add Server
            </Button>
          </div>
        </div>

        <McpServersPanel
          servers={servers}
          busy={controller.busy}
          onToggleServer={(server) => void controller.toggleServer(server)}
        />
      </div>

      {showAddModal && (
        <McpDialogShell
          title="Add Server"
          description="Quickly append a new MCP server to one of your editable global or project config sources."
          maxWidthClassName="max-w-[600px]"
          icon={<Plus className="size-4" />}
          onClose={() => setShowAddModal(false)}
        >
          <McpQuickInstallPanel
            sources={sources}
            selectedSource={controller.selectedSource}
            busy={controller.busy}
            onSelectSource={controller.selectSource}
            onAddServer={async (input) => {
              await controller.addServer(input)
              setShowAddModal(false)
            }}
          />
        </McpDialogShell>
      )}

      {showAdvancedModal && (
        <McpDialogShell
          title="Advanced Configuration"
          description="Inspect and edit the preserved JSON for each MCP source without leaving the settings flow."
          maxWidthClassName="max-w-[760px]"
          icon={<Code2 className="size-4" />}
          onClose={() => setShowAdvancedModal(false)}
        >
          <McpSourceEditor
            sources={sources}
            selectedSource={controller.selectedSource}
            rawJson={controller.rawJson}
            busy={controller.busy}
            onSelectSource={controller.selectSource}
            onSave={() => void controller.saveSelectedSource()}
            onRawJsonChange={controller.updateRawJson}
          />
        </McpDialogShell>
      )}
    </div>
  )
}
