import { useEffect } from 'react'
import { PanelErrorBoundary } from '@/shared/ui/PanelErrorBoundary'
import { useChatPanelSections } from '../hooks/use-chat-panel-controller'
import type { ChatPanelSections } from '../model'
import { ChatComposerStack } from './ChatComposerStack'
import { ChatTranscript } from './ChatTranscript'

const DEBUG_SERVER_URL = 'http://127.0.0.1:7777/event'
const DEBUG_RUN_ID = 'post-fix'

interface ChatPanelContentProps {
  readonly sections: ChatPanelSections
  readonly onOpenSessionTree?: () => void
  readonly routeSessionId?: string | null
}

export function ChatPanelContent({
  sections,
  onOpenSessionTree,
  routeSessionId,
}: ChatPanelContentProps) {
  const pendingToolPermissionRequest = sections.transcript.pendingToolPermissionRequest
  const shouldRenderToolPermission = Boolean(pendingToolPermissionRequest)

  useEffect(() => {
    // #region debug-point C:permission-render-gate
    void fetch(DEBUG_SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'permission-transcript-shift',
        runId: DEBUG_RUN_ID,
        hypothesisId: 'C',
        location: 'ChatPanel.tsx:ChatPanelContent',
        msg: shouldRenderToolPermission
          ? '[DEBUG] Tool permission dialog render gate is open'
          : '[DEBUG] Tool permission dialog render gate is closed',
        data: {
          routeSessionId: routeSessionId ?? null,
          activeSessionId:
            sections.transcript.activeSessionId !== null
              ? String(sections.transcript.activeSessionId)
              : null,
          pendingToolCallId: pendingToolPermissionRequest?.toolCallId ?? null,
          shouldRenderToolPermission,
          toolPermissionBusy: sections.transcript.toolPermissionBusy,
          toolPermissionError: sections.transcript.toolPermissionError,
        },
        ts: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
  }, [
    pendingToolPermissionRequest?.toolCallId,
    routeSessionId,
    sections.transcript.activeSessionId,
    sections.transcript.toolPermissionBusy,
    sections.transcript.toolPermissionError,
    shouldRenderToolPermission,
  ])

  return (
    <div className="flex size-full overflow-hidden bg-bg">
      <div
        className="flex min-w-0 flex-1 flex-col overflow-hidden bg-bg"
        data-chat-panel-main="true"
      >
        <PanelErrorBoundary name="Chat transcript" className="flex flex-1 flex-col overflow-hidden">
          <ChatTranscript section={sections.transcript} />
        </PanelErrorBoundary>
        <PanelErrorBoundary name="Composer">
          <ChatComposerStack
            section={sections.composer}
            onOpenSessionTree={onOpenSessionTree}
            toolPermission={
              pendingToolPermissionRequest
                ? {
                    request: pendingToolPermissionRequest,
                    busy: sections.transcript.toolPermissionBusy,
                    error: sections.transcript.toolPermissionError,
                    onClose: sections.transcript.onDismissToolPermission,
                    onApprove: sections.transcript.onApproveToolPermission,
                    onDeny: sections.transcript.onDenyToolPermission,
                  }
                : undefined
            }
          />
        </PanelErrorBoundary>
      </div>
    </div>
  )
}

export function ChatPanel() {
  const sections = useChatPanelSections()
  return <ChatPanelContent sections={sections} />
}
