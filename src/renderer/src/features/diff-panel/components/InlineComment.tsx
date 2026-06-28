import { MessageSquare, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/shared/ui/Button'
import { Textarea } from '@/shared/ui/Textarea'

interface InlineCommentProps {
  startLine: number
  endLine: number
  onAddSingleComment: (content: string) => void
  onAddToReview: (content: string) => void
  onCancel: () => void
}

export function InlineComment({
  startLine,
  endLine,
  onAddSingleComment,
  onAddToReview,
  onCancel,
}: InlineCommentProps) {
  const [content, setContent] = useState('')

  const lineLabel = startLine === endLine ? `line ${startLine}` : `lines ${startLine}-${endLine}`

  function handleAddSingle() {
    if (!content.trim()) return
    onAddSingleComment(content.trim())
    setContent('')
  }

  function handleAddToReview() {
    if (!content.trim()) return
    onAddToReview(content.trim())
    setContent('')
  }

  return (
    <div className="max-w-full w-[min(100%,680px)] border-y border-border bg-diff-header-bg px-3 py-2">
      <div className="flex min-w-0 w-full flex-col gap-2">
        {/* Comment Meta */}
        <div className="flex h-[18px] items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <MessageSquare className="size-[11px] shrink-0 text-text-tertiary" />
            <span className="truncate text-[11px] font-medium text-text-secondary">
              Comment on {lineLabel}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            radius="full"
            onClick={onCancel}
            aria-label="Dismiss comment"
            className="h-5 w-5 shrink-0 text-text-tertiary hover:bg-bg-hover hover:text-text-secondary"
          >
            <X className="size-3" />
          </Button>
        </div>

        {/* Comment Editor */}
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel()
          }}
          placeholder="Leave feedback on this change…"
          resize="none"
          className="h-[58px] w-full min-w-0 rounded-md border-button-border bg-diff-bg px-2.5 text-[12px] text-text-primary placeholder:text-text-tertiary focus:border-accent/50"
        />

        {/* Actions */}
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <Button
            variant="primary"
            size="xs"
            onClick={handleAddSingle}
            disabled={!content.trim()}
            className="h-[26px]"
          >
            Add single comment
          </Button>
          <Button
            variant="secondary"
            size="xs"
            onClick={handleAddToReview}
            disabled={!content.trim()}
            className="h-[26px]"
          >
            Add to review
          </Button>
        </div>
      </div>
    </div>
  )
}
