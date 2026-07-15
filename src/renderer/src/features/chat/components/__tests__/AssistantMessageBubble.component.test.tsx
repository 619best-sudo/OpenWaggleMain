import { SessionId, SupportedModelId } from '@shared/types/brand'
import type { UIMessage } from '@shared/types/chat-ui'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseMessageCollapseResult } from '../../hooks/useMessageCollapse'

type MessagePart = UIMessage['parts'][number]

// ---------------------------------------------------------------------------
// Hoisted mock handles
// ---------------------------------------------------------------------------
const mockCollapse = vi.hoisted(() => ({
  current: {
    canCollapseDetails: false,
    showDetails: false,
    toggleDetails: vi.fn(),
    collapseLabel: '',
    lastRenderableTextPartIndex: -1,
    renderAllParts: true,
  } satisfies UseMessageCollapseResult,
}))

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('../../hooks/useMessageCollapse', () => ({
  useMessageCollapse: () => mockCollapse.current,
}))

vi.mock('../StreamingText', () => ({
  StreamingText: ({ text }: { text: string }) => <div data-testid="streaming-text">{text}</div>,
}))

vi.mock('../ToolCallRouter', () => ({
  ToolCallRouter: ({ part }: { part: { name: string } }) => (
    <div data-testid="tool-call-router">{part.name}</div>
  ),
}))

vi.mock('../AgentLabel', () => ({
  AgentLabel: ({
    assistantModel,
    waggle,
  }: {
    assistantModel?: string
    waggle?: { agentLabel: string }
  }) => {
    if (!assistantModel && !waggle) return null
    return (
      <div data-testid="agent-label">
        {waggle?.agentLabel}
        {assistantModel}
      </div>
    )
  },
}))

vi.mock('../CollapsibleDetails', () => ({
  CollapsibleDetails: ({
    collapseLabel,
  }: {
    collapseLabel: string
    showDetails: boolean
    onToggle: () => void
  }) => <div data-testid="collapsible-details">{collapseLabel}</div>,
}))

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------
import { AssistantMessageBubble } from '../AssistantMessageBubble'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function textPart(content: string) {
  return { type: 'text', content }
}

function toolCallPart(name: string, id = 'tc-1', summary?: string, argumentsText = '{}') {
  return {
    type: 'tool-call',
    id,
    name,
    arguments: argumentsText,
    ...(summary ? { summary } : {}),
    state: 'output-available',
  }
}

function toolResultPart(toolCallId: string) {
  return {
    type: 'tool-result',
    toolCallId,
    content: 'ok',
    state: 'output-available',
  }
}

function thinkingPart() {
  return { type: 'thinking', content: 'internal reasoning', stepId: 'thinking-1' }
}

function createMessage(id: string, parts: MessagePart[]) {
  return { id, role: 'assistant', parts }
}

const defaultSessionId = SessionId('session-1')

function setCollapse(overrides: Partial<UseMessageCollapseResult>) {
  mockCollapse.current = { ...mockCollapse.current, ...overrides }
}

