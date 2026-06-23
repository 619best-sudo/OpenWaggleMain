import { Check } from 'lucide-react'
import { SupportedModelId } from '@shared/types/brand'
import type { ProviderInfo } from '@shared/types/llm'
import type { Settings, ThinkingLevel } from '@shared/types/settings'
import { useMemo, useState } from 'react'
import { useSelectedModelThinkingLevel } from '@/features/providers/hooks'
import { useProviderStore } from '@/features/providers/state'
import { usePreferencesStore } from '@/features/settings/state'
import { cn } from '@/shared/lib/cn'
import { formatContextWindow } from '@/shared/lib/format-tokens'
import { Button } from '@/shared/ui/Button'
import { Popover } from '@/shared/ui/Popover'
import { THINKING_LEVEL_LABELS } from '../constants/thinking-level-labels'
import {
  getThinkingButtonTitle,
  hasOnlyOffThinkingLevel,
} from '../lib/thinking-level-view'
import { ProviderModelIcon, resolveIconColor } from '../../providers/components/ModelSelector/provider-icon'
import type { FlatModel } from '../../providers/components/ModelSelector/types'

function toFlatModel(group: ProviderInfo, model: ProviderInfo['models'][number]) {
  const modelRef = model.id.trim()
  if (!modelRef || !model.available) return null

  return {
    id: SupportedModelId(modelRef),
    modelId: model.modelId,
    name: model.name.trim() || model.modelId,
    provider: group.provider,
    providerName: group.displayName,
    contextWindowLabel: model.contextWindow ? formatContextWindow(model.contextWindow) : undefined,
  } satisfies FlatModel
}

function buildAvailableModelLookup(providerModels: readonly ProviderInfo[]) {
  const modelLookup = new Map<string, FlatModel>()

  for (const group of providerModels) {
    for (const model of group.models) {
      const flatModel = toFlatModel(group, model)
      if (flatModel) modelLookup.set(flatModel.id, flatModel)
    }
  }

  return modelLookup
}

function buildFlatModels(providerModels: readonly ProviderInfo[], settings: Settings) {
  if (settings.enabledModels.length === 0) return []

  const modelLookup = buildAvailableModelLookup(providerModels)
  const seen = new Set<string>()
  const models: FlatModel[] = []

  for (const key of settings.enabledModels) {
    const modelRef = key.trim()
    if (!modelRef || seen.has(modelRef)) continue
    seen.add(modelRef)

    const model = modelLookup.get(modelRef)
    if (model) models.push(model)
  }

  return models.slice().sort((a, b) => {
    if (a.provider !== b.provider) return a.provider.localeCompare(b.provider)
    return a.name.localeCompare(b.name)
  })
}

