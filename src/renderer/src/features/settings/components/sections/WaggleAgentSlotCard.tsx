import type { WaggleAgentSlot } from '@shared/types/waggle'
import { Brain, Trash2 } from 'lucide-react'
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
  canRemove: boolean
}

export function WaggleAgentSlotCard({
  index,
  agent,
  dispatchForm,
  dotLabel,
  canRemove,
}: WaggleAgentSlotCardProps) {
  const promptMatchTerms =
    agent.runCondition?.type === 'prompt-match' ? agent.runCondition.anyOf : []

  return (
    <div className="relative overflow-hidden rounded-xl border border-border-light bg-bg-secondary/70 p-5 transition-all shadow-sm hover:shadow-md h-full flex flex-col">
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-white/[0.015] to-transparent" />

      <div className="relative flex flex-col flex-1 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-text-secondary shadow-sm">
              <Brain className="size-4" />
            </div>
            <div className="flex items-center gap-2">
              <h3 className="text-[12px] font-semibold tracking-wide text-text-primary uppercase">
                Expert
              </h3>
              <span className="inline-flex min-w-6 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold text-text-secondary shadow-sm">
                {dotLabel}
              </span>
            </div>
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
            <span className="text-[11px] font-medium text-text-secondary">Name</span>
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

          <label className="block space-y-1.5 flex-1 flex flex-col">
            <span className="text-[11px] font-medium text-text-secondary">System Prompt</span>
            <Textarea
              value={agent.roleDescription}
              onChange={(e) =>
                dispatchForm({ type: 'set-agent-role', index, roleDescription: e.target.value })
              }
              rows={ROWS}
              placeholder="Describe this Expert's specific role, perspective, and rules..."
              resize="none"
              className="w-full flex-1 rounded-md border border-border-light bg-bg p-2.5 text-[12px] text-text-primary placeholder:text-text-tertiary focus:border-accent/50 focus:outline-none shadow-sm leading-relaxed"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-text-secondary">
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
              className="w-full rounded-md border border-border-light bg-bg p-2.5 text-[12px] text-text-primary placeholder:text-text-tertiary focus:border-accent/50 focus:outline-none shadow-sm leading-relaxed"
            />
            <p className="text-[10px] leading-5 text-text-tertiary">
              Leave blank to always include this Expert. If filled, this slot stays in the run only
              when the user request mentions any listed keyword.
            </p>
          </label>
        </div>
      </div>
    </div>
  )
}
