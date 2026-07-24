import { SessionId } from '@shared/types/brand'
import type { UIMessage } from '@shared/types/chat-ui'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../StreamingText', () => ({
  StreamingText: ({ text }: { text: string }) => <div data-testid="streaming-text">{text}</div>,
}))

vi.mock('../AgentLabel', () => ({
  AgentLabel: ({ waggle }: { waggle?: { agentLabel: string } }) =>
    waggle ? <div data-testid="agent-label">{waggle.agentLabel}</div> : null,
}))

import { AssistantMessageBubble } from '../AssistantMessageBubble'

type MessagePart = UIMessage['parts'][number]

function createMessage(id: string, parts: MessagePart[]): UIMessage {
  return { id, role: 'assistant', parts }
}

const defaultSessionId = SessionId('session-1')

describe('AssistantMessageBubble', () => {
  it('renders waggle label when present', () => {
    render(
      <AssistantMessageBubble
        message={createMessage('m1', [{ type: 'text', content: 'Hello' }])}
        sessionId={defaultSessionId}
        waggle={{ agentLabel: 'Architect', agentColor: 'blue' }}
      />,
    )

    expect(screen.getByTestId('agent-label')).toHaveTextContent('Architect')
  })

  it('renders only visible text parts', () => {
    render(
      <AssistantMessageBubble
        message={createMessage('m1', [
          { type: 'text', content: 'Hello world' },
          { type: 'text', content: '   ' },
        ])}
        sessionId={defaultSessionId}
      />,
    )

    const texts = screen.getAllByTestId('streaming-text')
    expect(texts).toHaveLength(1)
    expect(texts[0]).toHaveTextContent('Hello world')
  })

  it('does not render legacy thinking and tool transcript parts', () => {
    render(
      <AssistantMessageBubble
        message={createMessage('m1', [
          { type: 'thinking', content: 'internal reasoning' },
          { type: 'tool-call', id: 'tool-1', name: 'read', arguments: '{}', state: 'running' },
          { type: 'tool-result', toolCallId: 'tool-1', content: 'done', state: 'complete' },
        ])}
        sessionId={defaultSessionId}
      />,
    )

    expect(screen.queryByTestId('streaming-text')).toBeNull()
    expect(screen.queryByText('internal reasoning')).toBeNull()
    expect(screen.queryByText('read')).toBeNull()
    expect(screen.queryByText('done')).toBeNull()
  })
})
