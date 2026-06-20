import { SkillsPanel } from '@/features/skills/components/SkillsPanel'
import { WorkspacePanelSurface } from './-workspace-panel-surface'

const SKILLS_HEADER_ACTIONS_ID = 'skills-route-header-actions'

export function SkillsRouteSurface() {
  return (
    <WorkspacePanelSurface
      name="Skills"
      title="Skills"
      description="Discover and manage project skills."
      contentClassName="overflow-hidden p-0"
      headerActionsId={SKILLS_HEADER_ACTIONS_ID}
      framed={false}
    >
      <SkillsPanel showHeader={false} headerActionsContainerId={SKILLS_HEADER_ACTIONS_ID} />
    </WorkspacePanelSurface>
  )
}
