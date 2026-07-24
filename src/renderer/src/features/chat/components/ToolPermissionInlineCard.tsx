import type { PendingToolPermissionRequest } from '@/features/chat/lib/tool-permission-request'
import { Button } from '@/shared/ui/Button'

interface ToolPermissionInlineCardProps {
  readonly request: PendingToolPermissionRequest
  readonly busy: boolean
  readonly error: string | null
  readonly onApprove: () => Promise<void>
  readonly onDeny: () => Promise<void>
}

const COMPLEXITY_CHIP_CLASS: Record<'low' | 'medium' | 'high', string> = {
  low: 'bg-bg-secondary/60 text-text-tertiary',
  medium: 'bg-warning/15 text-warning',
  high: 'bg-error/15 text-error',
}

const COMPLEXITY_SOURCE_LABEL: Record<string, string> = {
  'prepare-file': 'from Prepare',
  'plan-task': 'from Plan',
  estimated: 'estimated',
}

/** A small pill showing the call's complexity rating and where it came from
 *  (inherited from Prepare's per-file rating / Plan's per-task rating, or freshly
 *  estimated). Renders nothing when the harness didn't attach a rating. */
function ComplexityChip({ request }: { request: PendingToolPermissionRequest }) {
  const rating = request.complexityRating
  if (rating !== 'low' && rating !== 'medium' && rating !== 'high') return null
  const source =
    request.complexitySource &&
    Object.prototype.hasOwnProperty.call(COMPLEXITY_SOURCE_LABEL, request.complexitySource)
      ? COMPLEXITY_SOURCE_LABEL[request.complexitySource as keyof typeof COMPLEXITY_SOURCE_LABEL]
      : undefined
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium leading-[1.4] ${COMPLEXITY_CHIP_CLASS[rating]}`}
      title={
        source
          ? `Estimated complexity: ${rating} (${source})`
          : `Estimated complexity: ${rating}`
      }
    >
      {rating}
      {source ? <span className="font-normal opacity-70">· {source}</span> : null}
    </span>
  )
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

function renderPermissionPrompt(request: PendingToolPermissionRequest, preview: string) {
  const trimmedPreview = preview.trim()
  if (typeof request.input.command === 'string' && trimmedPreview.length > 0) {
    return (
      <>
        Allow <span className="font-semibold text-text-primary">{request.toolName}</span> to run{' '}
        <span className="rounded-[6px] border border-border/40 bg-bg-primary/80 px-1.5 py-0.5 font-mono text-[14px] font-medium leading-[1.5] text-text-primary shadow-[0_1px_1px_rgba(0,0,0,0.02)] dark:shadow-none">
          {trimmedPreview}
        </span>
        ?
      </>
    )
  }
  if (trimmedPreview.length > 0) {
    return (
      <>
        Allow <span className="font-semibold text-text-primary">{request.toolName}</span> to access{' '}
        <span className="rounded-[6px] border border-border/40 bg-bg-primary/80 px-1.5 py-0.5 font-mono text-[14px] font-medium leading-[1.5] text-text-primary shadow-[0_1px_1px_rgba(0,0,0,0.02)] dark:shadow-none">
          {trimmedPreview}
        </span>
        ?
      </>
    )
  }
  return (
    <>
      Allow <span className="font-semibold text-text-primary">{request.toolName}</span> to continue?
    </>
  )
}

export function ToolPermissionInlineCard({
  request,
  busy,
  error,
  onApprove,
  onDeny,
}: ToolPermissionInlineCardProps) {
  const preview = renderInputPreview(request.input)
  const prompt = renderPermissionPrompt(request, preview)

  return (
    <div className="relative overflow-hidden rounded-[18px] bg-bg-primary p-[3px] shadow-sm ring-1 ring-border/40">
      <div className="flex items-center justify-between gap-3 rounded-[15px] bg-bg-secondary/20 px-3.5 py-2.5 ring-1 ring-inset ring-border/20">
        <div className="min-w-0 flex-1 text-[14px] leading-[1.5] text-text-secondary">{prompt}</div>
        <div className="flex shrink-0 items-center gap-1.5">
          <ComplexityChip request={request} />
          <Button
            variant="ghost"
            size="sm"
            className="h-[32px] rounded-full px-3.5 text-[14px] font-medium hover:bg-bg-hover hover:text-text-primary"
            onClick={() => void onDeny()}
            disabled={busy}
          >
            Deny
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="h-[32px] rounded-full px-3.5 text-[14px] font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
            onClick={() => void onApprove()}
            disabled={busy}
          >
            {busy ? 'Approving...' : 'Approve'}
          </Button>
        </div>
      </div>
      {error ? <div className="mt-1.5 px-3 pb-1 text-[14px] leading-[1.5] text-error">{error}</div> : null}
    </div>
  )
}
