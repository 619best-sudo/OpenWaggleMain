import { User } from 'lucide-react'
import type { WaggleInfo } from './AssistantMessageBubble'

interface AgentLabelProps {
  waggle?: WaggleInfo
}

export function AgentLabel({ waggle }: AgentLabelProps) {
  if (waggle) {
    return (
      <div>
        <span className="home-panel-frame-soft inline-flex items-center gap-1.5 rounded-md bg-bg-secondary/20 px-2 py-1 text-[11px] font-medium text-text-primary/82">
          <div
            className="home-panel-frame-soft flex size-5 shrink-0 items-center justify-center rounded-sm bg-bg-tertiary/55 text-text-secondary shadow-sm"
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
