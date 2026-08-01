import { PanelErrorBoundary } from '@/shared/ui/PanelErrorBoundary'
import { useChatPanelSections } from '../hooks/use-chat-panel-controller'
import type { ChatPanelSections } from '../model'
import { ChatComposerStack } from './ChatComposerStack'
import { ChatTranscript } from './ChatTranscript'

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
  // Suppress the inline permission card while the routed session is switching
  // (active session id no longer matches the route). The card now renders
  // inside the transcript, so the gate is enforced by clearing the request on
  // the section handed to the transcript.
  const sessionMatchesRoute =
    routeSessionId === undefined ||
    (sections.transcript.activeSessionId !== null &&
      String(sections.transcript.activeSessionId) === routeSessionId)
  const transcriptSection =
    pendingToolPermissionRequest && !sessionMatchesRoute
      ? { ...sections.transcript, pendingToolPermissionRequest: null }
      : sections.transcript
  return (
    <div className="flex size-full overflow-hidden bg-bg">
      <div
        className="flex min-w-0 flex-1 flex-col overflow-hidden bg-bg"
        data-chat-panel-main="true"
      >
        <PanelErrorBoundary name="Chat transcript" className="flex flex-1 flex-col overflow-hidden">
          <ChatTranscript section={transcriptSection} />
        </PanelErrorBoundary>

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
