import { useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { useChat } from '@/features/chat/hooks/useChat'
import { usePreferences, useProviders } from '@/features/settings/hooks/useSettings'
import { usePreferencesStore } from '@/features/settings/state/preferences-store'
import { useWaggleLaunchPromptStore, useWaggleStore } from '@/features/waggle/state'
import { useInstallWaggleAppDependenciesMutation } from '@/queries/waggle-apps'
import { useUIStore } from '@/shell/ui-store'
import { useWaggleForm } from '../../hooks/useWaggleForm'
import { WaggleEditorDialog } from './WaggleEditorDialog'
import { WagglePresetsPanel } from './WagglePresetsPanel'

type WaggleEditorMode = 'closed' | 'create' | 'edit'

export function WaggleSection({ showHeading = true }: { readonly showHeading?: boolean }) {
  const navigate = useNavigate()
  const { settings } = usePreferences()
  const { providerModels } = useProviders()
  const projectPath = usePreferencesStore((state) => state.settings.projectPath)
  const showToast = useUIStore((state) => state.showToast)
  const { activeSession, activeSessionId, createSession } = useChat()
  const setWaggleConfig = useWaggleStore((state) => state.setConfig)
  const queueLaunchPrompt = useWaggleLaunchPromptStore((state) => state.queuePrompt)
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
  const installDependenciesMutation = useInstallWaggleAppDependenciesMutation(projectPath)
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

  async function handleSubmitEditor() {
    if (editorMode === 'create') {
      const createdPreset = await handleCreatePreset()
      if (createdPreset) {
        setEditorMode('closed')
        showToast(`Created Panel "${createdPreset.name}".`, 'success')
      }
      return
    }

    await handleSaveEdits()
  }

  async function handleInstallDependencies(preset: (typeof presets)[number]) {
    if (!projectPath) {
      showToast('Select a project before installing Panel app dependencies.', 'error')
      return
    }

    try {
      const result = await installDependenciesMutation.mutateAsync(preset)
      const changedCount = result.installedDependencyIds.length + result.enabledDependencyIds.length
      if (result.unsupportedDependencyIds.length > 0) {
        showToast(
          `Installed what we could for "${preset.name}". ${result.unsupportedDependencyIds.length} dependency ids still need recipes.`,
          'neutral',
        )
        return
      }
      showToast(
        changedCount > 0
          ? `Installed Panel app dependencies for "${preset.name}".`
          : `"${preset.name}" is already ready to run.`,
        'success',
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      showToast(`Failed to install Panel app dependencies: ${message}`, 'error')
    }
  }

  async function handleLaunchPreset(preset: (typeof presets)[number], prompt?: string) {
    if (!projectPath) {
      showToast('Select a project before launching a Panel app.', 'error')
      return
    }

    try {
      const targetSessionId =
        activeSessionId && activeSession?.projectPath === projectPath
          ? activeSessionId
          : await createSession(projectPath)

      setWaggleConfig(preset.config, targetSessionId)
      if (prompt) {
        queueLaunchPrompt(targetSessionId, String(preset.id), prompt)
      }
      void navigate({
        to: '/sessions/$sessionId',
        params: { sessionId: String(targetSessionId) },
      })
      showToast(
        prompt
          ? `"${preset.name}" is ready with a starter prompt in the composer.`
          : `"${preset.name}" is ready. Send the first prompt in chat to start this Panel app.`,
        'success',
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      showToast(`Failed to launch Panel app: ${message}`, 'error')
    }
  }

  const editorTitle =
    editorMode === 'create'
      ? 'Create Panel'
      : activePreset
        ? `Edit ${activePreset.name}`
        : 'Edit Panel'
  const editorDescription =
    editorMode === 'create'
      ? 'Define the Expert roles, app dependencies, and stop rules, then save this Panel app when it is ready.'
      : activePreset?.description?.trim()
        ? activePreset.description
        : 'Adjust the selected Panel app here after reviewing it from the list.'
  const primaryActionLabel = editorMode === 'create' ? 'Create Panel' : 'Save Changes'
  const isDialogOpen = editorMode !== 'closed'

  return (
    <div className="space-y-6">
      {showHeading ? (
        <h2 className="text-[20px] font-semibold text-text-primary">Panel Mode</h2>
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
        projectPath={projectPath}
        presets={presets}
        activePresetId={activePresetId}
        isModified={isModified}
        onLoadPreset={handleSelectPreset}
        onDeletePreset={handleDeletePreset}
        onStartCreate={handleStartCreate}
        onInstallDependencies={handleInstallDependencies}
        onLaunchPreset={handleLaunchPreset}
        installingPresetId={
          installDependenciesMutation.isPending
            ? (installDependenciesMutation.variables?.id ?? null)
            : null
        }
      />
      {isDialogOpen ? (
        <WaggleEditorDialog
          mode={editorMode}
          title={editorTitle}
          description={editorDescription}
          primaryActionLabel={primaryActionLabel}
          canSubmit={editorMode === 'create' || isModified}
          canEditTitle={editorMode === 'create' || !activePreset?.isBuiltIn}
          errorMessage={displayedError}
          settings={settings}
          providerModels={providerModels}
          formState={formState}
          dispatchForm={dispatchForm}
          onClose={handleCloseEditor}
          onSubmit={() => void handleSubmitEditor()}
        />
      ) : null}
    </div>
  )
}
