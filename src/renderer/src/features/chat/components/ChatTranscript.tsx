import { matchBy } from '@diegogbrisa/ts-match'
import type { SessionBranchId, SessionId } from '@shared/types/brand'
import type { UIMessage } from '@shared/types/chat-ui'
import { Bug, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useChatScrollBehaviour } from '../hooks/useChatScrollBehaviour'
import type { ChatRow } from '../lib/types-chat-row'
import type { ChatTranscriptSectionState } from '../model'
import { Button } from '@/shared/ui/Button'
import { ChatRowRenderer } from './ChatRowRenderer'
import { ScrollToBottomButton } from './ScrollToBottomButton'
import { WelcomeScreen } from './WelcomeScreen'

const PADDING_TOP = 20

interface ChatTranscriptProps {
  readonly section: ChatTranscriptSectionState
}

interface TranscriptRowProps {
  row: ChatRow
  sessionId: SessionId | null
  onOpenSettings: () => void
  onRetryText: (content: string) => Promise<void>
  onDismissError: (errorId: string | null) => void
  onDismissInterruptedRun: (runId: string, branchId: SessionBranchId) => void
  onBranchFromMessage: (messageId: string) => void
  onForkFromMessage: (messageId: string) => void
}

function TranscriptRow({
  row,
  sessionId,
  onOpenSettings,
  onRetryText,
  onDismissError,
  onDismissInterruptedRun,
  onBranchFromMessage,
  onForkFromMessage,
}: TranscriptRowProps) {
  return (
    <ChatRowRenderer
      row={row}
      sessionId={sessionId}
      onOpenSettings={onOpenSettings}
      onRetry={(content) => {
        void onRetryText(content)
      }}
      onDismissError={onDismissError}
      onDismissInterruptedRun={onDismissInterruptedRun}
      onBranchFromMessage={onBranchFromMessage}
      onForkFromMessage={onForkFromMessage}
    />
  )
}

function getChatRowKey(row: ChatRow) {
  return matchBy(row, 'type')
    .with('message', (value) => `message:${value.message.id}`)
    .with('waggle-turn', (value) => value.id)
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
  onOpenSettings: () => void
  onRetryText: (content: string) => Promise<void>
  onDismissError: (errorId: string | null) => void
  onDismissInterruptedRun: (runId: string, branchId: SessionBranchId) => void
  onBranchFromMessage: (messageId: string) => void
  onForkFromMessage: (messageId: string) => void
}

function TranscriptRows(params: RenderTranscriptRowsParams) {
  const {
    rows,
    activeSessionId,
    onOpenSettings,
    onRetryText,
    onDismissError,
    onDismissInterruptedRun,
    onBranchFromMessage,
    onForkFromMessage,
  } = params

  return (
    <>
      {rows.map((row, index) => {
        const isUserMessage = row.type === 'message' && row.message.role === 'user'
        return (
          <div
            key={getChatRowKey(row)}
            className="mx-auto w-full max-w-[960px] px-5 pb-6"
            {...(isUserMessage ? { 'data-user-message-id': row.message.id } : {})}
            style={index === 0 ? { paddingTop: PADDING_TOP } : undefined}
          >
            <TranscriptRow
              row={row}
              sessionId={activeSessionId}
              onOpenSettings={onOpenSettings}
              onRetryText={onRetryText}
              onDismissError={onDismissError}
              onDismissInterruptedRun={onDismissInterruptedRun}
              onBranchFromMessage={onBranchFromMessage}
              onForkFromMessage={onForkFromMessage}
            />
          </div>
        )
      })}
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
    onOpenSettings,
    onDismissError,
    onDismissInterruptedRun,
    onBranchFromMessage,
    onForkFromMessage,
    lastUserMessageId,
    streamSignalVersion,
    userDidSend,
    onUserDidSendConsumed,
  } = section
  const transcriptDebugPayload = useMemo(
    () => JSON.stringify(buildTranscriptDebugPayload(section), null, 2),
    [section],
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

  if (messages.length === 0 && rows.length === 0 && !isLoading) {
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
            onOpenSettings={onOpenSettings}
            onRetryText={onRetryText}
            onDismissError={onDismissError}
            onDismissInterruptedRun={onDismissInterruptedRun}
            onBranchFromMessage={onBranchFromMessage}
            onForkFromMessage={onForkFromMessage}
          />
        </div>
      </div>
      {messages.length > 0 ? (
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
          <div className="absolute bottom-3 right-4 z-10">
            <Button
              variant="secondary"
              size="sm"
              radius="full"
              className="home-panel-frame-soft bg-bg-secondary shadow-sm"
              leftIcon={<Bug className="size-3.5" />}
              onClick={() => setIsDebugPanelOpen((current) => !current)}
              aria-expanded={isDebugPanelOpen}
              aria-controls="transcript-debug-panel"
            >
              Transcript Debug
            </Button>
          </div>
        </>
      ) : null}
      <ScrollToBottomButton visible={showScrollToBottom} onClick={scrollToBottom} />
    </div>
  )
}
