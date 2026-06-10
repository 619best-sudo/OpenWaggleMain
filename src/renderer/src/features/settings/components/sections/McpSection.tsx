import { Code2, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { useMcpSectionController } from '@/features/settings/hooks/useMcpSectionController'
import { usePreferences } from '@/features/settings/hooks/useSettings'
import { Button } from '@/shared/ui/Button'
import {
  McpAdapterCard,
  McpErrorAlert,
  McpQuickInstallPanel,
  McpSectionHeading,
  McpServersPanel,
} from './McpSectionPanels'
import { McpSourceEditor } from './McpSourceEditor'

export function McpSection({ showHeading = true }: { readonly showHeading?: boolean }) {
  const { settings } = usePreferences()
  const controller = useMcpSectionController(settings.projectPath)
  const sources = controller.view?.sources ?? []
  const servers = controller.view?.servers ?? []

  const [showAddModal, setShowAddModal] = useState(false)
  const [showAdvancedModal, setShowAdvancedModal] = useState(false)

  return (
    <div className="space-y-6 relative">
      <div className="flex items-center justify-between">
        {showHeading ? <McpSectionHeading /> : <div />}
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => setShowAdvancedModal(true)}
            leftIcon={<Code2 className="size-3.5" />}
          >
            Advanced
          </Button>
          <Button
            variant="accent"
            onClick={() => setShowAddModal(true)}
            leftIcon={<Plus className="size-3.5" />}
          >
            Add Server
          </Button>
        </div>
      </div>

      <McpErrorAlert message={controller.error} />
      <McpErrorAlert message={controller.view?.adapter.lastError} />

      <McpAdapterCard
        view={controller.view}
        busy={controller.busy}
        onRefresh={() => void controller.refresh()}
        onToggle={() => void controller.toggleAdapter()}
      />

      <McpServersPanel
        servers={servers}
        busy={controller.busy}
        onToggleServer={(server) => void controller.toggleServer(server)}
      />

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
          <div className="w-full max-w-[600px] overflow-hidden rounded-2xl border border-white/10 bg-[#111418] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/6 px-5 py-4">
              <h2 className="text-[16px] font-semibold text-text-primary">Add Server</h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-full p-1.5 text-text-muted hover:bg-white/10 hover:text-text-primary"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="max-h-[80vh] overflow-y-auto p-5">
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
            </div>
          </div>
        </div>
      )}

      {showAdvancedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
          <div className="w-full max-w-[700px] overflow-hidden rounded-2xl border border-white/10 bg-[#111418] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/6 px-5 py-4">
              <h2 className="text-[16px] font-semibold text-text-primary">
                Advanced Configuration
              </h2>
              <button
                type="button"
                onClick={() => setShowAdvancedModal(false)}
                className="rounded-full p-1.5 text-text-muted hover:bg-white/10 hover:text-text-primary"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="max-h-[80vh] overflow-y-auto p-5">
              <McpSourceEditor
                sources={sources}
                selectedSource={controller.selectedSource}
                rawJson={controller.rawJson}
                busy={controller.busy}
                onSelectSource={controller.selectSource}
                onSave={() => void controller.saveSelectedSource()}
                onRawJsonChange={controller.updateRawJson}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
