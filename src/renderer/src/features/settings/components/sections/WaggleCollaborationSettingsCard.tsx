import type { WaggleStopCondition } from '@shared/types/waggle'
import { Settings2 } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { RangeInput } from '@/shared/ui/RangeInput'

const MIN_TURNS = 4
const MAX_TURNS = 20

interface CollaborationSettingsCardProps {
  stopCondition: WaggleStopCondition
  maxTurns: number
  onStopConditionChange: (stopCondition: WaggleStopCondition) => void
  onMaxTurnsChange: (maxTurns: number) => void
}

export function CollaborationSettingsCard({
  stopCondition,
  maxTurns,
  onStopConditionChange,
  onMaxTurnsChange,
}: CollaborationSettingsCardProps) {
  return (
    <div className="rounded-xl border border-border bg-bg-secondary p-5 shadow-sm">
      <div className="flex items-center gap-2.5 mb-5">
        <Settings2 className="size-4 text-text-tertiary" />
        <h3 className="text-[13px] font-semibold tracking-wide text-text-primary uppercase">
          Collaboration Rules
        </h3>
      </div>

      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between bg-bg rounded-lg border border-border-light p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <span className="text-[13px] font-medium text-text-secondary">Stop condition</span>
          <StopConditionToggle
            stopCondition={stopCondition}
            onStopConditionChange={onStopConditionChange}
          />
        </div>

        <div className="hidden md:block w-px h-8 bg-border" />

        <div className="flex items-center gap-4">
          <span className="text-[13px] font-medium text-text-secondary">Maximum turns</span>
          <MaxTurnsSlider maxTurns={maxTurns} onMaxTurnsChange={onMaxTurnsChange} />
        </div>
      </div>
    </div>
  )
}

interface StopConditionToggleProps {
  stopCondition: WaggleStopCondition
  onStopConditionChange: (stopCondition: WaggleStopCondition) => void
}

function StopConditionToggle({ stopCondition, onStopConditionChange }: StopConditionToggleProps) {
  return (
    <div className="flex rounded-md border border-border overflow-hidden bg-bg shadow-sm">
      <Button
        variant="unstyled"
        type="button"
        onClick={() => onStopConditionChange('consensus')}
        className={cn(
          'px-4 py-1.5 text-[12px] font-medium transition-colors',
          stopCondition === 'consensus'
            ? 'bg-accent/15 text-accent'
            : 'text-text-tertiary hover:text-text-secondary hover:bg-bg-hover',
        )}
      >
        Consensus
      </Button>
      <div className="w-px bg-border" />
      <Button
        variant="unstyled"
        type="button"
        onClick={() => onStopConditionChange('user-stop')}
        className={cn(
          'px-4 py-1.5 text-[12px] font-medium transition-colors',
          stopCondition === 'user-stop'
            ? 'bg-accent/15 text-accent'
            : 'text-text-tertiary hover:text-text-secondary hover:bg-bg-hover',
        )}
      >
        Manual stop
      </Button>
    </div>
  )
}

interface MaxTurnsSliderProps {
  maxTurns: number
  onMaxTurnsChange: (maxTurns: number) => void
}

function MaxTurnsSlider({ maxTurns, onMaxTurnsChange }: MaxTurnsSliderProps) {
  return (
    <div className="flex items-center gap-3">
      <RangeInput
        min={MIN_TURNS}
        max={MAX_TURNS}
        value={maxTurns}
        onChange={(event) => onMaxTurnsChange(Number(event.target.value))}
        className="w-[120px] accent-accent"
      />
      <span className="text-[13px] font-medium text-text-primary w-6 text-right">{maxTurns}</span>
    </div>
  )
}
