import { WaggleSection } from '@/features/settings/components/sections/WaggleSection'
import { WorkspacePanelSurface } from './-workspace-panel-surface'

export function WaggleRouteSurface() {
  return (
    <WorkspacePanelSurface
      name="Waggle"
      title="Waggle Mode"
      description="Browse saved Waggles, review their purpose, and open one when you want to edit or create a collaboration setup."
      contentClassName="px-8 py-6"
    >
      <WaggleSection showHeading={false} />
    </WorkspacePanelSurface>
  )
}
