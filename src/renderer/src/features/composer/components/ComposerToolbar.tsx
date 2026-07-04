import type { RefObject } from 'react'
import turingLogo from '../../../../../assets/new-logo.png'
import { cn } from '@/shared/lib/cn'
import { ToggleSwitch } from '@/shared/ui/ToggleSwitch'
import { BranchPicker } from './BranchPicker'
import { ComposerAttachButton } from './ComposerAttachButton'
import { ComposerSendControls } from './ComposerSendControls'
import { ComposerVoiceButton } from './ComposerVoiceButton'
import { ContextMeter } from './ContextMeter'

interface ComposerToolbarProps {
  readonly onSend: () => void
  readonly onCancel: () => void
  readonly isLoading: boolean
  readonly canSend: boolean
  readonly onToggleVoice: () => void
  readonly voiceMode: 'idle' | 'recording' | 'transcribing'
  readonly fileInputRef: RefObject<HTMLInputElement | null>
  readonly sendTitle?: string
  readonly machineModeEnabled?: boolean
  readonly machineModeRunning?: boolean
  readonly onSetMachineModeEnabled?: (enabled: boolean) => void
  readonly onToast?: (message: string) => void
}

export function ComposerToolbar({
  onSend,
  onCancel,
  isLoading,
  canSend,
  onToggleVoice,
  voiceMode,
  fileInputRef,
  sendTitle,
  machineModeEnabled = false,
  machineModeRunning = false,
  onSetMachineModeEnabled,
  onToast,
}: ComposerToolbarProps) {
  return (
    <div className="flex h-11 min-w-0 items-center justify-between gap-2 px-4">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <ComposerAttachButton fileInputRef={fileInputRef} />
        <BranchPicker onToast={onToast} />
        {onSetMachineModeEnabled ? (
          <div
            className={cn(
              'ml-1 flex h-6 shrink items-center gap-2 rounded-[5px] px-2 transition-all duration-500',
              machineModeRunning
                ? 'animate-pulse border border-border-light bg-bg-secondary'
                : machineModeEnabled
                  ? 'border border-border-light bg-bg-secondary'
                  : 'home-panel-frame-soft bg-transparent hover:bg-bg-hover'
            )}
          >
            <img
              src={turingLogo}
              alt=""
              aria-hidden="true"
              className="size-4 shrink-0 rounded-[2px] object-cover"
            />
            <span
              className={cn(
                'text-[12px] transition-colors duration-300',
                machineModeEnabled ? 'font-bold tracking-wide text-text-primary' : 'text-text-secondary'
              )}
            >
              Machine mode
            </span>
            <ToggleSwitch
              checked={machineModeEnabled}
              onCheckedChange={onSetMachineModeEnabled}
              label="Enable machine mode"
              size="compact"
              disabled={machineModeRunning || isLoading}
              className={cn(
                '!shadow-none',
                machineModeEnabled
                  ? '!border-border-light !bg-bg-tertiary [&>span]:bg-text-primary'
                  : '!border-border !bg-bg-hover'
              )}
            />
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <ContextMeter />
        <ComposerVoiceButton mode={voiceMode} onToggleVoice={onToggleVoice} />
        <ComposerSendControls
          isLoading={isLoading}
          canSend={canSend}
          sendTitle={sendTitle}
          onSend={onSend}
          onCancel={onCancel}
        />
      </div>
    </div>
  )
}
