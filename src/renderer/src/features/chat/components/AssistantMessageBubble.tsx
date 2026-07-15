import { matchBy } from '@diegogbrisa/ts-match'
import type { SessionId } from '@shared/types/brand'
import type { UIMessage } from '@shared/types/chat-ui'
import type { SupportedModelId } from '@shared/types/llm'
import type { WaggleAgentColor } from '@shared/types/waggle'
import { GitBranch } from 'lucide-react'
import React from 'react'
import { Button } from '@/shared/ui/Button'
import { useMessageCollapse } from '../hooks/useMessageCollapse'
import { buildReasoningSummaries } from '../lib/reasoning-summary'
import { AgentLabel } from './AgentLabel'
import { CollapsibleDetails } from './CollapsibleDetails'
import { StreamingText } from './StreamingText'
import { ToolCallRouter } from './ToolCallRouter'

const JSON_STRINGIFY_INDENT = 2
const REASONING_TIMER_TICK_MS = 1_000
const REASONING_ENCOURAGEMENT_INTERVAL_MS = 45_000
const DEBUG_SERVER_URL = 'http://127.0.0.1:7777/event'
const DEBUG_RUN_ID = 'post-fix'
const REASONING_ENCOURAGEMENTS = [
  'Taking a little longer to understand the code better.',
  'A deeper pass now usually leads to a cleaner execution.',
  'Working carefully through the context to avoid shallow fixes.',
  'Staying thorough here helps the next steps land more reliably.',
] as const

export interface WaggleInfo {
  agentLabel: string
  agentColor: WaggleAgentColor
}

function stringifyToolResultContent(content: unknown) {
  if (typeof content === 'string') {
    return content
  }

  try {
    return JSON.stringify(content, null, JSON_STRINGIFY_INDENT)
  } catch {
    return String(content)
  }
}

function getMessageCreatedAtMs(message: UIMessage) {
  if (message.createdAt instanceof Date) {
    return Number.isFinite(message.createdAt.getTime()) ? message.createdAt.getTime() : null
  }

  return null
}

