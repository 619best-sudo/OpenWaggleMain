import type { WaggleAppInstallStatus, WagglePreset } from '@shared/types/waggle'
import { AlertCircle, CheckCircle2, Download, Wrench, X } from 'lucide-react'
import { useEscapeHotkey } from '@/shared/hooks/useEscapeHotkey'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'

interface WaggleDependencyDialogProps {
  readonly preset: WagglePreset
  readonly status: WaggleAppInstallStatus | null
  readonly isInstalling: boolean
  readonly onInstall: () => Promise<void>
  readonly onClose: () => void
}

export function WaggleDependencyDialog({
  preset,
  status,
  isInstalling,
  onInstall,
  onClose,
}: WaggleDependencyDialogProps) {
  useEscapeHotkey(onClose)

  const requiredDependencyCount = preset.app.requiredMcps.length + preset.app.requiredSkills.length
  const optionalDependencyCount =
    (preset.app.optionalMcps?.length ?? 0) + (preset.app.optionalSkills?.length ?? 0)
  const dependencyCount = requiredDependencyCount + optionalDependencyCount
  const isReady = status?.ready ?? false
  const hasDependencySetupWork =
    (status?.missingCount ?? 0) > 0 ||
    (status?.unsupportedCount ?? 0) > 0 ||
    (status?.optionalMissingCount ?? 0) > 0 ||
    (status?.optionalUnsupportedCount ?? 0) > 0
  const canInstall = dependencyCount > 0 && !isInstalling && hasDependencySetupWork
  const preflight = status?.preflight ?? null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${preset.name} setup`}
    >
      <div
        data-testid="waggle-dependency-dialog"
        className="flex max-h-[min(88vh,820px)] w-full max-w-[760px] flex-col overflow-hidden rounded-2xl border border-border-light bg-bg shadow-2xl"
      >
        <div className="shrink-0 flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="space-y-1">
            <h2 className="text-[15px] font-semibold text-text-primary">{preset.name} Setup</h2>
            <p className="max-w-[580px] text-[12px] leading-5 text-text-tertiary">
              These checks apply only to this Waggle app. Standard chat and non-app Waggle flows are
              unchanged.
            </p>
          </div>
          <Button
            variant="unstyled"
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary"
            title="Close"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div
          data-testid="waggle-dependency-dialog-body"
          className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5"
        >
          <div
            className={cn(
              'rounded-xl border px-4 py-3',
              isReady ? 'border-accent/25 bg-accent/8' : 'border-border-light bg-bg-secondary/40',
            )}
          >
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium',
                  isReady ? 'bg-accent/15 text-accent' : 'bg-white/[0.05] text-text-secondary',
                )}
              >
                {isReady ? <CheckCircle2 className="size-3.5" /> : <Wrench className="size-3.5" />}
                {isReady ? 'Ready In Waggle App' : 'Needs Waggle App Setup'}
              </span>
              {preflight ? (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium uppercase tracking-wide',
                    preflight.verdict === 'ready' && 'bg-accent/15 text-accent',
                    preflight.verdict === 'partial' && 'bg-warning/15 text-warning',
                    preflight.verdict === 'blocked' && 'bg-rose-500/15 text-rose-300',
                  )}
                >
                  Preflight {preflight.verdict}
                </span>
              ) : null}
              <span className="text-text-tertiary">
                {dependencyCount === 0
                  ? 'This Waggle app does not declare any installable dependencies.'
                  : status
                    ? `${status.installedCount}/${status.requiredDependencyCount} required dependencies ready${status.optionalDependencyCount > 0 ? `, ${status.optionalInstalledCount}/${status.optionalDependencyCount} optional ready` : ''}`
                    : `${dependencyCount} dependencies declared`}
              </span>
            </div>
            <p className="mt-2 text-[12px] leading-5 text-text-tertiary">
              Review the dependencies below, install known recipes, and finish any project-specific
              setup notes. Required dependencies gate launch. Optional dependencies unlock broader
              task coverage without blocking narrower requests.
            </p>
            {preflight ? (
              <p className="mt-2 text-[12px] leading-5 text-text-secondary">{preflight.summary}</p>
            ) : null}
          </div>

          {preflight && preflight.checks.length > 0 ? (
            <div className="rounded-xl border border-border-light bg-bg-secondary/35 px-4 py-3">
              <div className="text-[12px] font-medium text-text-primary">Preflight Checks</div>
              <div className="mt-3 space-y-2">
                {preflight.checks.map((check) => (
                  <div
                    key={check.id}
                    className="flex flex-col gap-1 rounded-lg border border-white/6 bg-black/10 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[12px] font-medium text-text-primary">{check.label}</span>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                          check.status === 'pass' && 'bg-accent/15 text-accent',
                          check.status === 'warn' && 'bg-warning/15 text-warning',
                          check.status === 'fail' && 'bg-rose-500/15 text-rose-300',
                        )}
                      >
                        {check.status}
                      </span>
                    </div>
                    <p className="text-[12px] leading-5 text-text-tertiary">{check.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {status?.unsupportedCount ? (
            <div className="rounded-xl border border-warning/25 bg-warning/8 px-4 py-3 text-[12px] leading-5 text-warning">
              {status.unsupportedCount} dependency
              {status.unsupportedCount === 1 ? '' : 'ies'} still need a recipe before this Waggle
              app can be fully app-managed.
            </div>
          ) : null}

          <div className="space-y-3">
            {dependencyCount === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-5 text-[12px] text-text-tertiary">
                No MCPs or skills are declared for this Waggle app yet.
              </div>
            ) : (
              status?.dependencies.map((dependency) => (
                <div
                  key={`${dependency.kind}-${dependency.id}`}
                  className="rounded-xl border border-border-light bg-bg-secondary/35 px-4 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium text-text-primary">
                      {dependency.label}
                    </span>
                    <DependencyKindBadge kind={dependency.kind} />
                    <DependencyRequirementBadge required={dependency.required} />
                    <DependencyStateBadge state={dependency.state} />
                  </div>
                  {dependency.description ? (
                    <p className="mt-2 text-[12px] leading-5 text-text-secondary">
                      {dependency.description}
                    </p>
                  ) : null}
                  {dependency.detail ? (
                    <p className="mt-2 text-[12px] leading-5 text-text-tertiary">
                      {dependency.detail}
                    </p>
                  ) : null}
                  {dependency.setupSteps && dependency.setupSteps.length > 0 ? (
                    <div className="mt-3 rounded-lg border border-white/6 bg-black/10 px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                        <AlertCircle className="size-3.5" />
                        Setup Notes
                      </div>
                      <div className="mt-2 space-y-1.5 text-[12px] leading-5 text-text-tertiary">
                        {dependency.setupSteps.map((step) => (
                          <p key={step}>- {step}</p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="accent"
            onClick={() => void onInstall()}
            disabled={!canInstall}
            leftIcon={<Download className="size-3.5" />}
          >
            {isReady ? 'Installed' : isInstalling ? 'Installing...' : 'Install Known Dependencies'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function DependencyKindBadge({ kind }: { readonly kind: 'mcp' | 'skill' }) {
  return (
    <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
      {kind}
    </span>
  )
}

function DependencyStateBadge({
  state,
}: {
  readonly state: 'installed' | 'missing' | 'unsupported'
}) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        state === 'installed' && 'bg-accent/15 text-accent',
        state === 'missing' && 'bg-white/[0.06] text-text-secondary',
        state === 'unsupported' && 'bg-warning/15 text-warning',
      )}
    >
      {state}
    </span>
  )
}

function DependencyRequirementBadge({ required }: { readonly required: boolean }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        required ? 'bg-white/[0.06] text-text-secondary' : 'bg-blue-500/15 text-blue-300',
      )}
    >
      {required ? 'required' : 'optional'}
    </span>
  )
}
