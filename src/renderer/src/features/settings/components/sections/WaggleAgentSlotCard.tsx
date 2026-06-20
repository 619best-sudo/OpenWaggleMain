import {
  getToolGenerationCapabilities,
  modelSupportsImageInput,
  type ProviderInfo,
} from '@shared/types/llm'
import type { Settings } from '@shared/types/settings'
import { isInheritedWaggleModelBinding, type WaggleAgentSlot } from '@shared/types/waggle'
import { Bot, Trash2 } from 'lucide-react'
import { ModelSelector } from '@/features/providers/components'
import { AGENT_BG, AGENT_BORDER } from '@/features/waggle/lib'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { Textarea } from '@/shared/ui/Textarea'
import { TextInput } from '@/shared/ui/TextInput'
import type { WaggleFormAction } from '../../hooks/useWaggleForm'

const ROWS = 4

interface WaggleAgentSlotCardProps {
  index: number
  agent: WaggleAgentSlot
  dispatchForm: (action: WaggleFormAction) => void
  dotLabel: string
  settings: Settings
  providerModels: ProviderInfo[]
  canRemove: boolean
}

export function WaggleAgentSlotCard({
  index,
  agent,
  dispatchForm,
  dotLabel,
  settings,
  providerModels,
  canRemove,
}: WaggleAgentSlotCardProps) {
  const selectedAgentModel = isInheritedWaggleModelBinding(agent.model)
    ? settings.selectedModel
    : agent.model
  const selectedModelInfo =
    providerModels
      .flatMap((provider) => provider.models)
      .find((model) => model.id === selectedAgentModel) ?? null
  const supportsImageInput = selectedModelInfo ? modelSupportsImageInput(selectedModelInfo) : false
  const toolGeneration = selectedModelInfo ? getToolGenerationCapabilities(selectedModelInfo) : []
  const promptMatchTerms = agent.runCondition?.type === 'prompt-match' ? agent.runCondition.anyOf : []

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
          {canRemove ? (
            <Button
              variant="secondary"
              type="button"
              onClick={() => dispatchForm({ type: 'remove-agent', index })}
              className="h-8 px-2.5 text-xs"
              leftIcon={<Trash2 className="size-3.5" />}
            >
              Remove
            </Button>
          ) : null}
        </div>

        <div className="space-y-5 flex-1 flex flex-col">
          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium text-text-secondary">Name</span>
            <TextInput
              type="text"
              value={agent.label}
              onChange={(e) =>
                dispatchForm({ type: 'set-agent-label', index, label: e.target.value })
              }
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
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="rounded-full border border-border-light bg-bg px-2.5 py-1 text-[10px] font-medium tracking-wide text-text-secondary uppercase">
                {supportsImageInput ? 'Native image input' : 'Text handoff only'}
              </span>
              {toolGeneration.length > 0 ? (
                <span className="rounded-full border border-border-light bg-bg px-2.5 py-1 text-[10px] font-medium tracking-wide text-text-secondary uppercase">
                  Tool generation: {toolGeneration.join(' / ')}
                </span>
              ) : null}
            </div>
            <p className="text-[11px] leading-5 text-text-tertiary">
              {supportsImageInput
                ? 'Can request tool-based image, audio, or video generation. Earlier image outputs can also be re-attached for direct critique.'
                : 'Can still drive tool-based image, audio, or video generation, but later turns receive concise prompt and file handoff notes instead of direct media input.'}
            </p>
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

          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium text-text-secondary">
              Run Only When Prompt Mentions
            </span>
            <Textarea
              value={promptMatchTerms.join('\n')}
              onChange={(event) =>
                dispatchForm({
                  type: 'set-agent-run-condition-terms',
                  index,
                  value: event.target.value,
                })
              }
              rows={2}
              placeholder={'Optional keywords, one per line\nanimation\nmotion'}
              resize="none"
              className="w-full rounded-md border border-border-light bg-bg p-2.5 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-accent/50 focus:outline-none shadow-sm leading-relaxed"
            />
            <p className="text-[11px] leading-5 text-text-tertiary">
              Leave blank to always include this agent. If filled, this slot stays in the run only
              when the user request mentions any listed keyword.
            </p>
          </label>
        </div>
      </div>
    </div>
  )
}
