import { TeammatesPanel } from '@/features/teammates/components/TeammatesPanel'
import { WorkspacePanelSurface } from './-workspace-panel-surface'

export function TeammatesRouteSurface() {
  return (
    <WorkspacePanelSurface
      name="Team(New)"
      title=""
      description=""
      contentClassName="px-8 py-8"
      framed={false}
    >
      <TeammatesPanel />
    </WorkspacePanelSurface>
  )
}