export function ComposerModelPicker() {
  const settings = usePreferencesStore((s) => s.settings)
  const setSelectedModel = usePreferencesStore((s) => s.setSelectedModel)
  const setThinkingLevel = usePreferencesStore((s) => s.setThinkingLevel)
  const providerModels = useProviderStore((s) => s.providerModels)
  const thinking = useSelectedModelThinkingLevel()
  const [open, setOpen] = useState(false)

  const flatModels = useMemo(
    () => buildFlatModels(providerModels, settings),
    [providerModels, settings],
  )
  const selectedModel = flatModels.find((model) => model.id === settings.selectedModel)
  const hasSelectedModel = settings.selectedModel.trim().length > 0
  const selectedModelOnlySupportsOff =
    thinking.capabilitiesKnown && hasOnlyOffThinkingLevel(thinking.availableThinkingLevels)
  const triggerTitle = `Model and thinking settings. ${getThinkingButtonTitle({
    hasSelectedModel,
    capabilitiesKnown: thinking.capabilitiesKnown,
    selectedModelOnlySupportsOff,
    isAdjustedForModel: thinking.isAdjustedForModel,
    requestedThinkingLevel: thinking.requestedThinkingLevel,
    effectiveThinkingLevel: thinking.effectiveThinkingLevel,
  })}`
  const triggerLabel = selectedModel?.name ?? 'Select model'
  const triggerAriaLabel = `Model ${triggerLabel}. Thinking ${THINKING_LEVEL_LABELS[thinking.effectiveThinkingLevel]}.`

  function handleSelectModel(model: FlatModel) {
    void setSelectedModel(model.id)
  }

  function handleSelectThinkingLevel(level: ThinkingLevel) {
    void setThinkingLevel(level)
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="top-start"
      className="w-[248px] p-1.5"
      trigger={
        <Button
          variant="unstyled"
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={triggerAriaLabel}
          title={triggerTitle}
          onClick={() => setOpen((current) => !current)}
          className={cn(
            'no-drag flex size-[26px] items-center justify-center rounded-md border border-home-border transition-colors',
            'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
          )}
        >
          {selectedModel ? (
            <ProviderModelIcon
              provider={selectedModel.provider}
              className="size-4 shrink-0"
              style={{ color: resolveIconColor(selectedModel.provider) }}
            />
          ) : (
            <span className="text-[10px] leading-none text-text-tertiary">AI</span>
          )}
        </Button>
      }
    >
      <div className="rounded-md">
        <div className="px-2 py-1 text-[10px] font-medium tracking-[0.12em] text-text-muted uppercase">
          Model
        </div>
        <div className="max-h-[200px] overflow-y-auto">
          {flatModels.length === 0 ? (
            <div className="px-3 py-4 text-[12px] text-text-tertiary">
              No models configured.
            </div>
          ) : (
            <div className="space-y-px">
              {flatModels.map((model) => (
                <ComposerModelRow
                  key={model.id}
                  model={model}
                  selected={selectedModel?.id === model.id}
                  onSelect={handleSelectModel}
                />
              ))}
            </div>
          )}
        </div>

        <div className="home-divider-t mt-1 pt-1.5">
          <div className="px-2 pb-1 text-[10px] font-medium tracking-[0.12em] text-text-muted uppercase">
            Thinking
          </div>
          <div className="flex flex-wrap gap-1 px-1 pb-1">
            {thinking.availableThinkingLevels.length > 0 ? (
              thinking.availableThinkingLevels.map((level) => (
                <ThinkingChip
                  key={level}
                  active={thinking.effectiveThinkingLevel === level}
                  label={THINKING_LEVEL_LABELS[level]}
                  onClick={() => handleSelectThinkingLevel(level)}
                />
              ))
            ) : (
              <div className="px-2 py-1 text-[12px] text-text-tertiary">
                Loading thinking capabilities...
              </div>
            )}
          </div>
        </div>
      </div>
    </Popover>
  )
}

function ComposerModelRow({
  model,
  selected,
  onSelect,
}: {
  readonly model: FlatModel
  readonly selected: boolean
  readonly onSelect: (model: FlatModel) => void
}) {
  return (
    <Button
      variant="unstyled"
      type="button"
      title={model.id}
      onClick={() => onSelect(model)}
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left transition-colors',
        'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
        selected && 'bg-bg-hover text-text-primary',
      )}
    >
      <ProviderModelIcon
        provider={model.provider}
        className="size-4 shrink-0"
        style={{ color: resolveIconColor(model.provider) }}
      />
      <span className="min-w-0 flex-1 truncate text-[12px]">
        {model.name}
        <span className="ml-1 text-[10px] text-text-muted">{model.providerName}</span>
      </span>
      {model.contextWindowLabel ? (
        <span className="shrink-0 text-[10px] text-text-muted">{model.contextWindowLabel}</span>
      ) : null}
      {selected ? <Check className="size-3 shrink-0 text-accent" /> : null}
    </Button>
  )
}

function ThinkingChip({
  active,
  label,
  onClick,
}: {
  readonly active: boolean
  readonly label: string
  readonly onClick: () => void
}) {
  return (
    <Button
      variant="unstyled"
      type="button"
      onClick={onClick}
      className={cn(
        'home-panel-frame-soft rounded-md px-2 py-1 text-[11px] transition-colors',
        active
          ? 'bg-accent/10 text-text-primary'
          : 'bg-bg-secondary/30 text-text-secondary hover:bg-bg-hover hover:text-text-primary',
      )}
    >
      {label}
    </Button>
  )
}
