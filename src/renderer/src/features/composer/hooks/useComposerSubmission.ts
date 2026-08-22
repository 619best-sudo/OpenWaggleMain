import type { AgentSendPayload, PreparedAttachment } from '@shared/types/agent'
import type { LexicalEditor } from 'lexical'
import type { RefObject } from 'react'
import { usePreferencesStore } from '@/features/settings/state'
import { FORCED_SEND_THINKING_LEVEL } from '@/shared/constants/thinking'
import { useUIStore } from '@/shell/ui-store'
import { clearEditor } from '../lib/lexical-utils'
import { consumeSendResult } from '../lib/send-result'
import { useComposerStore } from '../state/composer-store'

const SILENT_SUBMIT_BLOCK = { type: 'silent' } as const
const TRANSCRIPT_DEBUG_UNLOCK_PHRASE = 'Shashank-Debug-ON'

interface UseComposerSubmissionInput {
  readonly onSend: (payload: AgentSendPayload) => Promise<void> | void
  readonly onEnqueue: (payload: AgentSendPayload) => Promise<void> | void
  readonly isLoading: boolean
  readonly disabled?: boolean
  readonly requiresText: boolean
  readonly clearOnSubmit: boolean
  readonly recordHistory: boolean
  readonly allowEnqueue: boolean
  readonly onToast?: (message: string) => void
  readonly editorRef: RefObject<LexicalEditor | null>
  readonly projectPath: string | null
  readonly attachments: readonly PreparedAttachment[]
  readonly hasPreparingTextAttachment: boolean
}

interface SubmitBlockInput {
  readonly payload: AgentSendPayload
  readonly disabled?: boolean
  readonly requiresText: boolean
  readonly projectPath: string | null
  readonly selectedModel: string
}

export function useComposerSubmission({
  onSend,
  onEnqueue,
  isLoading,
  disabled,
  requiresText,
  clearOnSubmit,
  recordHistory,
  allowEnqueue,
  onToast,
  editorRef,
  projectPath,
  attachments,
  hasPreparingTextAttachment,
}: UseComposerSubmissionInput) {
  const input = useComposerStore((s) => s.input)
  const reset = useComposerStore((s) => s.reset)
  const pushHistory = useComposerStore((s) => s.pushHistory)
  const selectedModel = usePreferencesStore((s) => s.settings.selectedModel)
  const enableTranscriptDebug = useUIStore((s) => s.enableTranscriptDebug)

  function clearComposerInput() {
    reset()
    if (editorRef.current) {
      clearEditor(editorRef.current)
    }
  }

  function dispatchPayload(payload: AgentSendPayload) {
    const block = getSubmitBlock({ payload, disabled, requiresText, projectPath, selectedModel })
    if (!block) {
      consumeSendResult(isLoading && allowEnqueue ? onEnqueue(payload) : onSend(payload))
      return true
    }
    if (block.type === 'toast') onToast?.(block.message)
    return false
  }

  function submitPayload(payload: AgentSendPayload) {
    if (payload.text === TRANSCRIPT_DEBUG_UNLOCK_PHRASE) {
      enableTranscriptDebug()
      onToast?.('Transcript debug enabled.')
      if (clearOnSubmit) clearComposerInput()
      return true
    }
    const sent = dispatchPayload(payload)
    if (!sent) return false
    if (recordHistory && payload.text) pushHistory(payload.text)
    if (clearOnSubmit) clearComposerInput()
    return true
  }

  function handleSubmit(text?: string) {
    submitPayload({
      text: (text ?? input).trim(),
      thinkingLevel: FORCED_SEND_THINKING_LEVEL,
      attachments,
      mcpServers: useComposerStore.getState().mcpServers,
    })
  }

  function sendComposed(text: string) {
    return submitPayload({
      text,
      thinkingLevel: FORCED_SEND_THINKING_LEVEL,
      attachments: useComposerStore.getState().attachments,
      mcpServers: useComposerStore.getState().mcpServers,
    })
  }

  function submitCurrentDraft() {
    const state = useComposerStore.getState()
    submitPayload({
      text: state.input.trim(),
      thinkingLevel: FORCED_SEND_THINKING_LEVEL,
      attachments: state.attachments,
      mcpServers: state.mcpServers,
    })
  }

  return {
    input,
    projectPath,
    canSend: canSend({
      input,
      attachments,
      disabled,
      hasPreparingTextAttachment,
      projectPath,
      selectedModel,
      requiresText,
    }),
    handleSubmit,
    sendComposed,
    submitCurrentDraft,
  }
}

function getSubmitBlock({
  payload,
  disabled,
  requiresText,
  projectPath,
  selectedModel,
}: SubmitBlockInput) {
  if (requiresText && !payload.text) return SILENT_SUBMIT_BLOCK
  if (disabled || (!payload.text && payload.attachments.length === 0)) return SILENT_SUBMIT_BLOCK
  if (!projectPath) return toastSubmitBlock('Select a project before sending.')
  if (!selectedModel.trim()) return toastSubmitBlock('Select a model in Settings before sending.')
  return null
}

function toastSubmitBlock(message: string) {
  return { type: 'toast' as const, message }
}

interface CanSendInput {
  readonly input: string
  readonly attachments: readonly PreparedAttachment[]
  readonly disabled?: boolean
  readonly hasPreparingTextAttachment: boolean
  readonly projectPath: string | null
  readonly selectedModel: string
  readonly requiresText: boolean
}

function canSend({
  input,
  attachments,
  disabled,
  hasPreparingTextAttachment,
  projectPath,
  selectedModel,
  requiresText,
}: CanSendInput) {
  const hasSubmitContent = requiresText
    ? input.trim().length > 0
    : input.trim().length > 0 || attachments.length > 0

  return (
    hasSubmitContent &&
    !disabled &&
    !hasPreparingTextAttachment &&
    Boolean(projectPath) &&
    selectedModel.trim().length > 0
  )
}
