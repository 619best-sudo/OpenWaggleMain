import { McpSection } from '@/features/settings/components/sections/McpSection'
import { WorkspacePanelSurface } from './-workspace-panel-surface'

export function McpRouteSurface() {
  return (
    <WorkspacePanelSurface
      name="MCP"
      title="MCP"
      description="MCP support is powered by a Pi extension package. OpenWaggle manages the effective config hierarchy and Pi picks up changes on the next turn."
      contentClassName="px-8 py-6"
    >
      <McpSection showHeading={false} />
    </WorkspacePanelSurface>
  )
}
