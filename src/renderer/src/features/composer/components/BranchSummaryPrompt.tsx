import { GitBranch, Loader2 } from 'lucide-react'
import { type BranchSummaryPromptMode, useBranchSummaryStore } from '@/features/chat/state'
import { useEscapeHotkey } from '@/shared/hooks/useEscapeHotkey'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'

interface BranchSummaryPromptProps {
  readonly onNoSummary: () => void
  readonly onSummarize: () => void
  readonly onCustomSummary: () => void
  readonly onCancel: () => void
}

function modeCopy(mode: BranchSummaryPromptMode) {
  if (mode === 'custom') {
    return 'Write custom summary instructions in the composer, then press Send.'
  }
  if (mode === 'summarizing') {
    return 'Summarizing the abandoned branch before creating this branch…'
  }
  return 'Keep context from the abandoned branch?'
}

function SummaryButton({
  children,
  disabled,
  onClick,
  variant = 'secondary',
}: {
  readonly children: React.ReactNode
  readonly disabled?: boolean
  readonly onClick: () => void
  readonly variant?: 'primary' | 'secondary' | 'ghost'
}) {
  return (
    <Button
      variant={variant === 'primary' ? 'primary' : variant === 'ghost' ? 'ghost' : 'secondary'}
      size="xs"
      radius="md"
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'h-7 min-w-[76px] px-2.5 text-[11px] shadow-none disabled:cursor-not-allowed disabled:opacity-60',
        variant === 'secondary' &&
          'border-border-light bg-bg-secondary/80 text-text-secondary hover:bg-bg-hover',
        variant === 'ghost' &&
          'min-w-0 px-2 text-text-tertiary hover:bg-bg-hover hover:text-text-secondary',
      )}
    >
      {children}
    </Button>
  )
}

export function BranchSummaryPrompt({
  onNoSummary,
  onSummarize,
  onCustomSummary,
  onCancel,
}: BranchSummaryPromptProps) {
  const prompt = useBranchSummaryStore((state) => state.prompt)
  const mode = prompt?.mode ?? null
  const busy = mode === 'summarizing'

  useEscapeHotkey(onCancel, { enabled: mode !== null && !busy })

  if (!mode) {
    return null
  }

  return (
    <section className="home-panel-frame-soft mb-2 rounded-[var(--radius-panel)] border border-border bg-bg-secondary/70 px-3 py-2.5 text-text-secondary shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-accent/20 bg-accent/10 text-accent">
            <GitBranch className="size-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-text-primary">Branch summary</div>
            <div className="text-[12px] leading-5 text-text-tertiary">{modeCopy(mode)}</div>
          </div>
          {busy ? <Loader2 className="size-3.5 shrink-0 animate-spin text-accent" /> : null}
        </div>

        {mode === 'choice' ? (
          <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
            <SummaryButton onClick={onCancel} variant="ghost">
              Cancel
            </SummaryButton>
            <SummaryButton onClick={onNoSummary}>No summary</SummaryButton>
            <SummaryButton onClick={onCustomSummary}>Custom</SummaryButton>
            <SummaryButton onClick={onSummarize} variant="primary">
              Summarize
            </SummaryButton>
          </div>
        ) : null}

        {mode === 'custom' ? (
          <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
            <SummaryButton onClick={onNoSummary}>No summary</SummaryButton>
            <SummaryButton onClick={onCancel} variant="ghost">
              Cancel
            </SummaryButton>
          </div>
        ) : null}
      </div>
    </section>
  )
}
