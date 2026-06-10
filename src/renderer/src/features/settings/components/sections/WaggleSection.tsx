import { useEffect, useMemo, useState } from 'react'
import { usePreferences, useProviders } from '@/features/settings/hooks/useSettings'
import { useWaggleForm } from '../../hooks/useWaggleForm'
import { WaggleEditorDialog } from './WaggleEditorDialog'
import { WagglePresetsPanel } from './WagglePresetsPanel'

type WaggleEditorMode = 'closed' | 'create' | 'edit'

export function WaggleSection({ showHeading = true }: { readonly showHeading?: boolean }) {
  const { settings } = usePreferences()
  const { providerModels } = useProviders()
  const {
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
  } = useWaggleForm()
  const [editorMode, setEditorMode] = useState<WaggleEditorMode>('closed')

  const activePreset = useMemo(
    () => presets.find((preset) => preset.id === activePresetId) ?? null,
    [activePresetId, presets],
  )

  useEffect(() => {
    if (editorMode === 'create' && activePresetId) {
      setEditorMode('edit')
    }
    if (editorMode === 'edit' && !activePresetId) {
      setEditorMode('closed')
    }
  }, [activePresetId, editorMode])

  function handleSelectPreset(preset: (typeof presets)[number]) {
    loadPreset(preset)
    setEditorMode('edit')
  }

  function handleStartCreate() {
    startNewDraft()
    setEditorMode('create')
  }

  function handleCloseEditor() {
    setEditorMode('closed')
  }

  const editorTitle =
    editorMode === 'create'
      ? 'Create Waggle'
      : activePreset
        ? `Edit ${activePreset.name}`
        : 'Edit Waggle'
  const editorDescription =
    editorMode === 'create'
      ? 'Define the two agent roles and stop rules, then save this setup when it is ready.'
      : 'Adjust the selected setup here after reviewing it from the list.'
  const primaryActionLabel = editorMode === 'create' ? 'Create Waggle' : 'Save Changes'
  const isDialogOpen = editorMode !== 'closed'

  return (
    <div className="space-y-6">
      {showHeading ? (
        <h2 className="text-[20px] font-semibold text-text-primary">Waggle Mode</h2>
      ) : null}
      {!isDialogOpen && displayedError && (
        <p
          role="alert"
          className="rounded-lg border border-error/25 bg-error/6 px-3 py-2 text-sm text-error"
        >
          {displayedError}
        </p>
      )}
      <WagglePresetsPanel
        presets={presets}
        activePresetId={activePresetId}
        isModified={isModified}
        onLoadPreset={handleSelectPreset}
        onDeletePreset={handleDeletePreset}
        onStartCreate={handleStartCreate}
      />
      {isDialogOpen ? (
        <WaggleEditorDialog
          mode={editorMode}
          title={editorTitle}
          description={editorDescription}
          primaryActionLabel={primaryActionLabel}
          canSubmit={editorMode === 'create' || isModified}
          errorMessage={displayedError}
          settings={settings}
          providerModels={providerModels}
          formState={formState}
          dispatchForm={dispatchForm}
          onClose={handleCloseEditor}
          onSubmit={() => void (editorMode === 'create' ? handleCreatePreset() : handleSaveEdits())}
        />
      ) : null}
    </div>
  )
}
