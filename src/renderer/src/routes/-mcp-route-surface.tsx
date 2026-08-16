import { McpSection } from '@/features/settings/components/sections/McpSection'
import { WorkspacePanelSurface } from './-workspace-panel-surface'

export function McpRouteSurface() {
  return (
    <WorkspacePanelSurface
      name="MCP"
      title="MCP"
      description="Connect external tools and services to Turing Machine using the Model Context Protocol."
      contentClassName="px-8 py-6"
      framed={false}
    >
      <McpSection showHeading={false} />
    </WorkspacePanelSurface>
  )
}
