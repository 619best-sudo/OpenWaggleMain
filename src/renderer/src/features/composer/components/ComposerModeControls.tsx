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
  readonly machineModeEnabled?: boolean
  readonly machineModeRunning?: boolean
  readonly onSetMachineModeEnabled?: (enabled: boolean) => void
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
  machineModeEnabled,
  machineModeRunning,
  onSetMachineModeEnabled,
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
    machineModeEnabled,
    machineModeRunning,
    onSetMachineModeEnabled,
    onToast,
  }

  return <ComposerToolbar {...toolbarProps} />
}
