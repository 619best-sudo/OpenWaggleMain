import type { WagglePreset } from '@shared/types/waggle'
import { ChevronDown, LoaderCircle, Play, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { getPresetStarterPrompts } from '@/features/waggle/lib'
import { useWaggleAppInstallStatus } from '@/queries/waggle-apps'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { Popover } from '@/shared/ui/Popover'
import { WaggleDependencyDialog } from './WaggleDependencyDialog'

interface WagglePresetsPanelProps {
  projectPath: string | null
  presets: readonly WagglePreset[]
  activePresetId: string | null
  isModified: boolean
  onLoadPreset: (preset: WagglePreset) => void
  onDeletePreset: (id: string) => Promise<void>
  onStartCreate: () => void
  onInstallDependencies: (preset: WagglePreset) => Promise<void>
  onLaunchPreset: (preset: WagglePreset, prompt?: string) => Promise<void>
  installingPresetId: string | null
}

interface PresetSection {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly presets: readonly WagglePreset[]
}

interface PresetGuidance {
  readonly stage: string
  readonly bestFor: string
  readonly next?: string
}

const PRESET_GUIDANCE: Readonly<Record<string, PresetGuidance>> = {
  turing: {
    stage: 'Routing',
    bestFor: 'Routing the next lifecycle step from repo context',
    next: 'Usually Design And Asset Direction or a build Council of Experts workflow',
  },
  'product-planning': {
    stage: 'Planning',
    bestFor: 'Turning a vague request into a buildable scope',
    next: 'Design And Asset Direction or a build Council of Experts workflow',
  },
  'design-asset-direction': {
    stage: 'Design',
    bestFor: 'Choosing UI direction, hero mode, and asset fallbacks',
    next: 'Web Build or Mobile Build',
  },
  'web-build': {
    stage: 'Build',
    bestFor: 'Implementing the planned web route or surface',
    next: 'QA Repair Loop',
  },
  'mobile-build': {
    stage: 'Build',
    bestFor: 'Implementing the planned mobile screen or flow',
    next: 'QA Repair Loop',
  },
  'backend-build': {
    stage: 'Build',
    bestFor: 'Implementing the planned backend or API change',
    next: 'QA Repair Loop',
  },
  'qa-repair-loop': {
    stage: 'QA',
    bestFor: 'Self-healing verify -> fix -> retest cycles',
    next: 'Release Readiness when fixes pass',
  },
  'quality-assurance-engineer': {
    stage: 'QA',
    bestFor: 'Broader cross-surface QA before ship',
    next: 'Release Readiness or another repair loop',
  },
  'release-readiness': {
    stage: 'Release',
    bestFor: 'Ship, merge, beta, or demo decisions',
    next: 'Deployment',
  },
  deployment: {
    stage: 'Deploy',
    bestFor: 'Automated rollout or a manual deployment runbook',
  },
}

function getPresetGuidance(presetId: string | WagglePreset['id']): PresetGuidance | null {
  return PRESET_GUIDANCE[String(presetId)] ?? null
}

function getStageBadgeClass(stage: string): string {
  switch (stage) {
    case 'Routing':
      return 'border-sky-400/20 bg-sky-400/10 text-sky-300'
    case 'Planning':
      return 'border-violet-400/20 bg-violet-400/10 text-violet-300'
    case 'Design':
      return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
    case 'Build':
      return 'border-amber-400/20 bg-amber-400/10 text-amber-300'
    case 'QA':
      return 'border-rose-400/20 bg-rose-400/10 text-rose-300'
    case 'Release':
      return 'border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-300'
    case 'Deploy':
      return 'border-cyan-400/20 bg-cyan-400/10 text-cyan-300'
    default:
      return 'border-white/10 bg-white/[0.04] text-text-muted'
  }
}

function getPreflightBadgeClass(verdict: 'ready' | 'partial' | 'blocked'): string {
  switch (verdict) {
    case 'ready':
      return 'border-accent/20 bg-accent/10 text-accent'
    case 'partial':
      return 'border-amber-400/20 bg-amber-400/10 text-amber-300'
    case 'blocked':
      return 'border-rose-400/20 bg-rose-400/10 text-rose-300'
    default:
      return 'border-white/10 bg-white/[0.04] text-text-muted'
  }
}

function sortPresetsByPreferredOrder(
  presets: readonly WagglePreset[],
  preferredOrder: readonly string[],
): WagglePreset[] {
  const rank = new Map(preferredOrder.map((id, index) => [id, index] as const))

  return [...presets].sort((left, right) => {
    const leftRank = rank.get(String(left.id))
    const rightRank = rank.get(String(right.id))

    if (leftRank != null && rightRank != null) {
      return leftRank - rightRank
    }
    if (leftRank != null) return -1
    if (rightRank != null) return 1
    return left.name.localeCompare(right.name)
  })
}

function createPresetSections(presets: readonly WagglePreset[]): readonly PresetSection[] {
  const custom: WagglePreset[] = []
  const builtIn: WagglePreset[] = []

  for (const preset of presets) {
    if (!preset.isBuiltIn) {
      custom.push(preset)
    } else {
      builtIn.push(preset)
    }
  }

  return [
    {
      id: 'panels',
      title: 'Council of Experts',
      description:
        'Choose a Council of Experts workflow to run, or create one for a repeatable workflow.',
      presets: [
        ...sortPresetsByPreferredOrder(custom, []),
        ...sortPresetsByPreferredOrder(builtIn, []),
      ],
    },
  ].filter((section) => section.presets.length > 0)
}

export function WagglePresetsPanel({
  projectPath,
  presets,
  activePresetId,
  isModified,
  onLoadPreset,
  onDeletePreset,
  onStartCreate,
  onInstallDependencies,
  onLaunchPreset,
  installingPresetId,
}: WagglePresetsPanelProps) {
  const presetSections = createPresetSections(presets)

  return (
    <div className="w-full">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 pb-8 border-b border-white/[0.04]">
        <div className="space-y-4">
          <h3 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-rose-500 tracking-tight">
            Council of Experts
          </h3>
          <p className="max-w-[640px] text-[15px] leading-relaxed text-text-secondary">
            A Council of Experts workflow runs a two-agent loop designed for one clear task.
          </p>
        </div>
        <Button
          variant="accent"
          size="lg"
          radius="full"
          type="button"
          onClick={onStartCreate}
          leftIcon={<Plus className="size-5" />}
          className="shrink-0 px-6 shadow-lg transition-transform hover:scale-105 active:scale-95"
        >
          Create Council of Experts
        </Button>
      </div>

      <div className="space-y-12">
        {presets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-12 text-center">
            <p className="text-[14px] font-medium text-text-primary">
              No Council of Experts workflows yet
            </p>
            <p className="mt-2 text-[13px] text-text-tertiary">
              Create a Council of Experts workflow to save a repeatable workflow.
            </p>
          </div>
        ) : null}
        {presetSections.map((section) => (
          <section key={section.id} className="space-y-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h4 className="text-[16px] font-bold text-text-primary">{section.title}</h4>
                <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-text-muted">
                  {section.presets.length}
                </span>
              </div>
              <p className="max-w-[760px] text-[13px] leading-relaxed text-text-muted">
                {section.description}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {section.presets.map((preset) => (
                <WagglePresetCard
                  key={preset.id}
                  preset={preset}
                  isActive={activePresetId === preset.id}
                  isActiveModified={activePresetId === preset.id && isModified}
                  onSelect={() => onLoadPreset(preset)}
                  onDelete={() => onDeletePreset(preset.id)}
                  onInstall={() => onInstallDependencies(preset)}
                  onLaunch={(prompt) => onLaunchPreset(preset, prompt)}
                  projectPath={projectPath}
                  isInstalling={installingPresetId === preset.id}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

interface WagglePresetCardProps {
  projectPath: string | null
  preset: WagglePreset
  isActive: boolean
  isActiveModified: boolean
  onSelect: () => void
  onDelete: () => Promise<void>
  onInstall: () => Promise<void>
  onLaunch: (prompt?: string) => Promise<void>
  isInstalling: boolean
}

function WagglePresetCard({
  projectPath,
  preset,
  isActive,
  isActiveModified,
  onSelect,
  onDelete,
  onInstall,
  onLaunch,
  isInstalling,
}: WagglePresetCardProps) {
  const [isDependencyDialogOpen, setIsDependencyDialogOpen] = useState(false)
  const [isStarterPromptOpen, setIsStarterPromptOpen] = useState(false)
  const installStatusQuery = useWaggleAppInstallStatus(projectPath, preset)
  const installStatus = installStatusQuery.data
  const requiredDependencyCount = preset.app.requiredMcps.length + preset.app.requiredSkills.length
  const optionalDependencyCount =
    (preset.app.optionalMcps?.length ?? 0) + (preset.app.optionalSkills?.length ?? 0)
  const totalDependencyCount = requiredDependencyCount + optionalDependencyCount
  const hasOptionalSetupWork =
    (installStatus?.optionalMissingCount ?? 0) > 0 ||
    (installStatus?.optionalUnsupportedCount ?? 0) > 0
  const starterPrompts = getPresetStarterPrompts(preset.id)
  const hasStarterPrompts = starterPrompts.length > 0
  const guidance = getPresetGuidance(preset.id)
  const preflight = installStatus?.preflight ?? null
  let isPrimaryDisabled = false

  if (!projectPath) {
    isPrimaryDisabled = true
  } else if (requiredDependencyCount > 0 && installStatusQuery.isPending) {
    isPrimaryDisabled = true
  } else if (requiredDependencyCount > 0 && !installStatus?.ready) {
    if (isInstalling) {
      isPrimaryDisabled = true
    }
  }

  // Generate an icon color/gradient based on ID
  const isCore = preset.id.includes('planning') || preset.id.includes('launch')
  const isUI =
    preset.id.includes('ui') || preset.id.includes('design') || preset.id.includes('image')
  const isBackend = preset.id.includes('backend') || preset.id.includes('systems')
  const iconGradient = isCore
    ? 'from-blue-500/20 to-blue-600/10 text-blue-400 border-blue-500/20'
    : isUI
      ? 'from-emerald-500/20 to-emerald-600/10 text-emerald-400 border-emerald-500/20'
      : isBackend
        ? 'from-amber-500/20 to-amber-600/10 text-amber-400 border-amber-500/20'
        : 'from-white/10 to-white/5 text-text-secondary border-white/10'

  return (
    <>
      <div
        onClick={onSelect}
        className={cn(
          'w-full flex flex-col rounded-[16px] border border-border bg-bg-secondary p-5 transition-all duration-300 h-full relative group overflow-hidden cursor-pointer',
          isActive && !isActiveModified && 'border-accent/40 bg-accent/[0.04] shadow-sm',
          isActiveModified && 'border-blue-500/30 bg-blue-500/[0.04] shadow-sm',
          !isActive &&
            'hover:bg-bg-hover hover:border-white/20 hover:shadow-lg hover:-translate-y-0.5',
        )}
      >
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

        <div className="flex items-start justify-between w-full relative z-10">
          <div className="flex gap-4 items-center flex-1 min-w-0">
            <div
              className={cn(
                'size-14 shrink-0 rounded-2xl flex items-center justify-center border shadow-inner',
                iconGradient,
              )}
            >
              <Play className="size-6 opacity-80 ml-1" />
            </div>

            <div className="flex-1 min-w-0">
              {guidance ? (
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <div data-testid={`preset-stage-${String(preset.id)}`}>
                    <span
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]',
                        getStageBadgeClass(guidance.stage),
                      )}
                    >
                      {guidance.stage}
                    </span>
                  </div>
                  {preflight ? (
                    <div data-testid={`preset-preflight-${String(preset.id)}`}>
                      <span
                        className={cn(
                          'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]',
                          getPreflightBadgeClass(preflight.verdict),
                        )}
                      >
                        Preflight {preflight.verdict}
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[16px] font-semibold text-text-primary leading-tight line-clamp-1">
                  {preset.name}
                </h3>
              </div>
              <p className="mt-2 text-[12px] leading-[1.45] text-text-secondary line-clamp-3 min-h-[54px]">
                {preset.description}
              </p>
              {preflight ? (
                <p
                  className="mt-2 text-[11px] leading-5 text-text-muted"
                  data-testid={`preset-preflight-summary-${String(preset.id)}`}
                >
                  {preflight.summary}
                </p>
              ) : null}
              {guidance ? (
                <div
                  className="mt-3 flex flex-wrap items-center gap-2"
                  data-testid={`preset-guidance-${String(preset.id)}`}
                >
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium tracking-wide text-text-muted">
                    Best For: {guidance.bestFor}
                  </span>
                  {guidance.next ? (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-gradient-to-r from-accent/[0.18] to-amber-400/[0.10] px-2.5 py-1 text-[10px] font-semibold tracking-wide text-accent shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
                      data-testid={`preset-next-${String(preset.id)}`}
                    >
                      <Play className="size-2.5 fill-current" />
                      Recommended Next: {guidance.next}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {!preset.isBuiltIn ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                void onDelete()
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-1.5 text-text-muted hover:text-error hover:bg-white/5 cursor-pointer ml-2 shrink-0 -mt-1 -mr-1"
            >
              <Trash2 className="size-4" />
            </button>
          ) : null}
        </div>

        <div className="mt-5 flex items-center justify-end w-full pt-4 border-t border-border relative z-10 gap-3">
          {requiredDependencyCount > 0 && !installStatus?.ready ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={
                isPrimaryDisabled || (requiredDependencyCount > 0 && installStatusQuery.isPending)
              }
              onClick={(event) => {
                event.stopPropagation()
                if (!isPrimaryDisabled && !isInstalling) {
                  void onInstall()
                }
              }}
              leftIcon={
                isInstalling ? <LoaderCircle className="size-3.5 animate-spin" /> : undefined
              }
            >
              {isInstalling ? 'Installing...' : 'Install'}
            </Button>
          ) : (
            <>
              {totalDependencyCount > 0 && hasOptionalSetupWork ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isInstalling || installStatusQuery.isPending}
                  onClick={(event) => {
                    event.stopPropagation()
                    setIsDependencyDialogOpen(true)
                  }}
                >
                  Setup
                </Button>
              ) : null}
              {hasStarterPrompts ? (
                <Popover
                  open={isStarterPromptOpen}
                  onOpenChange={setIsStarterPromptOpen}
                  placement="top-end"
                  className="w-[320px] p-2"
                  trigger={
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={
                        isPrimaryDisabled || (requiredDependencyCount > 0 && !installStatus?.ready)
                      }
                      rightIcon={<ChevronDown className="size-3.5" />}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (
                          !isPrimaryDisabled &&
                          (requiredDependencyCount === 0 || installStatus?.ready)
                        ) {
                          setIsStarterPromptOpen((open) => !open)
                        }
                      }}
                    >
                      Starter Prompts
                    </Button>
                  }
                >
                  <div className="space-y-1">
                    <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
                      Launch {preset.name} With
                    </div>
                    {starterPrompts.map((starterPrompt) => (
                      <Button
                        key={starterPrompt.id}
                        variant="row"
                        className="rounded-md px-2.5 py-2 text-left"
                        onClick={(event) => {
                          event.stopPropagation()
                          setIsStarterPromptOpen(false)
                          void onLaunch(starterPrompt.prompt)
                        }}
                      >
                        <span className="truncate text-[12px]">{starterPrompt.title}</span>
                      </Button>
                    ))}
                  </div>
                </Popover>
              ) : null}
              <Button
                variant="accent"
                size="sm"
                disabled={
                  isPrimaryDisabled || (requiredDependencyCount > 0 && !installStatus?.ready)
                }
                onClick={(event) => {
                  event.stopPropagation()
                  if (
                    !isPrimaryDisabled &&
                    (requiredDependencyCount === 0 || installStatus?.ready)
                  ) {
                    void onLaunch()
                  }
                }}
              >
                Launch
              </Button>
            </>
          )}
        </div>
      </div>
      {isDependencyDialogOpen ? (
        <WaggleDependencyDialog
          preset={preset}
          status={installStatus ?? null}
          isInstalling={isInstalling}
          onInstall={onInstall}
          onClose={() => setIsDependencyDialogOpen(false)}
        />
      ) : null}
    </>
  )
}
