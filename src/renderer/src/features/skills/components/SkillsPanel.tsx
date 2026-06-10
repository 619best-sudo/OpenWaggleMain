import type { SkillCatalogResult, SkillDiscoveryItem } from '@shared/types/standards'
import { Download, RefreshCw, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useProject } from '@/features/sessions/hooks'
import { useSkills } from '@/features/skills/hooks/useSkills'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { Spinner } from '@/shared/ui/Spinner'
import { ToggleSwitch } from '@/shared/ui/ToggleSwitch'
import { ImportSkillDialog } from './ImportSkillDialog'
import { SkillPreviewPane } from './SkillPreviewPane'
import { StatusBadge } from './SkillStatusBadge'
import { EmptySkillsState, NoProjectState } from './SkillsPanelStates'

type StandardsStatus = ReturnType<typeof useSkills>['standardsStatus']

function SkillsPanelActions({
  onRefresh,
  onOpenImport,
}: {
  readonly onRefresh: () => void
  readonly onOpenImport: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        leftIcon={<Download className="size-3.5" />}
        onClick={onOpenImport}
      >
        Import Skill
      </Button>
      <Button
        variant="secondary"
        size="sm"
        leftIcon={<RefreshCw className="size-3.5" />}
        onClick={onRefresh}
      >
        Refresh
      </Button>
    </div>
  )
}

function SkillsPanelHeader({
  onRefresh,
  onOpenImport,
}: {
  readonly onRefresh: () => void
  readonly onOpenImport: () => void
}) {
  return (
    <div className="flex items-center justify-between border-b border-border px-5 py-3">
      <div>
        <h2 className="text-sm font-semibold text-text-primary">Skills</h2>
        <p className="text-[12px] text-text-tertiary">Discover and manage project skills.</p>
      </div>
      <SkillsPanelActions onRefresh={onRefresh} onOpenImport={onOpenImport} />
    </div>
  )
}

function StandardsSection({
  projectPath,
  standardsStatus,
}: {
  readonly projectPath: string
  readonly standardsStatus: StandardsStatus
}) {
  return (
    <section className="px-4 py-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
          Standards
        </span>
        <StatusBadge status={standardsStatus?.agents ?? 'missing'} />
      </div>
      <div className="mt-2.5 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-medium text-text-secondary">AGENTS.md</span>
        </div>
        <p className="truncate text-[10px] text-text-muted/60">
          {standardsStatus?.agentsPath || `${projectPath}/AGENTS.md`}
        </p>
      </div>
      {standardsStatus?.error && (
        <p className="mt-2 text-[10px] text-error/80 leading-relaxed">{standardsStatus.error}</p>
      )}
    </section>
  )
}

