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
    readonly requiredMcpsText: string
    readonly requiredSkillsText: string
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

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border-light bg-bg-secondary/35 px-4 py-3">
              <div className="text-[12px] leading-5 text-text-tertiary">
                Configure each participant in the collaboration loop. Waggle now rotates through
                every active agent in order, and individual slots can opt into prompt-keyword
                gating when they should only join certain requests.
              </div>
              <Button
                variant="secondary"
                type="button"
                onClick={() => dispatchForm({ type: 'add-agent' })}
                leftIcon={<Plus className="size-4" />}
                className="shrink-0"
              >
                Add Agent
              </Button>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              {formState.agents.map((agent, index) => (
                <WaggleAgentSlotCard
                  key={`agent-${String(index)}`}
                  index={index}
                  agent={agent}
                  dispatchForm={dispatchForm}
                  dotLabel={String(index + 1)}
                  settings={settings}
                  providerModels={providerModels}
                  canRemove={formState.agents.length > 2}
                />
              ))}
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-3 rounded-xl border border-border-light bg-bg-secondary/50 px-4 py-3 text-[12px] leading-5 text-text-tertiary">
              Waggle apps bundle agent roles with the MCPs and skills they depend on. Later turns
              receive a concise generation handoff, and image-capable models can additionally
              inspect discovered image outputs directly. When using MCPs, always map artifact
              starter payload values into the tool schema exactly.
            </div>
            <div className="mb-6 grid gap-4 md:grid-cols-2">
              <DependencyEditor
                label="Required MCPs"
                description="One MCP id per line. These become the installable MCP dependencies for this Waggle app."
                placeholder={'playwright\npostgres\nffmpeg'}
                value={formState.requiredMcpsText}
                onChange={(value) => dispatchForm({ type: 'set-required-mcps-text', value })}
              />
              <DependencyEditor
                label="Required Skills"
                description="One skill id per line. These become the installable skill dependencies for this Waggle app."
                placeholder={'ui-critic\nbackend-auditor\nmedia-director'}
                value={formState.requiredSkillsText}
                onChange={(value) => dispatchForm({ type: 'set-required-skills-text', value })}
              />
            </div>
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

function DependencyEditor(input: {
  readonly label: string
  readonly description: string
  readonly placeholder: string
  readonly value: string
  readonly onChange: (value: string) => void
}) {
  return (
    <label className="rounded-xl border border-border-light bg-bg-secondary/35 p-4">
      <div className="text-[12px] font-medium uppercase tracking-wide text-text-secondary">
        {input.label}
      </div>
      <div className="mt-1 text-[12px] leading-5 text-text-tertiary">{input.description}</div>
      <textarea
        className="mt-3 min-h-[120px] w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent/50"
        value={input.value}
        onChange={(event) => input.onChange(event.target.value)}
        placeholder={input.placeholder}
        spellCheck={false}
      />
    </label>
  )
}
