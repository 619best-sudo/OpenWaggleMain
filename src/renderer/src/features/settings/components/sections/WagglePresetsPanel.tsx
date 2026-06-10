import type { WagglePreset } from '@shared/types/waggle'
import { ChevronRight, Plus, Trash2 } from 'lucide-react'
import { AGENT_BG } from '@/features/waggle/lib'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'

interface WagglePresetsPanelProps {
  presets: readonly WagglePreset[]
  activePresetId: string | null
  isModified: boolean
  onLoadPreset: (preset: WagglePreset) => void
  onDeletePreset: (id: string) => Promise<void>
  onStartCreate: () => void
}

export function WagglePresetsPanel({
  presets,
  activePresetId,
  isModified,
  onLoadPreset,
  onDeletePreset,
  onStartCreate,
}: WagglePresetsPanelProps) {
  return (
    <div className="rounded-lg border border-border bg-[#111418] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-text-secondary">Waggles</h3>
          <p className="max-w-[640px] text-[13px] leading-5 text-text-tertiary">
            Browse saved setups first. Open one to edit it, or start a new Waggle from a blank
            draft.
          </p>
        </div>
        <Button
          variant="accent"
          size="sm"
          type="button"
          onClick={onStartCreate}
          leftIcon={<Plus className="size-3.5" />}
          className="shrink-0"
        >
          New Waggle
        </Button>
      </div>

      <div className="mt-5 space-y-3">
        {presets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
            <p className="text-[13px] font-medium text-text-primary">No Waggles yet</p>
            <p className="mt-1 text-[12px] text-text-tertiary">
              Create your first Waggle, then return here to edit or reuse it later.
            </p>
          </div>
        ) : null}
        {presets.map((preset) => (
          <WagglePresetCard
            key={preset.id}
            preset={preset}
            isActive={activePresetId === preset.id}
            isActiveModified={activePresetId === preset.id && isModified}
            onSelect={() => onLoadPreset(preset)}
            onDelete={() => onDeletePreset(preset.id)}
          />
        ))}
      </div>
    </div>
  )
}

interface WagglePresetCardProps {
  preset: WagglePreset
  isActive: boolean
  isActiveModified: boolean
  onSelect: () => void
  onDelete: () => Promise<void>
}

function WagglePresetCard({
  preset,
  isActive,
  isActiveModified,
  onSelect,
  onDelete,
}: WagglePresetCardProps) {
  const stopLabel = preset.config.stop.primary === 'consensus' ? 'Consensus' : 'Manual stop'

  return (
    <Button
      variant="unstyled"
      type="button"
      className={cn(
        'w-full rounded-md border px-4 py-3.5 cursor-pointer text-left transition-colors',
        isActive && !isActiveModified && 'border-accent/40 bg-white/[0.02]',
        isActiveModified && 'border-blue-500/30 bg-white/[0.02]',
        !isActive &&
          'border-border bg-transparent hover:border-border-light hover:bg-white/[0.015]',
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-medium text-text-primary truncate">
              {preset.name}
            </span>
            <PresetBadge tone={preset.isBuiltIn ? 'muted' : 'accent'}>
              {preset.isBuiltIn ? 'Built-in' : 'Custom'}
            </PresetBadge>
            {isActiveModified ? <PresetBadge tone="info">Edited</PresetBadge> : null}
          </div>
          <p className="mt-1.5 text-[13px] leading-5 text-text-secondary">{preset.description}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-text-tertiary">
            <div className="flex items-center gap-1.5">
              <div
                className={cn('size-1.5 rounded-full', AGENT_BG[preset.config.agents[0].color])}
              />
              <span>{preset.config.agents[0].label}</span>
              <span className="text-text-muted">+</span>
              <div
                className={cn('size-1.5 rounded-full', AGENT_BG[preset.config.agents[1].color])}
              />
              <span>{preset.config.agents[1].label}</span>
            </div>
            <span>{stopLabel}</span>
            <span>{preset.config.stop.maxTurnsSafety} turns max</span>
          </div>
        </div>
        <div className="flex items-start gap-2">
          {!preset.isBuiltIn ? (
            <span
              role="none"
              onClick={(event) => {
                event.stopPropagation()
                void onDelete()
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.stopPropagation()
                  void onDelete()
                }
              }}
              className="mt-0.5 rounded p-1 text-text-muted hover:text-error transition-colors cursor-pointer"
            >
              <Trash2 className="size-3.5" />
            </span>
          ) : null}
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-text-muted" />
        </div>
      </div>
    </Button>
  )
}

function PresetBadge({
  children,
  tone = 'muted',
}: {
  readonly children: React.ReactNode
  readonly tone?: 'muted' | 'accent' | 'info'
}) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-medium',
        tone === 'muted' && 'bg-white/[0.04] text-text-muted',
        tone === 'accent' && 'bg-accent/8 text-accent',
        tone === 'info' && 'bg-blue-500/10 text-blue-300',
      )}
    >
      {children}
    </span>
  )
}
