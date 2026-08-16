import { matchBy } from '@diegogbrisa/ts-match'
import type { SessionBranchId, SessionId } from '@shared/types/brand'
import type { UIMessage } from '@shared/types/chat-ui'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { useEventCallback } from '@/shared/lib/use-event-callback'
import { Button } from '@/shared/ui/Button'
import { useUIStore } from '@/shell/ui-store'
import { useChatScrollBehaviour } from '../hooks/useChatScrollBehaviour'
import type { ChatRow } from '../lib/types-chat-row'
import type { ChatTranscriptSectionState } from '../model'
import { ChatRowRenderer } from './ChatRowRenderer'
import { PlanReviewCard } from './PlanReviewCard'
import { ScrollToBottomButton } from './ScrollToBottomButton'
import { ToolPermissionInlineCard } from './ToolPermissionInlineCard'
import { UserQuestionCard } from './UserQuestionCard'
import { WelcomeScreen } from './WelcomeScreen'

const PADDING_TOP = 20

interface ChatTranscriptProps {
  readonly section: ChatTranscriptSectionState
}

/**
 * Every handler the rows receive must keep a stable identity — `ChatRowRenderer`
 * is memoized, and an inline arrow would re-render the whole transcript on each
 * streamed token.
 */
interface TranscriptRowHandlers {
  readonly onOpenSettings: () => void
  readonly onRetry: (content: string) => void
  readonly onApproveMachinePlan: () => Promise<void>
  readonly onDiscardMachinePlan: () => Promise<void>
  readonly onDismissError: (errorId: string | null) => void
  readonly onDismissInterruptedRun: (runId: string, branchId: SessionBranchId) => void
  readonly onBranchFromMessage: (messageId: string) => void
  readonly onForkFromMessage: (messageId: string) => void
}

function useTranscriptRowHandlers(section: ChatTranscriptSectionState): TranscriptRowHandlers {
  const onRetry = useEventCallback((content: string) => {
    void section.onRetryText(content)
  })
  const onOpenSettings = useEventCallback(() => section.onOpenSettings())
  const onApproveMachinePlan = useEventCallback(() => section.onApproveMachinePlan())
  const onDiscardMachinePlan = useEventCallback(() => section.onDiscardMachinePlan())
  const onDismissError = useEventCallback((errorId: string | null) =>
    section.onDismissError(errorId),
  )
  const onDismissInterruptedRun = useEventCallback((runId: string, branchId: SessionBranchId) =>
    section.onDismissInterruptedRun(runId, branchId),
  )
  const onBranchFromMessage = useEventCallback((messageId: string) =>
    section.onBranchFromMessage(messageId),
  )
  const onForkFromMessage = useEventCallback((messageId: string) =>
    section.onForkFromMessage(messageId),
  )

  return useMemo(
    () => ({
      onOpenSettings,
      onRetry,
      onApproveMachinePlan,
      onDiscardMachinePlan,
      onDismissError,
      onDismissInterruptedRun,
      onBranchFromMessage,
      onForkFromMessage,
    }),
    [
      onOpenSettings,
      onRetry,
      onApproveMachinePlan,
      onDiscardMachinePlan,
      onDismissError,
      onDismissInterruptedRun,
      onBranchFromMessage,
      onForkFromMessage,
    ],
  )
}

function getChatRowKey(row: ChatRow) {
  return matchBy(row, 'type')
    .with('message', (value) => `message:${value.message.id}`)
    .with('waggle-turn', (value) => value.id)
    .with('phase', (value) => value.id)
    .with('machine-timeline', (value) => value.id)
    .with('interrupted-run', (value) => `interrupted-run:${value.runId}`)
    .with('branch-summary', (value) => `branch-summary:${value.id}`)
    .with('compaction-summary', (value) => `compaction:${value.id}`)
    .with('phase-indicator', (value) => `phase:${value.label}`)
    .with('run-summary', (value) => `run-summary:${String(value.totalMs)}`)
    .with('error', (value) => `error:${value.sessionId ?? 'none'}:${value.error.message}`)
    .exhaustive()
}

// ─── Row Rendering ──────────────────────────────────────────