function formatElapsedTimer(elapsedMs: number) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1_000))
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)

  if (hours > 0) {
    return `${String(hours)}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function getReasoningEncouragement(elapsedMs: number) {
  const intervalIndex = Math.floor(elapsedMs / REASONING_ENCOURAGEMENT_INTERVAL_MS) - 1
  if (intervalIndex < 0) {
    return null
  }

  return (
    REASONING_ENCOURAGEMENTS[
      Math.min(intervalIndex, REASONING_ENCOURAGEMENTS.length - 1)
    ] ?? null
  )
}

function StandaloneToolResult({
  content,
  state,
}: {
  readonly content: unknown
  readonly state: string
}) {
  return (
    <div className="home-panel-frame-soft rounded-lg bg-bg-secondary p-3 text-[13px] text-text-secondary">
      <div className="mb-2 text-[11px] uppercase tracking-wide text-text-tertiary">
        Tool result · {state}
      </div>
      <StreamingText text={stringifyToolResultContent(content)} />
    </div>
  )
}

function BranchFromMessageButton({
  messageId,
  onBranchFromMessage,
  className,
}: {
  readonly messageId: string
  readonly onBranchFromMessage: (messageId: string) => void
  readonly className: string
}) {
  return (
    <Button
      variant="unstyled"
      type="button"
      title="Branch from message"
      onClick={() => onBranchFromMessage(messageId)}
      className={className}
    >
      <GitBranch className="size-3.5" />
    </Button>
  )
}

interface AssistantMessageBubbleProps {
  message: UIMessage
  isStreaming?: boolean
  isRunActive?: boolean
  assistantModel?: SupportedModelId
  sessionId: SessionId | null
  waggle?: WaggleInfo
  hideAgentLabel?: boolean
  onBranchFromMessage?: (messageId: string) => void
}

export function AssistantMessageBubble({
  message,
  isStreaming,
  isRunActive,
  sessionId,
  waggle,
  hideAgentLabel,
  onBranchFromMessage,
}: AssistantMessageBubbleProps) {
  const collapse = useMessageCollapse(message, isStreaming, isRunActive, !!waggle)
  const reasoningSummaries = buildReasoningSummaries(message.parts, !!isStreaming)
  const hasRunningReasoning = reasoningSummaries.some((summary) => summary.isRunning)
  const activeReasoningSummaryId = React.useMemo(() => {
    for (let index = reasoningSummaries.length - 1; index >= 0; index -= 1) {
      const summary = reasoningSummaries[index]
      if (summary?.isRunning) {
        return summary.id
      }
    }
    return null
  }, [reasoningSummaries])
  const messageCreatedAtMs = React.useMemo(() => getMessageCreatedAtMs(message), [message.createdAt])
  const [reasoningElapsedMs, setReasoningElapsedMs] = React.useState(0)

  React.useEffect(() => {
    if (!hasRunningReasoning || messageCreatedAtMs == null) {
      setReasoningElapsedMs(0)
      return
    }

    const tick = () => {
      setReasoningElapsedMs(Math.max(0, Date.now() - messageCreatedAtMs))
    }

    tick()
    const interval = window.setInterval(tick, REASONING_TIMER_TICK_MS)
    return () => window.clearInterval(interval)
  }, [hasRunningReasoning, messageCreatedAtMs, message.id])

  const reasoningElapsedLabel = formatElapsedTimer(reasoningElapsedMs)
  const reasoningEncouragement = getReasoningEncouragement(reasoningElapsedMs)
  const reasoningCheckpoint = Math.floor(reasoningElapsedMs / REASONING_ENCOURAGEMENT_INTERVAL_MS)

  React.useEffect(() => {
    // #region debug-point A:reasoning-running-state
    void fetch(DEBUG_SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'permission-transcript-shift',
        runId: DEBUG_RUN_ID,
        hypothesisId: 'A',
        location: 'AssistantMessageBubble.tsx:reasoningEffect',
        msg: hasRunningReasoning
          ? '[DEBUG] Assistant reasoning status is running'
          : '[DEBUG] Assistant reasoning status is idle',
        data: {
          messageId: message.id,
          summaryCount: reasoningSummaries.length,
          activeReasoningSummaryId,
          reasoningElapsedLabel: hasRunningReasoning ? formatElapsedTimer(reasoningCheckpoint * REASONING_ENCOURAGEMENT_INTERVAL_MS) : null,
          hasEncouragement: Boolean(reasoningEncouragement),
          reasoningCheckpoint,
        },
        ts: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
  }, [
    activeReasoningSummaryId,
    hasRunningReasoning,
    message.id,
    reasoningCheckpoint,
    reasoningEncouragement,
    reasoningSummaries.length,
  ])

  const toolResults = new Map<
    string,
    { content: unknown; state: string; sourceMessageId?: string; error?: string }
  >()
  const messageToolCallIds = new Set<string>()
  for (const part of message.parts) {
    if (part.type === 'tool-call') {
      messageToolCallIds.add(part.id)
      continue
    }

    if (part.type === 'tool-result') {
      toolResults.set(part.toolCallId, {
        content: part.content,
        state: part.state,
        sourceMessageId: part.sourceMessageId,
        error: part.error,
      })
    }
  }

  return (
    <div className="group/assistant-msg relative w-full">
      {hideAgentLabel && onBranchFromMessage ? (
        <BranchFromMessageButton
          messageId={message.id}
          onBranchFromMessage={onBranchFromMessage}
          className="absolute right-0 top-0 opacity-0 group-hover/assistant-msg:opacity-100 transition-opacity text-text-muted hover:text-text-secondary"
        />
      ) : null}
      <div className="flex flex-col gap-2">
        {!hideAgentLabel ? (
          <div className="flex items-center justify-between gap-2">
            <AgentLabel waggle={waggle} />
            {onBranchFromMessage ? (
              <BranchFromMessageButton
                messageId={message.id}
                onBranchFromMessage={onBranchFromMessage}
                className="ml-auto opacity-0 group-hover/assistant-msg:opacity-100 transition-opacity text-text-muted hover:text-text-secondary"
              />
            ) : null}
          </div>
        ) : null}

        {reasoningSummaries.length > 0 ? (
          <div
            data-testid="reasoning-summary-list"
            className="flex flex-col gap-1.5 mb-1"
          >
            {reasoningSummaries.map((summary) => {
              const showRunningStatus =
                summary.isRunning && summary.id === activeReasoningSummaryId

              return (
                <div
                  key={summary.id}
                  data-testid="reasoning-summary"
                  className="animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[15px] font-semibold leading-6 tracking-[-0.008em] text-transcript-heading">
                      {summary.text}
                    </span>
                    {showRunningStatus ? (
                      <span className="inline-flex min-w-[64px] items-center justify-center gap-1.5 rounded-full bg-bg-secondary/70 px-2 py-0.5 text-[11px] font-medium leading-4 text-text-secondary/85">
                        <span
                          aria-hidden="true"
                          className="size-1.5 rounded-full bg-current/55 animate-[pulse_2.8s_ease-in-out_infinite] motion-reduce:animate-none"
                        />
                        <span data-testid="reasoning-summary-timer" className="tabular-nums">
                          {reasoningElapsedLabel}
                        </span>
                      </span>
                    ) : null}
                  </div>
                  {showRunningStatus ? (
                    <div className="mt-1 min-h-4 text-[11px] leading-4 text-text-tertiary">
                      {reasoningEncouragement ? (
                        <span data-testid="reasoning-summary-note">{reasoningEncouragement}</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : null}

        {message.parts.map((part, i) => {
          const divider =
            collapse.canCollapseDetails && i === collapse.lastRenderableTextPartIndex ? (
              <CollapsibleDetails
                key={`${message.id}-divider`}
                showDetails={collapse.showDetails}
                collapseLabel={collapse.collapseLabel}
                onToggle={collapse.toggleDetails}
              />
            ) : null

          const content =
            !collapse.renderAllParts && i !== collapse.lastRenderableTextPartIndex
              ? null
              : matchBy(part, 'type')
                  .with('text', (value) =>
                    value.content.trim() ? (
                      <StreamingText
                        key={`${message.id}-text-${String(i)}`}
                        text={value.content}
                        isStreaming={!!isStreaming}
                      />
                    ) : null,
                  )
                  .with('tool-call', (value) => (
                    <ToolCallRouter
                      key={`tool-${value.id}`}
                      part={value}
                      toolResults={toolResults}
                      sessionId={sessionId}
                      isStreaming={!!isStreaming}
                      onBranchFromMessage={onBranchFromMessage}
                    />
                  ))
                  .with('thinking', () => null)
                  .with('tool-result', (value) =>
                    messageToolCallIds.has(value.toolCallId) ? null : (
                      <StandaloneToolResult content={value.content} state={value.state} />
                    ),
                  )
                  .otherwise(() => null)

          if (divider !== null || content !== null) {
            return (
              <React.Fragment key={`${message.id}-part-${String(i)}`}>
                {divider}
                {content}
              </React.Fragment>
            )
          }
          return null
        })}
      </div>
    </div>
  )
}