function SkillListItem({
  skill,
  selected,
  onSelect,
  onToggle,
}: {
  readonly skill: SkillDiscoveryItem
  readonly selected: boolean
  readonly onSelect: () => void
  readonly onToggle: (enabled: boolean) => void
}) {
  return (
    <div
      className={cn(
        'group relative flex w-full items-start gap-2 rounded-lg px-2.5 py-2 transition-all duration-200',
        selected
          ? 'bg-white/5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]'
          : 'hover:bg-white/[0.03]',
      )}
    >
      <Button
        variant="unstyled"
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[12px] font-medium text-text-primary">{skill.name}</span>
          {skill.hasScripts && (
            <span title="Includes scripts">
              <Sparkles className="size-3 shrink-0 text-accent/60" />
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-text-tertiary">
          {skill.description || 'No description provided.'}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="rounded bg-white/[0.04] px-1 py-0.5 font-mono text-[9px] text-text-muted">
            {skill.id}
          </span>
          {skill.loadStatus === 'error' && (
            <span className="text-[9px] font-medium text-error/70">Invalid</span>
          )}
        </div>
      </Button>
      <div className="flex h-5 items-center">
        <ToggleSwitch
          checked={skill.enabled}
          label={`${skill.enabled ? 'Disable' : 'Enable'} ${skill.name}`}
          size="compact"
          onCheckedChange={onToggle}
        />
      </div>
    </div>
  )
}

function SkillsList({
  catalog,
  isLoading,
  selectedSkillId,
  selectSkill,
  toggleSkill,
}: {
  readonly catalog: SkillCatalogResult | null
  readonly isLoading: boolean
  readonly selectedSkillId: string | null
  readonly selectSkill: (skillId: string) => void
  readonly toggleSkill: (skillId: string, enabled: boolean) => Promise<void>
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-text-tertiary/40">
        <Spinner />
      </div>
    )
  }

  if ((catalog?.skills.length ?? 0) === 0) {
    return (
      <div className="px-2">
        <EmptySkillsState />
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      <div className="px-2 pb-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
          Discovered Skills
        </h3>
      </div>
      <div className="space-y-0.5 px-1">
        {catalog?.skills.map((skill) => (
          <SkillListItem
            key={skill.id}
            skill={skill}
            selected={selectedSkillId === skill.id}
            onSelect={() => selectSkill(skill.id)}
            onToggle={(enabled) => void toggleSkill(skill.id, enabled)}
          />
        ))}
      </div>
    </div>
  )
}

function SkillsSidebar({
  projectPath,
  standardsStatus,
  catalog,
  isLoading,
  selectedSkillId,
  selectSkill,
  toggleSkill,
}: {
  readonly projectPath: string
  readonly standardsStatus: StandardsStatus
  readonly catalog: SkillCatalogResult | null
  readonly isLoading: boolean
  readonly selectedSkillId: string | null
  readonly selectSkill: (skillId: string) => void
  readonly toggleSkill: (skillId: string, enabled: boolean) => Promise<void>
}) {
  return (
    <div className="flex min-h-0 flex-col border-r border-white/5 bg-[#09090b]">
      <StandardsSection projectPath={projectPath} standardsStatus={standardsStatus} />
      <div className="mx-4 border-t border-white/5" />
      <section className="min-h-0 flex-1 overflow-y-auto py-4">
        <SkillsList
          catalog={catalog}
          isLoading={isLoading}
          selectedSkillId={selectedSkillId}
          selectSkill={selectSkill}
          toggleSkill={toggleSkill}
        />
      </section>
    </div>
  )
}

function SkillsPanelContent({
  projectPath,
  showHeader,
  headerActionsContainerId,
}: {
  readonly projectPath: string
  readonly showHeader: boolean
  readonly headerActionsContainerId?: string
}) {
  const {
    standardsStatus,
    catalog,
    selectedSkillId,
    previewMarkdown,
    isLoading,
    isPreviewLoading,
    isImporting,
    error,
    refresh,
    importSkill,
    selectSkill,
    toggleSkill,
  } = useSkills(projectPath)
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const selectedSkill = catalog?.skills.find((skill) => skill.id === selectedSkillId) ?? null
  const headerActions = (
    <SkillsPanelActions
      onRefresh={() => void refresh()}
      onOpenImport={() => setIsImportDialogOpen(true)}
    />
  )
  const portalTarget =
    !showHeader && headerActionsContainerId && typeof document !== 'undefined'
      ? document.getElementById(headerActionsContainerId)
      : null

  async function handleImportSkill(sourceUrl: string) {
    const result = await importSkill(sourceUrl)
    if (result.status === 'imported') {
      setIsImportDialogOpen(false)
    }
    return result
  }

  return (
    <div className={cn('flex h-full flex-col overflow-hidden', showHeader && 'bg-bg')}>
      {showHeader ? (
        <SkillsPanelHeader
          onRefresh={() => void refresh()}
          onOpenImport={() => setIsImportDialogOpen(true)}
        />
      ) : null}
      {!showHeader && !portalTarget ? (
        <div className="flex justify-end border-b border-border px-5 py-3">{headerActions}</div>
      ) : null}
      {portalTarget ? createPortal(headerActions, portalTarget) : null}
      <div className="grid min-h-0 flex-1 grid-cols-[300px_1fr]">
        <SkillsSidebar
          projectPath={projectPath}
          standardsStatus={standardsStatus}
          catalog={catalog}
          isLoading={isLoading}
          selectedSkillId={selectedSkillId}
          selectSkill={selectSkill}
          toggleSkill={toggleSkill}
        />
        <SkillPreviewPane
          error={error}
          selectedSkill={selectedSkill}
          isPreviewLoading={isPreviewLoading}
          previewMarkdown={previewMarkdown}
        />
      </div>
      {isImportDialogOpen ? (
        <ImportSkillDialog
          isImporting={isImporting}
          onImport={handleImportSkill}
          onClose={() => setIsImportDialogOpen(false)}
        />
      ) : null}
    </div>
  )
}

export function SkillsPanel({
  showHeader = true,
  headerActionsContainerId,
}: {
  readonly showHeader?: boolean
  readonly headerActionsContainerId?: string
}) {
  const { projectPath } = useProject()

  if (!projectPath) {
    return <NoProjectState />
  }

  return (
    <SkillsPanelContent
      projectPath={projectPath}
      showHeader={showHeader}
      headerActionsContainerId={headerActionsContainerId}
    />
  )
}
