import { WagglePresetId } from '@shared/types/brand'
import type { WagglePreset } from '@shared/types/waggle'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useReducer } from 'react'
import { usePreferencesStore } from '@/features/settings/state/preferences-store'
import {
  useDeleteWagglePresetMutation,
  useSaveWagglePresetMutation,
  wagglePresetsQueryOptions,
} from '@/queries/waggle-presets'
import {
  buildWaggleAppManifest,
  buildWaggleConfig,
  formMatchesPreset,
  INITIAL_WAGGLE_FORM_STATE,
  INITIAL_WAGGLE_PRESET_STATE,
  type WaggleFormAction,
  type WaggleFormState,
  waggleFormReducer,
  wagglePresetReducer,
} from './waggle-form-state'

export type { WaggleFormAction } from './waggle-form-state'

const SLICE_ARG_2 = 60
const PRESET_NAME_PREVIEW_COUNT = 3

function describeWaggleError(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback
}

function buildPresetName(formState: WaggleFormState) {
  const labels = formState.agents
    .map((agent) => agent.label.trim())
    .filter((label) => label.length > 0)
  if (labels.length === 0) return 'Custom Waggle'
  if (labels.length <= PRESET_NAME_PREVIEW_COUNT) return labels.join(' + ')
  return `${labels.slice(0, PRESET_NAME_PREVIEW_COUNT).join(' + ')} + ${String(labels.length - PRESET_NAME_PREVIEW_COUNT)} more`
}

function buildPresetDescription(formState: WaggleFormState) {
  const firstRole = formState.agents.find((agent) => agent.roleDescription.trim())?.roleDescription.trim()
  return `Custom: ${(firstRole ?? 'Multi-agent collaboration').slice(0, SLICE_ARG_2)}`
}

export interface WaggleFormHook {
  readonly formState: WaggleFormState
  readonly dispatchForm: React.Dispatch<WaggleFormAction>
  readonly presets: readonly WagglePreset[]
  readonly activePresetId: string | null
  readonly isModified: boolean
  readonly displayedError: string | null
  readonly loadPreset: (preset: WagglePreset) => void
  readonly startNewDraft: () => void
  readonly handleSaveEdits: () => Promise<void>
  readonly handleCreatePreset: () => Promise<void>
  readonly handleDeletePreset: (id: string) => Promise<void>
}

export function useWaggleForm(): WaggleFormHook {
  const projectPath = usePreferencesStore((state) => state.settings.projectPath)
  const wagglePresetsQuery = useQuery(wagglePresetsQueryOptions(projectPath))
  const saveWagglePresetMutation = useSaveWagglePresetMutation(projectPath)
  const deleteWagglePresetMutation = useDeleteWagglePresetMutation(projectPath)
  const [formState, dispatchForm] = useReducer(waggleFormReducer, INITIAL_WAGGLE_FORM_STATE)
  const [presetState, dispatchPreset] = useReducer(wagglePresetReducer, INITIAL_WAGGLE_PRESET_STATE)
  const { activePresetId, error } = presetState
  const presets = wagglePresetsQuery.data ?? []

  useEffect(() => {
    if (!activePresetId) return
    if (presets.some((preset) => preset.id === activePresetId)) return
    dispatchPreset({ type: 'clear-active-preset' })
  }, [activePresetId, presets])

  function loadPreset(preset: WagglePreset) {
    dispatchPreset({ type: 'select-preset', activePresetId: preset.id })
    dispatchForm({ type: 'load-preset', preset })
  }

  function startNewDraft() {
    dispatchPreset({ type: 'clear-active-preset' })
    dispatchPreset({ type: 'clear-error' })
    dispatchForm({ type: 'reset' })
  }

  const activePreset = presets.find((p) => p.id === activePresetId)
  const currentApp = buildWaggleAppManifest(formState)
  const isModified = activePreset ? !formMatchesPreset(formState, activePreset) : false
  const queryError = wagglePresetsQuery.error
    ? describeWaggleError(wagglePresetsQuery.error, 'Failed to load Waggle presets.')
    : null
  const displayedError = error ?? queryError

  async function handleSaveEdits() {
    if (!activePreset) return
    const config = buildWaggleConfig(formState)
    const saveInput = {
      ...activePreset,
      name: activePreset.isBuiltIn ? activePreset.name : buildPresetName(formState),
      description: activePreset.isBuiltIn
        ? activePreset.description
        : buildPresetDescription(formState),
      config,
      app: currentApp,
    }
    dispatchPreset({ type: 'clear-error' })

    try {
      const saved = await saveWagglePresetMutation.mutateAsync(saveInput)
      dispatchPreset({ type: 'save-success', activePresetId: saved.id })
    } catch (saveError) {
      dispatchPreset({
        type: 'set-error',
        error: describeWaggleError(saveError, 'Failed to save Waggle preset.'),
      })
    }
  }

  async function handleCreatePreset() {
    const config = buildWaggleConfig(formState)
    const saveInput = {
      id: WagglePresetId(''),
      name: buildPresetName(formState),
      description: buildPresetDescription(formState),
      config,
      app: currentApp,
      isBuiltIn: false,
      createdAt: 0,
      updatedAt: 0,
    }
    dispatchPreset({ type: 'clear-error' })

    try {
      const saved = await saveWagglePresetMutation.mutateAsync(saveInput)
      dispatchPreset({ type: 'save-success', activePresetId: saved.id })
    } catch (saveError) {
      dispatchPreset({
        type: 'set-error',
        error: describeWaggleError(saveError, 'Failed to create Waggle preset.'),
      })
    }
  }

  async function handleDeletePreset(id: string) {
    dispatchPreset({ type: 'clear-error' })

    try {
      await deleteWagglePresetMutation.mutateAsync(WagglePresetId(id))
      if (activePresetId === id) {
        dispatchPreset({ type: 'clear-active-preset' })
      }
    } catch (deleteError) {
      dispatchPreset({
        type: 'set-error',
        error: describeWaggleError(deleteError, 'Failed to delete Waggle preset.'),
      })
    }
  }

  return {
    formState,
    dispatchForm,
    presets,
    activePresetId,
    isModified,
    displayedError,
    loadPreset,
    startNewDraft,
    handleSaveEdits,
    handleCreatePreset,
    handleDeletePreset,
  }
}
