import type { ProviderInfo } from '@shared/types/llm'
import type { Settings } from '@shared/types/settings'
import { PencilLine, Plus, Save, X } from 'lucide-react'
import { useEscapeHotkey } from '@/shared/hooks/useEscapeHotkey'
import { Button } from '@/shared/ui/Button'
import type { WaggleFormAction } from '../../hooks/useWaggleForm'
import { WaggleAgentSlotCard } from './WaggleAgentSlotCard'
import { CollaborationSettingsCard } from './WaggleCollaborationSettingsCard'

interface WaggleEditorDialogProps {
  readonly mode: 'create' | 'edit'
  readonly title: string
  readonly description: string
  readonly primaryActionLabel: string
  readonly canSubmit: boolean
  readonly errorMessage: string | null
  readonly settings: Settings
  readonly providerModels: ProviderInfo[]
  readonly formState: {
    readonly agents: readonly Parameters<typeof WaggleAgentSlotCard>[0]['agent'][]
    readonly stopCondition: Parameters<typeof CollaborationSettingsCard>[0]['stopCondition']
    readonly maxTurns: number
  }
  readonly dispatchForm: (action: WaggleFormAction) => void
  readonly onClose: () => void
  readonly onSubmit: () => void
}

export function WaggleEditorDialog({
  mode,
  title,
  description,
  primaryActionLabel,
  canSubmit,
  errorMessage,
  settings,
  providerModels,
  formState,
  dispatchForm,
  onClose,
  onSubmit,
}: WaggleEditorDialogProps) {
  const [agentA, agentB] = formState.agents

  useEscapeHotkey(onClose)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />
      <div className="relative flex max-h-full w-full max-w-[920px] flex-col overflow-hidden rounded-2xl border border-border-light bg-bg shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border bg-bg-secondary/50 px-6 py-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <div className="flex size-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
                {mode === 'create' ? (
                  <Plus className="size-4" />
                ) : (
                  <PencilLine className="size-4" />
                )}
              </div>
              <h2 className="text-[15px] font-semibold tracking-wide text-text-primary">{title}</h2>
            </div>
            <p className="max-w-[680px] text-[13px] leading-relaxed text-text-tertiary">
              {description}
            </p>
          </div>
          <Button
            variant="unstyled"
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary"
            title="Close"
          >
            <X className="size-4.5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-bg">
          {errorMessage ? (
            <p
              role="alert"
              className="mb-6 rounded-lg border border-error/25 bg-error/6 px-4 py-3 text-[13px] text-error"
            >
              {errorMessage}
            </p>
          ) : null}

          <div className="relative flex flex-col gap-6 md:flex-row md:items-stretch">
            <div className="flex-1">
              {agentA ? (
                <WaggleAgentSlotCard
                  index={0}
                  agent={agentA}
                  dispatchForm={dispatchForm}
                  dotLabel="A"
                  settings={settings}
                  providerModels={providerModels}
                />
              ) : null}
            </div>

            {/* Visual VS divider */}
            <div className="absolute left-1/2 top-1/2 z-10 hidden size-8 -translate-x-1/2 -translate-y-1/2 select-none items-center justify-center rounded-full border border-border bg-bg-secondary text-[11px] font-bold text-text-tertiary shadow-sm md:flex">
              VS
            </div>

            <div className="flex-1">
              {agentB ? (
                <WaggleAgentSlotCard
                  index={1}
                  agent={agentB}
                  dispatchForm={dispatchForm}
                  dotLabel="B"
                  settings={settings}
                  providerModels={providerModels}
                />
              ) : null}
            </div>
          </div>

          <div className="mt-6">
            <CollaborationSettingsCard
              stopCondition={formState.stopCondition}
              maxTurns={formState.maxTurns}
              onStopConditionChange={(stopCondition) =>
                dispatchForm({ type: 'set-stop-condition', stopCondition })
              }
              onMaxTurnsChange={(maxTurns) => dispatchForm({ type: 'set-max-turns', maxTurns })}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border bg-bg-secondary/50 px-6 py-4">
          <Button variant="secondary" type="button" onClick={onClose} className="px-4">
            Cancel
          </Button>
          <Button
            variant="accent"
            type="button"
            onClick={onSubmit}
            leftIcon={<Save className="size-4" />}
            disabled={!canSubmit}
            className="px-5 shadow-sm"
          >
            {primaryActionLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
