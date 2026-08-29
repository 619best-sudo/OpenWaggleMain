import { memo } from 'react'
import { StreamingText } from './StreamingText'

interface ClosingSummaryProps {
  summary: string
}

/**
 * The run's closing summary, rendered as assistant prose.
 *
 * Uses `StreamingText` (never in streaming mode — the summary arrives whole)
 * with the same left inset as `AssistantTextPart`, so the last thing the user
 * reads sits in the transcript exactly like any other assistant paragraph
 * rather than announcing itself as a separate kind of card.
 */
export const ClosingSummary = memo(function ClosingSummary({ summary }: ClosingSummaryProps) {
  if (!summary.trim()) return null

  return (
    <div className="py-1">
      <StreamingText text={summary} className="prose-reading pl-[13px]" />
    </div>
  )
})
