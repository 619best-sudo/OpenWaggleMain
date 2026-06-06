import { ArrowUp, Square } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'

interface ComposerSendControlsProps {
  readonly isLoading: boolean
  readonly canSend: boolean
  readonly sendTitle?: string
  readonly onSend: () => void
  readonly onCancel: () => void
}

export function ComposerSendControls({
  isLoading,
  canSend,
  sendTitle,
  onSend,
  onCancel,
}: ComposerSendControlsProps) {
  return (
    <>
      {isLoading ? <CancelRunButton onCancel={onCancel} /> : null}
      <SendMessageButton
        isLoading={isLoading}
        canSend={canSend}
        sendTitle={sendTitle}
        onSend={onSend}
      />
    </>
  )
}

interface CancelRunButtonProps {
  readonly onCancel: () => void
}

function CancelRunButton({ onCancel }: CancelRunButtonProps) {
  return (
    <Button
      variant="unstyled"
      type="button"
      onClick={onCancel}
      className="flex size-8 items-center justify-center rounded-md border border-red-500/35 bg-red-500/10 text-red-500 transition-colors hover:bg-red-500/20"
      title="Cancel"
    >
      <Square className="size-3.5" />
    </Button>
  )
}

interface SendMessageButtonProps {
  readonly isLoading: boolean
  readonly canSend: boolean
  readonly sendTitle?: string
  readonly onSend: () => void
}

function SendMessageButton({ isLoading, canSend, sendTitle, onSend }: SendMessageButtonProps) {
  return (
    <Button
      variant="unstyled"
      type="button"
      onClick={onSend}
      disabled={!canSend}
      className={cn(
        'flex size-8 items-center justify-center rounded-md transition-colors',
        getSendButtonTone(isLoading, canSend),
      )}
      title={sendTitle ?? (isLoading ? 'Add message' : 'Send message')}
    >
      <ArrowUp className={cn('size-4', canSend ? getSendIconTone(isLoading) : 'text-text-muted')} />
    </Button>
  )
}

function getSendButtonTone(isLoading: boolean, canSend: boolean) {
  if (!canSend) return 'bg-white/5 cursor-not-allowed'
  return isLoading
    ? 'border border-[#8ba57b]/35 bg-[#8ba57b]/10 hover:bg-[#8ba57b]/20'
    : 'bg-[#8ba57b] hover:bg-[#9cb88c]'
}

function getSendIconTone(isLoading: boolean) {
  return isLoading ? 'text-[#8ba57b]' : 'text-[#09110a]'
}
