import type { ProviderInfo } from '@shared/types/llm'
import type { Settings } from '@shared/types/settings'
import {
  isInheritedWaggleModelBinding,
  type WaggleAgentSlot,
} from '@shared/types/waggle'
import { Bot } from 'lucide-react'
import { ModelSelector } from '@/features/providers/components'
import { AGENT_BG, AGENT_BORDER } from '@/features/waggle/lib'
import { cn } from '@/shared/lib/cn'
import { Textarea } from '@/shared/ui/Textarea'
import { TextInput } from '@/shared/ui/TextInput'
import type { WaggleFormAction } from '../../hooks/useWaggleForm'

const ROWS = 4

interface WaggleAgentSlotCardProps {
  index: 0 | 1
  agent: WaggleAgentSlot
  dispatchForm: (action: WaggleFormAction) => void
  dotLabel: string
  settings: Settings
  providerModels: ProviderInfo[]
}

export function WaggleAgentSlotCard({
  index,
  agent,
  dispatchForm,
  dotLabel,
  settings,
  providerModels,
}: WaggleAgentSlotCardProps) {
  const selectedAgentModel = isInheritedWaggleModelBinding(agent.model)
    ? settings.selectedModel
    : agent.model

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border bg-bg-secondary p-5 transition-all shadow-sm hover:shadow-md h-full flex flex-col',
        AGENT_BORDER[agent.color],
      )}
    >
      {/* Subtle background gradient tint */}
      <div
        className={cn('absolute inset-0 opacity-[0.03] pointer-events-none', AGENT_BG[agent.color])}
      />

      <div className="relative flex flex-col flex-1 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                'flex size-6 items-center justify-center rounded-md shadow-sm',
                AGENT_BG[agent.color],
              )}
            >
              <Bot className="size-3.5 text-white/90" />
            </div>
            <h3 className="text-[13px] font-semibold tracking-wide text-text-primary uppercase">
              Agent {dotLabel}
            </h3>
          </div>
        </div>

        <div className="space-y-5 flex-1 flex flex-col">
          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium text-text-secondary">Name</span>
            <TextInput
              type="text"
              value={agent.label}
              onChange={(e) => dispatchForm({ type: 'set-agent-label', index, label: e.target.value })}
              inputSize="sm"
              placeholder={`e.g. ${dotLabel === 'A' ? 'Strategist' : 'Critic'}`}
              className="w-full bg-bg border-border-light focus:border-accent/50 shadow-sm"
            />
          </label>

          <label className="block space-y-1.5 [&>div>button]:w-full [&>div>button]:h-8 [&>div>button]:bg-bg [&>div>button]:border-border-light [&>div>button]:shadow-sm">
            <span className="text-[12px] font-medium text-text-secondary">Model</span>
            <ModelSelector
              value={selectedAgentModel}
              onChange={(model) => dispatchForm({ type: 'set-agent-model', index, model })}
              settings={settings}
              providerModels={providerModels}
            />
          </label>

          <label className="block space-y-1.5 flex-1 flex flex-col">
            <span className="text-[12px] font-medium text-text-secondary">System Prompt</span>
            <Textarea
              value={agent.roleDescription}
              onChange={(e) =>
                dispatchForm({ type: 'set-agent-role', index, roleDescription: e.target.value })
              }
              rows={ROWS}
              placeholder="Describe this agent's specific role, perspective, and rules..."
              resize="none"
              className="w-full flex-1 rounded-md border border-border-light bg-bg p-2.5 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-accent/50 focus:outline-none shadow-sm leading-relaxed"
            />
          </label>
        </div>
      </div>
    </div>
  )
}