interface RenderTranscriptRowsParams {
  rows: ChatRow[]
  activeSessionId: SessionId | null
  handlers: TranscriptRowHandlers
  pendingUserQuestionRequest: ChatTranscriptSectionState['pendingUserQuestionRequest']
  onResolveUserQuestion: ChatTranscriptSectionState['onResolveUserQuestion']
  pendingPlanReviewRequest: ChatTranscriptSectionState['pendingPlanReviewRequest']
  planReviewDecision: ChatTranscriptSectionState['planReviewDecision']
  onResolvePlanReview: ChatTranscriptSectionState['onResolvePlanReview']
  planReviewProjectPath: ChatTranscriptSectionState['planReviewProjectPath']
  pendingToolPermissionRequest: ChatTranscriptSectionState['pendingToolPermissionRequest']
  toolPermissionBusy: ChatTranscriptSectionState['toolPermissionBusy']
  toolPermissionError: ChatTranscriptSectionState['toolPermissionError']
  onApproveToolPermission: ChatTranscriptSectionState['onApproveToolPermission']
  onDenyToolPermission: ChatTranscriptSectionState['onDenyToolPermission']
}

// Trailing row types that should stay *below* any inline popup (loader, run
// summary, error). Inline permission / user-question cards are spliced in
// before this tail so they always appear above the gif loader.
const TAIL_ROW_TYPES = new Set<ChatRow['type']>(['phase-indicator', 'run-summary', 'error'])

function splitTailStatusRows(rows: readonly ChatRow[]) {
  let splitIndex = rows.length
  while (splitIndex > 0 && TAIL_ROW_TYPES.has(rows[splitIndex - 1]?.type as ChatRow['type'])) {
    splitIndex -= 1
  }
  return { head: rows.slice(0, splitIndex), tail: rows.slice(splitIndex) }
}

function rowWrapper(
  key: string,
  index: number,
  children: ReactNode,
  extraProps?: Record<string, string>,
) {
  return (
    <div
      key={key}
      className="mx-auto w-full max-w-[960px] px-5 pb-6"
      style={index === 0 ? { paddingTop: PADDING_TOP } : undefined}
      {...extraProps}
    >
      {children}
    </div>
  )
}

function TranscriptRows(params: RenderTranscriptRowsParams) {
  const {
    rows,
    activeSessionId,
    handlers,
    pendingUserQuestionRequest,
    onResolveUserQuestion,
    pendingPlanReviewRequest,
    planReviewDecision,
    onResolvePlanReview,
    planReviewProjectPath,
    pendingToolPermissionRequest,
    toolPermissionBusy,
    toolPermissionError,
    onApproveToolPermission,
    onDenyToolPermission,
  } = params

  const { head, tail } = splitTailStatusRows(rows)
  const inlinePopupIndex = head.length

  const renderRow = (row: ChatRow, index: number) => {
    const isUserMessage = row.type === 'message' && row.message.role === 'user'
    return rowWrapper(
      getChatRowKey(row),
      index,
      <ChatRowRenderer
        row={row}
        sessionId={activeSessionId}
        onOpenSettings={handlers.onOpenSettings}
        onRetry={handlers.onRetry}
        onApproveMachinePlan={handlers.onApproveMachinePlan}
        onDiscardMachinePlan={handlers.onDiscardMachinePlan}
        onDismissError={handlers.onDismissError}
        onDismissInterruptedRun={handlers.onDismissInterruptedRun}
        onBranchFromMessage={handlers.onBranchFromMessage}
        onForkFromMessage={handlers.onForkFromMessage}
        pendingUserQuestionRequest={pendingUserQuestionRequest}
        onResolveUserQuestion={onResolveUserQuestion}
      />,
      isUserMessage ? { 'data-user-message-id': row.message.id } : undefined,
    )
  }

  // Inline popups (tool permission, user question) render above the trailing
  // status rows (loader / run summary / error) so they're never buried under
  // the gif loader.
  // Returns one node per pending popup — plural on purpose: a plan review can be
  // pending at the same time as a tool permission, and every pending popup must
  // reach the screen or the run blocks on a card the user never sees.
  const renderInlinePopups = (startIndex: number) => {
    let index = startIndex
    const nodes: ReactNode[] = []
    if (pendingToolPermissionRequest) {
      nodes.push(
        rowWrapper(
          `tool-permission:${pendingToolPermissionRequest.toolCallId}`,
          index++,
          <ToolPermissionInlineCard
            request={pendingToolPermissionRequest}
            busy={toolPermissionBusy}
            error={toolPermissionError}
            onApprove={onApproveToolPermission}
            onDeny={onDenyToolPermission}
          />,
        ),
      )
    }
    // Plan review sits above any user question: the plan is the bigger decision,
    // and it gates whether the rest of the run happens at all.
    if (pendingPlanReviewRequest) {
      nodes.push(
        rowWrapper(
          `plan-review:${pendingPlanReviewRequest.planReviewId}`,
          index++,
          <PlanReviewCard
            request={pendingPlanReviewRequest}
            decision={planReviewDecision}
            onResolve={onResolvePlanReview}
            projectPath={planReviewProjectPath}
            busy={toolPermissionBusy}
          />,
        ),
      )
    }
    if (pendingUserQuestionRequest) {
      nodes.push(
        rowWrapper(
          `user-question:${pendingUserQuestionRequest.phase}`,
          index++,
          <UserQuestionCard
            request={pendingUserQuestionRequest}
            onSubmit={async (answer, attachments) => {
              await onResolveUserQuestion({
                request: pendingUserQuestionRequest,
                answer,
                ...(attachments.length ? { attachments: [...attachments] } : {}),
              })
            }}
            busy={toolPermissionBusy}
            title={pendingUserQuestionRequest.kind === 'plan_review' ? 'Review Plan' : undefined}
            projectPath={planReviewProjectPath}
            helperText={
              pendingUserQuestionRequest.kind === 'plan_review'
                ? 'Reply "approve" to begin, describe changes to edit, or "reject" to stop.'
                : undefined
            }
          />,
        ),
      )
    }
    return nodes
  }

  const inlinePopups = renderInlinePopups(inlinePopupIndex)

  return (
    <>
      {head.map((row, index) => renderRow(row, index))}
      {inlinePopups}
      {tail.map((row, index) => renderRow(row, head.length + inlinePopups.length + index))}
    </>
  )
}

