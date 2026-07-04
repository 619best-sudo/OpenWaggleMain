import { SessionId, SupportedModelId } from '@shared/types/brand'
import type { UIMessage } from '@shared/types/chat-ui'
import type { WaggleAgentColor } from '@shared/types/waggle'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ChatRow } from '../../lib/types-chat-row'

vi.mock('@/features/waggle/components/TurnDivider', () => ({
  TurnDivider: ({
    turnNumber,
    agentLabel,
  }: {
    turnNumber: number
    agentLabel: string
    agentColor: WaggleAgentColor
  }) => (
    <div data-testid="turn-divider">
      Turn {turnNumber + 1}: {agentLabel}
    </div>
  ),
}))

vi.mock('../MessageBubble', () => ({
  MessageBubble: ({
    message,
    run,
    waggle,
    presentation,
  }: {
    message: UIMessage
    run?: { readonly assistantModel?: string }
    waggle?: { agentLabel: string }
    presentation?: { readonly hideAgentLabel?: boolean }
  }) => (
    <div data-testid="message-bubble">
      <span>{message.id}</span>
      {!presentation?.hideAgentLabel && (waggle || run?.assistantModel) ? (
        <span data-testid="message-agent-label">
          {waggle?.agentLabel}
          {run?.assistantModel}
        </span>
      ) : null}
    </div>
  ),
}))

vi.mock('../MachineTimelineBubble', () => ({
  MachineTimelineBubble: ({ plan }: { plan: { goal: string } }) => (
    <div data-testid="machine-timeline">{plan.goal}</div>
  ),
}))

import { ChatRowRenderer } from '../ChatRowRenderer'

function assistantMessage(id: string) {
  return {
    id,
    role: 'assistant',
    parts: [{ type: 'text', content: id }],
  }
}

function messageRow(message: UIMessage) {
  return {
    type: 'message',
    message,
    isStreaming: false,
    isRunActive: false,
    showTurnDivider: false,
    assistantModel: SupportedModelId('openai/gpt-5.5'),
    waggle: { agentLabel: 'Architect', agentColor: 'blue' },
    waggleMeta: {
      agentIndex: 0,
      agentLabel: 'Architect',
      agentColor: 'blue',
      agentModel: SupportedModelId('openai/gpt-5.5'),
      turnNumber: 0,
      sessionId: 'session-1',
    },
  }
}

describe('ChatRowRenderer', () => {
  it('shows agent and model once for a grouped waggle turn', () => {
    const row: ChatRow = {
      type: 'waggle-turn',
      id: 'waggle-turn:session-1:0:0:assistant-1',
      agentColor: 'blue',
      turnDividerProps: {
        turnNumber: 0,
        agentLabel: 'Architect',
        agentColor: 'blue',
        agentModel: SupportedModelId('openai/gpt-5.5'),
      },
      messages: [
        messageRow(assistantMessage('assistant-1')),
        messageRow(assistantMessage('tool-1')),
      ],
    }

    render(
      <ChatRowRenderer row={row} sessionId={SessionId('session-1')} onDismissError={vi.fn()} />,
    )

    expect(screen.getByTestId('turn-divider')).toHaveTextContent('Turn 1: Architect')
    expect(screen.getAllByTestId('message-bubble')).toHaveLength(2)
    expect(screen.queryByTestId('message-agent-label')).toBeNull()
  })

  it('renders the machine timeline row as a dedicated assistant-side block', () => {
    const row: ChatRow = {
      type: 'machine-timeline',
      id: 'machine-timeline:1',
      plan: {
        goal: 'Build machine timeline UI',
        phase: 'awaiting_approval',
        tasks: [],
        model: SupportedModelId('openai/gpt-5.5'),
        thinkingLevel: 'medium',
        generatedAt: 1,
      },
    }

    render(
      <ChatRowRenderer row={row} sessionId={SessionId('session-1')} onDismissError={vi.fn()} />,
    )

    expect(screen.getByTestId('machine-timeline')).toHaveTextContent('Build machine timeline UI')
  })
})
