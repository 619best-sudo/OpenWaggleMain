import { act, renderHook } from '@testing-library/react'
import { createRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/types/settings'
import { useComposerSubmission } from '../useComposerSubmission'
import { useComposerStore } from '../../state/composer-store'
import { usePreferencesStore } from '@/features/settings/state'
import { useUIStore } from '@/shell/ui-store'

vi.mock('@/features/providers/hooks', () => ({
  useSelectedModelThinkingLevel: () => ({
    effectiveThinkingLevel: 'medium',
  }),
}))

describe('useComposerSubmission', () => {
  beforeEach(() => {
    useComposerStore.setState(useComposerStore.getInitialState())
    useUIStore.setState(useUIStore.getInitialState())
    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      settings: {
        ...DEFAULT_SETTINGS,
        selectedModel: DEFAULT_SETTINGS.selectedModel,
      },
      isLoaded: true,
    })
  })

  it('unlocks transcript debug from the composer command without sending a chat message', () => {
    useComposerStore.setState({ input: 'Shashank-Debug-ON' })
    const onSend = vi.fn()
    const onEnqueue = vi.fn()
    const onToast = vi.fn()

    const { result } = renderHook(() =>
      useComposerSubmission({
        onSend,
        onEnqueue,
        isLoading: false,
        disabled: false,
        requiresText: true,
        clearOnSubmit: true,
        recordHistory: true,
        allowEnqueue: true,
        onToast,
        editorRef: createRef(),
        projectPath: null,
        attachments: [],
        hasPreparingTextAttachment: false,
      }),
    )

    act(() => {
      result.current.handleSubmit()
    })

    expect(useUIStore.getState().transcriptDebugEnabled).toBe(true)
    expect(onSend).not.toHaveBeenCalled()
    expect(onEnqueue).not.toHaveBeenCalled()
    expect(onToast).toHaveBeenCalledWith('Transcript debug enabled.')
    expect(useComposerStore.getState().input).toBe('')
  })
})
