import type { SessionId } from '@shared/types/brand'
import type { UIMessage } from '@shared/types/chat-ui'
import type { SupportedModelId } from '@shared/types/llm'
import type { WaggleAgentColor } from '@shared/types/waggle'
import { GitBranch } from 'lucide-react'
import { Button } from '@/shared/ui/Button'
import { looksLikeMachinePlanText } from '../lib/machine-plan-detection'
import { AgentLabel } from './AgentLabel'
import { MachinePlanStreamingPlaceholder } from './MachinePlanStreamingPlaceholder'
import { StreamingText } from './StreamingText'

export interface WaggleInfo {
  agentLabel: string
  agentColor: WaggleAgentColor
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

/**
 * Renders an assistant text part. While streaming, a machine-mode plan arrives as
 * raw JSON that the transcript replaces with the timeline card once persisted;
 * show a placeholder instead of flashing that JSON. After streaming ends the
 * normal content renders, so nothing is permanently hidden if it wasn't a plan.
 */
function AssistantTextPart({
  content,
  isStreaming,
}: {
  readonly content: string
  readonly isStreaming: boolean
}) {
  if (isStreaming && looksLikeMachinePlanText(content)) {
    return <MachinePlanStreamingPlaceholder />
  }
  return <StreamingText text={content} isStreaming={isStreaming} />
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
  isRunActive: _isRunActive,
  assistantModel: _assistantModel,
  sessionId: _sessionId,
  waggle,
  hideAgentLabel,
  onBranchFromMessage,
}: AssistantMessageBubbleProps) {
  const textParts = message.parts.filter(
    (part): part is Extract<UIMessage['parts'][number], { type: 'text' }> =>
      part.type === 'text' && part.content.trim().length > 0,
  )

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

        {textParts.map((part, index) => (
          <AssistantTextPart
            key={`${message.id}-text-${String(index)}`}
            content={part.content}
            isStreaming={!!isStreaming}
          />
        ))}
      </div>
    </div>
  )
}