function summarizeMessageText(message: UIMessage) {
  return message.parts
    .map((part) => {
      switch (part.type) {
        case 'text':
          return part.content
        case 'thinking':
          return `[thinking] ${part.content}`
        case 'tool-call':
          return `[tool-call:${part.name}] ${part.arguments}`
        case 'tool-result':
          return `[tool-result:${part.toolCallId}]`
        case 'image':
          return '[image]'
        case 'audio':
          return '[audio]'
        case 'video':
          return '[video]'
        case 'document':
          return '[document]'
        default:
          return ''
      }
    })
    .filter((value) => value.trim().length > 0)
    .join('\n')
    .trim()
}

function buildTranscriptDebugPayload(section: ChatTranscriptSectionState) {
  const messageEntries = section.messages.map((message, index) => {
    const text = summarizeMessageText(message)
    const normalizedText = text.replace(/\s+/g, ' ').trim()
    const isTeamAutoPrompt = message.id.startsWith('team-auto-user-')

    return {
      index,
      id: message.id,
      role: message.role,
      createdAt: message.createdAt instanceof Date ? message.createdAt.toISOString() : null,
      isTeamAutoPrompt,
      partTypes: message.parts.map((part) => part.type),
      text,
      normalizedText,
    }
  })

  const duplicateGroups = new Map<
    string,
    { readonly role: UIMessage['role']; messageIds: string[] }
  >()

  for (const entry of messageEntries) {
    if (!entry.normalizedText) continue
    const key = `${entry.role}::${entry.normalizedText}`
    const existing = duplicateGroups.get(key)
    if (existing) {
      existing.messageIds.push(entry.id)
      continue
    }
    duplicateGroups.set(key, {
      role: entry.role,
      messageIds: [entry.id],
    })
  }

  const consecutiveDuplicates = messageEntries.slice(1).flatMap((entry, index) => {
    const previous = messageEntries[index]
    if (
      previous &&
      previous.role === entry.role &&
      previous.normalizedText.length > 0 &&
      previous.normalizedText === entry.normalizedText
    ) {
      return [
        {
          role: entry.role,
          previousMessageId: previous.id,
          currentMessageId: entry.id,
        },
      ]
    }
    return []
  })

  return {
    capturedAt: new Date().toISOString(),
    sessionId: section.activeSessionId ? String(section.activeSessionId) : null,
    projectPath: section.projectPath,
    messageCount: messageEntries.length,
    chatRowCount: section.chatRows.length,
    lastUserMessageId: section.lastUserMessageId,
    teamAutoPromptMessageCount: messageEntries.filter((entry) => entry.isTeamAutoPrompt).length,
    duplicateMessageGroups: Array.from(duplicateGroups.values())
      .filter((group) => group.messageIds.length > 1)
      .map((group) => ({
        role: group.role,
        count: group.messageIds.length,
        messageIds: group.messageIds,
      })),
    consecutiveDuplicates,
    transcriptTail: messageEntries.slice(-40).map((entry) => ({
      index: entry.index,
      id: entry.id,
      role: entry.role,
      createdAt: entry.createdAt,
      isTeamAutoPrompt: entry.isTeamAutoPrompt,
      partTypes: entry.partTypes,
    })),
  }
}

// ─── Component ──────────────────────────────────────────────

