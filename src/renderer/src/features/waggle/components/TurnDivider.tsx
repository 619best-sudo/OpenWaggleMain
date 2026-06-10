import type { WaggleAgentColor } from '@shared/types/waggle'
import { User } from 'lucide-react'

interface TurnDividerProps {
  turnNumber: number
  agentLabel: string
  agentColor: WaggleAgentColor
}

export function TurnDivider({ turnNumber, agentLabel }: TurnDividerProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/20 bg-bg-secondary/20 px-3 py-1.5 transition-colors">
      <div className="flex min-w-0 items-center gap-2.5 text-[13px]">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border/25 bg-bg-tertiary/55 text-text-muted shadow-sm">
          <User className="size-3.5" />
        </div>
        <span className="truncate font-medium text-text-secondary">{agentLabel}</span>
      </div>

      <div
        className="flex min-w-5 shrink-0 items-center justify-center rounded-full border border-border/20 bg-bg-tertiary/70 px-1.5 text-[10px] font-semibold text-text-muted"
        data-waggle-turn-label="true"
        title={`Turn ${turnNumber + 1}`}
      >
        {turnNumber + 1}
      </div>
    </div>
  )
}
