import { User } from 'lucide-react'
import type { WaggleInfo } from './AssistantMessageBubble'

interface AgentLabelProps {
  waggle?: WaggleInfo
}

export function AgentLabel({ waggle }: AgentLabelProps) {
  if (waggle) {
    return (
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border/20 bg-bg-secondary/20 px-2 py-1 text-[11px] font-medium text-text-primary/82">
          <div
            className="flex size-5 shrink-0 items-center justify-center rounded-sm border border-border/25 bg-bg-tertiary/55 text-text-secondary shadow-sm"
            aria-hidden="true"
          >
            <User className="size-3" />
          </div>
          <span>{waggle.agentLabel}</span>
        </span>
      </div>
    )
  }

  return null
}