export function ChatTranscript({ section }: ChatTranscriptProps) {
  const [isDebugPanelOpen, setIsDebugPanelOpen] = useState(false)
  const transcriptDebugEnabled = useUIStore((s) => s.transcriptDebugEnabled)
  const {
    messages,
    isLoading,
    projectPath,
    recentProjects,
    activeSessionId,
    chatRows: rows,
    onOpenProject,
    onSelectProjectPath,
    onRetryText,
    pendingUserQuestionRequest,
    onResolveUserQuestion,
    pendingPlanReviewRequest,
    planReviewDecision,
    onResolvePlanReview,
    planReviewProjectPath,
    pendingToolPermissionRequest,
    toolPermissionBusy,
    toolPermissionError,
    onApproveToolPermission,
    onDenyToolPermission,
    lastUserMessageId,
    streamSignalVersion,
    userDidSend,
    onUserDidSendConsumed,
  } = section
  const rowHandlers = useTranscriptRowHandlers(section)
  // Serializing the whole transcript is expensive and `section` is a fresh
  // object on every render — only pay for it while the debug panel is open.
  const transcriptDebugPayload = useMemo(
    () => (isDebugPanelOpen ? JSON.stringify(buildTranscriptDebugPayload(section), null, 2) : ''),
    [isDebugPanelOpen, section],
  )

  const {
    scrollerRef,
    contentRef,
    showScrollToBottom,
    scrollToBottom,
    handleScroll,
    handleWheel,
    handlePointerDown,
    handlePointerUp,
    handlePointerCancel,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  } = useChatScrollBehaviour({
    activeSessionId: activeSessionId ?? null,
    lastUserMessageId,
    rowsLength: rows.length,
    streamVersion: streamSignalVersion,
    isLoading,
    userDidSend,
    onUserDidSendConsumed,
  })

  const hasPendingInlinePopup = Boolean(pendingToolPermissionRequest || pendingUserQuestionRequest)
  if (messages.length === 0 && rows.length === 0 && !isLoading && !hasPendingInlinePopup) {
    return (
      <div className="flex-1 overflow-y-auto chat-scroll">
        <WelcomeScreen
          projectPath={projectPath}
          hasProject={!!projectPath}
          recentProjects={recentProjects}
          onOpenProject={() => {
            void onOpenProject()
          }}
          onSelectProjectPath={onSelectProjectPath}
          onRetry={
            projectPath
              ? (content) => {
                  void onRetryText(content)
                }
              : undefined
          }
        />
      </div>
    )
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div
        ref={scrollerRef}
        role="log"
        aria-label="Chat messages"
        aria-busy={isLoading}
        className="flex flex-1 flex-col overflow-y-auto chat-scroll [overflow-anchor:none]"
        onScroll={handleScroll}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div ref={contentRef} className="flex min-h-full flex-col">
          <TranscriptRows
            rows={rows}
            activeSessionId={activeSessionId}
            handlers={rowHandlers}
            pendingUserQuestionRequest={pendingUserQuestionRequest}
            onResolveUserQuestion={onResolveUserQuestion}
            pendingPlanReviewRequest={pendingPlanReviewRequest}
            planReviewDecision={planReviewDecision}
            onResolvePlanReview={onResolvePlanReview}
            planReviewProjectPath={planReviewProjectPath}
            pendingToolPermissionRequest={pendingToolPermissionRequest}
            toolPermissionBusy={toolPermissionBusy}
            toolPermissionError={toolPermissionError}
            onApproveToolPermission={onApproveToolPermission}
            onDenyToolPermission={onDenyToolPermission}
          />
        </div>
      </div>
      {messages.length > 0 && transcriptDebugEnabled ? (
        <>
          {isDebugPanelOpen ? (
            <div
              id="transcript-debug-panel"
              className="absolute inset-x-4 bottom-16 z-20 ml-auto w-full max-w-[680px] overflow-hidden rounded-2xl border border-border bg-bg shadow-2xl"
            >
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div>
                  <h3 className="text-[13px] font-semibold text-text-primary">Transcript Debug</h3>
                  <p className="text-[11px] text-text-tertiary">
                    Copy this payload and paste it back to debug repeated transcript issues.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  radius="full"
                  onClick={() => setIsDebugPanelOpen(false)}
                  aria-label="Close transcript debug panel"
                >
                  <X className="size-4" />
                </Button>
              </div>
              <div className="p-4">
                <textarea
                  readOnly
                  value={transcriptDebugPayload}
                  className="min-h-[320px] max-h-[60vh] w-full resize-y rounded-xl border border-border bg-bg-secondary px-3 py-3 text-[12px] leading-5 text-text-secondary outline-none"
                  aria-label="Transcript debug payload"
                />
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      <ScrollToBottomButton visible={showScrollToBottom} onClick={scrollToBottom} />
    </div>
  )
}
