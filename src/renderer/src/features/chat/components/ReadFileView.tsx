/**
 * A `read` result rendered as a file plus collapsible harness reasoning.
 *
 * The harness appends its commentary about a file (region map, reuse notes,
 * NEXT FILE pointer) to the numbered bytes in the same text block. Shown
 * through the numbered viewer, that reasoning arrived as the file's last rows
 * and read as though the file itself contained it. The caller splits it out
 * (`getToolResultParts`); this view keeps only the bytes in the code panel and
 * floats a "Show reasoning" pill in the panel's bottom-right corner. Clicking
 * it expands the reasoning below the file as plain prose — no strip, no
 * labelled section, nothing that competes with the file itself.
 */
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { FileContentView } from './FileContentView'

/** Icon weight matching the uppercase badges in the tool-strip headers. */
const BADGE_ICON_STROKE_WIDTH = 2.25

export function ReadFileView({
  body,
  reasoning,
  concernSet,
  maxHeight,
  path,
}: {
  readonly body: string
  readonly reasoning: string
  readonly concernSet?: ReadonlySet<number>
  readonly maxHeight: number
  readonly path?: string | null
}) {
  const [showReasoning, setShowReasoning] = useState(false)
  const hasReasoning = reasoning.trim().length > 0

  return (
    <>
      <div className="relative">
        <FileContentView
          content={body}
          variant="default"
          concernSet={concernSet}
          maxHeight={maxHeight}
          path={path}
        />
        {hasReasoning && (
          <Button
            variant="unstyled"
            type="button"
            aria-expanded={showReasoning}
            onClick={(event) => {
              // The read card may sit inside a collapsible strip; the pill
              // toggles only the reasoning, never the strip.
              event.stopPropagation()
              setShowReasoning((value) => !value)
            }}
            className={cn(
              // Floats over the panel's bottom-right corner, not a row of its
              // own — the file owns the frame; this is just an affordance.
              'absolute bottom-2 right-2 z-20 inline-flex items-center gap-1',
              'rounded-full border border-code-view-border bg-bg-secondary/95 px-2 py-0.5',
              'text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted',
              'shadow-lg backdrop-blur-sm transition-colors hover:bg-bg-hover hover:text-text-secondary',
            )}
          >
            <ChevronDown
              className={cn(
                'size-3 shrink-0 transition-transform',
                showReasoning ? 'rotate-180' : '-rotate-90',
              )}
              strokeWidth={BADGE_ICON_STROKE_WIDTH}
            />
            {showReasoning ? 'Hide' : 'Show reasoning'}
          </Button>
        )}
      </div>
      {hasReasoning && showReasoning && (
        <div className="px-3 py-2 text-[11px] leading-[1.5] whitespace-pre-wrap break-words text-text-tertiary">
          {reasoning}
        </div>
      )}
    </>
  )
}
