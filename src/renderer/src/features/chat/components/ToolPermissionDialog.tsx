import { X, Check, Ban } from 'lucide-react'
import type { PendingToolPermissionRequest } from '@/features/chat/lib/tool-permission-request'
import { Button } from '@/shared/ui/Button'

interface ToolPermissionDialogProps {
  readonly request: PendingToolPermissionRequest
  readonly busy: boolean
  readonly error: string | null
  readonly onClose: () => void
  readonly onApprove: () => Promise<void>
  readonly onDeny: () => Promise<void>
}

function renderInputPreview(input: PendingToolPermissionRequest['input']) {
  if (typeof input.command === 'string' && input.command.trim().length > 0) {
    return input.command.trim().replace(/\s+/g, ' ')
  }
  if (typeof input.path === 'string' && input.path.trim().length > 0) {
    return input.path.trim()
  }
  return JSON.stringify(input)
}

export function ToolPermissionDialog({
  request,
  busy,
  error,
  onClose,
  onApprove,
  onDeny,
}: ToolPermissionDialogProps) {
  const preview = renderInputPreview(request.input)

  return (
    <div className="bg-bg px-5 pb-2 pt-1.5">
      <div className="mx-auto w-full max-w-[960px]">
        <div className="rounded-none rounded-tl-md rounded-tr-md border-x border-t border-border/40 bg-bg-secondary p-3.5 shadow-none">
          <div className="mb-2.5 flex items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-text-primary">
              Permission
            </p>
            <span className="rounded-md bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning-foreground">
              {request.toolName}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate rounded-md border border-border/20 bg-bg px-3 py-2.5 font-mono text-[12px] text-[color:var(--color-code-card-text)]">
                {preview}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="secondary" size="sm" radius="md" onClick={() => void onDeny()} disabled={busy}>
                <Ban className="size-3.5" />
                Deny
              </Button>
              <Button variant="primary" size="sm" radius="md" onClick={() => void onApprove()} disabled={busy}>
                <Check className="size-3.5" />
                {busy ? 'Continuing...' : 'Approve'}
              </Button>
              <div className="ml-1 flex items-center border-l border-border/40 pl-3">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  radius="md"
                  aria-label="Dismiss permission dialog"
                  title="Dismiss"
                  onClick={onClose}
                  disabled={busy}
                >
                  <X className="size-4 text-text-tertiary hover:text-text-secondary" />
                </Button>
              </div>
            </div>
          </div>
          {error ? <p className="mt-2 text-[11px] text-error">{error}</p> : null}
        </div>
      </div>
    </div>
  )
}
