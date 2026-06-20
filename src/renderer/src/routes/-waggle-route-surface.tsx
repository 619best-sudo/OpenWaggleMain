import { WaggleSection } from '@/features/settings/components/sections/WaggleSection'
import { WorkspacePanelSurface } from './-workspace-panel-surface'

export function WaggleRouteSurface() {
  return (
    <WorkspacePanelSurface
      name="Waggle"
      title=""
      description=""
      contentClassName="px-8 py-8"
      framed={false}
    >
      <WaggleSection showHeading={false} />
    </WorkspacePanelSurface>
  )
}