function resetCollapse() {
  mockCollapse.current = {
    canCollapseDetails: false,
    showDetails: false,
    toggleDetails: vi.fn(),
    collapseLabel: '',
    lastRenderableTextPartIndex: -1,
    renderAllParts: true,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('AssistantMessageBubble', () => {
  beforeEach(() => {
    resetCollapse()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders AgentLabel when waggle prop provided', () => {
    const message = createMessage('m1', [textPart('Hello')])
    render(
      <AssistantMessageBubble
        message={message}
        sessionId={defaultSessionId}
        waggle={{ agentLabel: 'Architect', agentColor: 'blue' }}
      />,
    )
    expect(screen.getByTestId('agent-label')).toHaveTextContent('Architect')
  })

  it('renders StreamingText for text parts', () => {
    const message = createMessage('m1', [textPart('Hello world')])
    render(<AssistantMessageBubble message={message} sessionId={defaultSessionId} />)
    expect(screen.getByTestId('streaming-text')).toHaveTextContent('Hello world')
  })

  it('does not render empty text parts', () => {
    const message = createMessage('m1', [textPart('   '), textPart('Visible')])
    render(<AssistantMessageBubble message={message} sessionId={defaultSessionId} />)
    const texts = screen.getAllByTestId('streaming-text')
    expect(texts).toHaveLength(1)
    expect(texts[0]).toHaveTextContent('Visible')
  })

  it('renders ToolCallRouter for tool-call parts', () => {
    const message = createMessage('m1', [toolCallPart('read', 'tc-1'), toolResultPart('tc-1')])
    render(<AssistantMessageBubble message={message} sessionId={defaultSessionId} />)
    expect(screen.getByTestId('tool-call-router')).toHaveTextContent('read')
  })

  it('renders standalone tool-result parts while keeping matched tool-call results nested', () => {
    const message = createMessage('m1', [textPart('Hello'), toolResultPart('tc-1'), thinkingPart()])
    const { container } = render(
      <AssistantMessageBubble message={message} sessionId={defaultSessionId} />,
    )
    expect(container.querySelectorAll('[data-testid="streaming-text"]')).toHaveLength(2)
    expect(screen.getByTestId('reasoning-summary-list')).toBeInTheDocument()
    expect(screen.getByText('Planning the next step')).toBeInTheDocument()
    expect(screen.getByText('Tool result · output-available')).toBeInTheDocument()
  })

  it('renders compact reasoning summaries instead of raw thinking text', () => {
    const message = createMessage('m1', [
      thinkingPart(),
      toolCallPart('read', 'tc-1', 'Read src/app.ts', '{"path":"src/app.ts"}'),
      textPart('Done'),
    ])

    render(<AssistantMessageBubble message={message} sessionId={defaultSessionId} />)

    expect(screen.getByTestId('reasoning-summary')).toHaveTextContent('Inspecting source code')
    expect(screen.queryByText('internal reasoning')).toBeNull()
  })

  it('shows a soft reasoning timer while the active reasoning step is still running', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T10:00:00.000Z'))

    const message = {
      ...createMessage('m-running', [thinkingPart()]),
      createdAt: new Date('2026-07-15T09:59:35.000Z'),
    }

    render(
      <AssistantMessageBubble
        message={message}
        sessionId={defaultSessionId}
        isStreaming
      />,
    )

    expect(screen.getByTestId('reasoning-summary')).toHaveTextContent('Planning the next step')
    expect(screen.getByTestId('reasoning-summary-timer')).toHaveTextContent('00:25')

    act(() => {
      vi.advanceTimersByTime(20_000)
    })

    expect(screen.getByTestId('reasoning-summary-timer')).toHaveTextContent('00:45')
    expect(screen.getByTestId('reasoning-summary-note')).toHaveTextContent(
      'Taking a little longer to understand the code better.',
    )
  })

  it('renders all parts when canCollapseDetails=false', () => {
    setCollapse({ canCollapseDetails: false, renderAllParts: true })
    const message = createMessage('m1', [
      textPart('First'),
      toolCallPart('read', 'tc-1'),
      textPart('Second'),
    ])
    render(<AssistantMessageBubble message={message} sessionId={defaultSessionId} />)
    expect(screen.getAllByTestId('streaming-text')).toHaveLength(2)
    expect(screen.getByTestId('tool-call-router')).toBeInTheDocument()
  })

  it('renders only lastRenderableTextPartIndex when canCollapseDetails=true and showDetails=false', () => {
    setCollapse({
      canCollapseDetails: true,
      showDetails: false,
      renderAllParts: false,
      lastRenderableTextPartIndex: 2,
      collapseLabel: 'Show 1 tool call',
    })
    const message = createMessage('m1', [
      textPart('Earlier text'),
      toolCallPart('read', 'tc-1'),
      textPart('Final answer'),
    ])
    render(<AssistantMessageBubble message={message} sessionId={defaultSessionId} />)
    const texts = screen.getAllByTestId('streaming-text')
    expect(texts).toHaveLength(1)
    expect(texts[0]).toHaveTextContent('Final answer')
    expect(screen.queryByTestId('tool-call-router')).toBeNull()
  })

  it('renders CollapsibleDetails divider when canCollapseDetails=true', () => {
    setCollapse({
      canCollapseDetails: true,
      showDetails: false,
      renderAllParts: false,
      lastRenderableTextPartIndex: 1,
      collapseLabel: 'Show 1 tool call',
    })
    const message = createMessage('m1', [toolCallPart('read', 'tc-1'), textPart('Summary')])
    render(<AssistantMessageBubble message={message} sessionId={defaultSessionId} />)
    expect(screen.getByTestId('collapsible-details')).toHaveTextContent('Show 1 tool call')
  })

  it('leaves the continuous waggle rail to the turn wrapper', () => {
    const message = createMessage('m1', [textPart('Hello')])
    const { container } = render(
      <AssistantMessageBubble
        message={message}
        sessionId={defaultSessionId}
        waggle={{ agentLabel: 'Architect', agentColor: 'blue' }}
      />,
    )
    const outer = container.firstElementChild
    expect(outer?.className).not.toContain('border-l-2')
    expect(screen.getByTestId('agent-label')).toHaveTextContent('Architect')
  })

  it('hides repeated agent label when rendered inside a grouped waggle turn', () => {
    const message = createMessage('m1', [textPart('Hello')])
    render(
      <AssistantMessageBubble
        message={message}
        sessionId={defaultSessionId}
        waggle={{ agentLabel: 'Architect', agentColor: 'blue' }}
        assistantModel={SupportedModelId('gpt-5.5')}
        hideAgentLabel
      />,
    )
    expect(screen.queryByTestId('agent-label')).toBeNull()
    expect(screen.getByTestId('streaming-text')).toHaveTextContent('Hello')
  })
})
