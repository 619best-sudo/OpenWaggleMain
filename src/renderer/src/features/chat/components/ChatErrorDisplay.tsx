import { classifyErrorMessage } from '@shared/types/errors'
import { AlertCircle, X } from 'lucide-react'
import {
  clearLastAgentErrorInfo,
  getLastAgentErrorInfo,
} from '@/features/chat/lib/agent-error-store'

interface ChatErrorDisplayProps {
  error: Error
  dismissedError: string | null
  sessionId: string | null
  onDismiss: (message: string) => void
}

function resolveErrorInfo(error: Error, sessionId: string | null) {
  if (sessionId) {
    const stored = getLastAgentErrorInfo(sessionId)
    if (stored) return stored
  }
  return classifyErrorMessage(error.message)
}

export function ChatErrorDisplay({
  error,
  dismissedError,
  sessionId,
  onDismiss,
}: ChatErrorDisplayProps) {
  if (dismissedError === error.message) return null

  const info = resolveErrorInfo(error, sessionId)

  function handleDismiss() {
    if (sessionId) clearLastAgentErrorInfo(sessionId)
    onDismiss(error.message)
  }

  return (
    <div className="home-panel-frame-soft my-3 rounded-2xl border border-error/18 bg-linear-to-br from-error/[0.12] via-error/[0.08] to-transparent px-4 py-3 text-text-secondary shadow-sm backdrop-blur-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-error/18 bg-error/[0.08] text-error">
          <AlertCircle className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold tracking-[0.01em] text-error">
            {info.userMessage}
          </p>
          {info.suggestion && (
            <p className="mt-1 text-[12px] leading-5 text-text-secondary/88">{info.suggestion}</p>
          )}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss error notice"
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/40"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
