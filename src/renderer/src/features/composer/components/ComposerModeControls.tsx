import type { RefObject } from 'react'
import type { VoiceCaptureController } from '../hooks/useVoiceCapture'
import { ComposerToolbar } from './ComposerToolbar'
import { VoiceRecorder } from './VoiceRecorder'

interface ComposerModeControlsProps {
  readonly fileInputRef: RefObject<HTMLInputElement | null>
  readonly voice: VoiceCaptureController
  readonly onSubmit: () => void
  readonly onCancel: () => void
  readonly isLoading: boolean
  readonly canSend: boolean
  readonly sendTitle?: string
  readonly onToast?: (message: string) => void
}

export function ComposerModeControls({
  fileInputRef,
  voice,
  onSubmit,
  onCancel,
  isLoading,
  canSend,
  sendTitle,
  onToast,
}: ComposerModeControlsProps) {
  if (voice.isActive) {
    return <VoiceRecorder fileInputRef={fileInputRef} voice={voice} />
  }

  const toolbarProps = {
    onSend: onSubmit,
    onCancel,
    isLoading,
    canSend,
    onToggleVoice: voice.toggleVoice,
    voiceMode: voice.mode,
    fileInputRef,
    sendTitle,
    onToast,
  }

  return <ComposerToolbar {...toolbarProps} />
}
