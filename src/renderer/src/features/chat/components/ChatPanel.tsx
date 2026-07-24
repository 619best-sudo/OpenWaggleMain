import { PanelErrorBoundary } from '@/shared/ui/PanelErrorBoundary'
import { useChatPanelSections } from '../hooks/use-chat-panel-controller'
import type { ChatPanelSections } from '../model'
import { ChatComposerStack } from './ChatComposerStack'
import { ChatTranscript } from './ChatTranscript'
import { ToolPermissionInlineCard } from './ToolPermissionInlineCard'

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
  const shouldRenderToolPermission =
    pendingToolPermissionRequest &&
    (routeSessionId === undefined ||
      (sections.transcript.activeSessionId !== null &&
        String(sections.transcript.activeSessionId) === routeSessionId))
  return (
    <div className="flex size-full overflow-hidden bg-bg">
      <div
        className="flex min-w-0 flex-1 flex-col overflow-hidden bg-bg"
        data-chat-panel-main="true"
      >
        <PanelErrorBoundary name="Chat transcript" className="flex flex-1 flex-col overflow-hidden">
          <ChatTranscript section={sections.transcript} />
        </PanelErrorBoundary>
        {shouldRenderToolPermission && (
          <div className="px-5 pb-3">
            <div className="mx-auto w-full max-w-[960px]">
              <ToolPermissionInlineCard
                request={pendingToolPermissionRequest}
                busy={sections.transcript.toolPermissionBusy}
                error={sections.transcript.toolPermissionError}
                onApprove={sections.transcript.onApproveToolPermission}
                onDeny={sections.transcript.onDenyToolPermission}
              />
            </div>
          </div>
        )}

        <PanelErrorBoundary name="Composer">
          <ChatComposerStack section={sections.composer} onOpenSessionTree={onOpenSessionTree} />
        </PanelErrorBoundary>
      </div>
    </div>
  )
}

export function ChatPanel() {
  const sections = useChatPanelSections()
  return <ChatPanelContent sections={sections} />
}
