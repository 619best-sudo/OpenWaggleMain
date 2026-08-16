import type { SkillCatalogResult, SkillDiscoveryItem } from '@shared/types/standards'
import { Download, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { PROJECT_SKILLS_DIR_SEGMENTS } from '@shared/constants/project-config'
import { useProject } from '@/features/sessions/hooks'
import { useSkills } from '@/features/skills/hooks/useSkills'
import { cn } from '@/shared/lib/cn'
import { api } from '@/shared/lib/ipc'
import { Button } from '@/shared/ui/Button'
import { Spinner } from '@/shared/ui/Spinner'
import { ToggleSwitch } from '@/shared/ui/ToggleSwitch'
import { useUIStore } from '@/shell/ui-store'
import { ImportSkillDialog } from './ImportSkillDialog'
import { SkillPreviewPane } from './SkillPreviewPane'
import { EmptySkillsState, NoProjectState } from './SkillsPanelStates'

/**
 * Whether a skill folder lives under the project's `.turing-machine/skills` root —
 * the only directory the UI is allowed to delete from (mirrors the importer,
 * which writes only there). Repo-curated skills under `.agents/skills` are
 * version-controlled and must be removed via the filesystem.
 */
function isRemovableSkill(projectPath: string, folderPath: string): boolean {
  const root = [projectPath.replace(/\/+$/, ''), ...PROJECT_SKILLS_DIR_SEGMENTS].join('/')
  const normalized = folderPath.replace(/\/+$/, '')
  return normalized === root || normalized.startsWith(`${root}/`)
}

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

function SkillListItem({
  skill,
  selected,
  removable,
  onSelect,
  onToggle,
  onRemove,
}: {
  readonly skill: SkillDiscoveryItem
  readonly selected: boolean
  readonly removable: boolean
  readonly onSelect: () => void
  readonly onToggle: (enabled: boolean) => void
  readonly onRemove: () => void
}) {
  return (
    <div
      className={cn(
        'group relative flex w-full items-center justify-between gap-4 border-b border-border/50 px-5 py-4 transition-colors last:border-b-0',
        selected
          ? 'border-l-2 border-l-info bg-info/10 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-info)_12%,transparent)]'
          : 'hover:bg-bg-hover/60',
      )}
    >
      <Button
        variant="unstyled"
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 text-left flex flex-col gap-1.5"
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'truncate text-[14px] font-medium',
              selected ? 'text-info' : 'text-text-primary',
            )}
          >
            {skill.name}
          </span>
          {skill.hasScripts && (
            <span title="Includes scripts" className="inline-block shrink-0">
              <Sparkles className={cn('size-3', selected ? 'text-info' : 'text-accent/60')} />
            </span>
          )}
          {skill.loadStatus === 'error' && (
            <span className="text-[9px] font-medium text-error/70 shrink-0">Invalid</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="truncate text-[12px] text-text-tertiary">
            {skill.description || 'No description provided.'}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-mono font-medium',
              selected ? 'bg-info/12 text-info' : 'bg-bg-tertiary text-text-tertiary',
            )}
          >
            {skill.id}
          </span>
        </div>
      </Button>
      <div className="flex items-center gap-2 shrink-0">
        <ToggleSwitch
          checked={skill.enabled}
          label={`${skill.enabled ? 'Disable' : 'Enable'} ${skill.name}`}
          onCheckedChange={onToggle}
        />
        <Button
          variant="unstyled"
          type="button"
          disabled={!removable}
          onClick={onRemove}
          title={
            removable
              ? `Remove ${skill.name}`
              : "Repo-curated skills (.agents/skills) can't be removed from here"
          }
          aria-label={`Remove ${skill.name}`}
          className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-error/10 hover:text-error disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-text-tertiary"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

function SkillsList({
  catalog,
  isLoading,
  selectedSkillId,
  projectPath,
  selectSkill,
  toggleSkill,
  removeSkill,
}: {
  readonly catalog: SkillCatalogResult | null
  readonly isLoading: boolean
  readonly selectedSkillId: string | null
  readonly projectPath: string
  readonly selectSkill: (skillId: string) => void
  readonly toggleSkill: (skillId: string, enabled: boolean) => Promise<void>
  readonly removeSkill: (skillId: string) => Promise<void>
}) {
  const skills = catalog?.skills ?? []

  return (
    <div className="mb-4 mt-2 overflow-hidden rounded-xl border border-border bg-bg-secondary shadow-[inset_0_1px_0_var(--theme-panel-shadow-highlight)]">
      <div className="flex items-center justify-between border-b border-border bg-bg-secondary px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-[12px] font-semibold text-text-secondary uppercase tracking-wider">
            Discovered Skills
          </h3>
        </div>
      </div>
      <div className="flex flex-col bg-bg-primary">
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-text-tertiary/40">
            <Spinner />
          </div>
        ) : skills.length === 0 ? (
          <EmptySkillsState />
        ) : (
          skills.map((skill) => (
            <SkillListItem
              key={skill.id}
              skill={skill}
              selected={selectedSkillId === skill.id}
              removable={isRemovableSkill(projectPath, skill.folderPath)}
              onSelect={() => selectSkill(skill.id)}
              onToggle={(enabled) => void toggleSkill(skill.id, enabled)}
              onRemove={() => void removeSkill(skill.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function SkillsSidebar({
  catalog,
  isLoading,
  selectedSkillId,
  projectPath,
  selectSkill,
  toggleSkill,
  removeSkill,
}: {
  readonly catalog: SkillCatalogResult | null
  readonly isLoading: boolean
  readonly selectedSkillId: string | null
  readonly projectPath: string
  readonly selectSkill: (skillId: string) => void
  readonly toggleSkill: (skillId: string, enabled: boolean) => Promise<void>
  readonly removeSkill: (skillId: string) => Promise<void>
}) {
  return (
    <div className="flex min-h-0 flex-col border-r border-border bg-bg-secondary p-4 pb-0 pt-2">
      <section className="min-h-0 flex-1 overflow-y-auto">
        <SkillsList
          catalog={catalog}
          isLoading={isLoading}
          selectedSkillId={selectedSkillId}
          projectPath={projectPath}
          selectSkill={selectSkill}
          toggleSkill={toggleSkill}
          removeSkill={removeSkill}
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
    catalog,
    selectedSkillId,
    previewMarkdown,
    isLoading,
    isPreviewLoading,
    isImporting,
    isRemoving,
    error,
    refresh,
    importSkill,
    selectSkill,
    toggleSkill,
    removeSkill,
  } = useSkills(projectPath)
  const showToast = useUIStore((state) => state.showToast)
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

  async function handleRemoveSkill(skill: SkillDiscoveryItem) {
    const confirmed = await api.showConfirm(
      'Remove this skill?',
      `The skill folder at ${skill.folderPath} will be deleted. This cannot be undone.`,
    )
    if (!confirmed) return
    try {
      await removeSkill(skill.id)
      showToast(`Removed skill "${skill.name}".`, 'success')
    } catch (removeError) {
      const message = removeError instanceof Error ? removeError.message : String(removeError)
      showToast(`Failed to remove skill: ${message}`, 'error')
    }
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
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2 xl:grid-cols-[550px_1fr]">
        <SkillsSidebar
          catalog={catalog}
          isLoading={isLoading}
          selectedSkillId={selectedSkillId}
          projectPath={projectPath}
          selectSkill={selectSkill}
          toggleSkill={toggleSkill}
          removeSkill={async (skillId) => {
            const target = catalog?.skills.find((skill) => skill.id === skillId)
            if (target) await handleRemoveSkill(target)
          }}
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
          isImporting={isImporting || isRemoving}
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
