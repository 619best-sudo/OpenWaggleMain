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

// The inline tool block reads the active project path from the session store
// to relativize file paths shown in the tool title. Provide a fixed repo root.
const PROJECT_ROOT = '/Users/me/OpenWaggleMain'
vi.mock('@/features/sessions/state', () => ({
  useSessionStore: (selector: (state: { activeWorkspace: unknown }) => unknown) =>
    selector({
      activeWorkspace: { tree: { session: { projectPath: PROJECT_ROOT } } },
    }),
}))
vi.mock('@/shared/lib/ipc', () => ({
  api: { resolveToolMediaFile: vi.fn().mockResolvedValue({ error: 'no project' }) },
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

  it('shows reasoning as visible narration when the turn has a tool call, with tool-result dedup intact', () => {
    // When reasoning is on, the model narrates its pre-tool intent in the
    // reasoning channel — so a tool-bearing turn looks like
    // [reasoning, tool-call] with no text part. That reasoning IS the narration
    // and must be visible, otherwise the user sees a silent wall of tools.
    render(
      <AssistantMessageBubble
        message={createMessage('m1', [
          { type: 'thinking', content: 'Let me read the memory to find relevant files.' },
          { type: 'tool-call', id: 'tool-1', name: 'read', arguments: '{}', state: 'running' },
          {
            type: 'tool-result',
            toolCallId: 'tool-1',
            content: 'paired-result',
            state: 'complete',
          },
          {
            type: 'tool-result',
            toolCallId: 'orphan-1',
            content: 'orphan-result',
            state: 'complete',
          },
        ])}
        sessionId={defaultSessionId}
      />,
    )

    // Reasoning is visible inline (it's the narration for the tool call).
    expect(screen.getByText('Let me read the memory to find relevant files.')).toBeInTheDocument()
    // Paired tool-result is deduped: its output renders on the call block
    // (exactly once), not as a duplicate standalone row.
    expect(screen.getAllByText('paired-result')).toHaveLength(1)
    // Orphan tool-result still renders standalone.
    expect(screen.getByText('orphan-result')).toBeInTheDocument()
  })

  it('collapses reasoning on pure-answer turns (no tool call), auto-expanding only while streaming', () => {
    // A pure-answer turn carries a `text` part that IS the answer; the reasoning
    // is auxiliary and stays collapsed to avoid duplication — except while
    // streaming, so the user can watch the agent think.
    const { rerender } = render(
      <AssistantMessageBubble
        message={createMessage('m1', [
          { type: 'thinking', content: 'internal chain of thought' },
          { type: 'text', content: 'The final answer is 42.' },
        ])}
        sessionId={defaultSessionId}
        isStreaming
      />,
    )

    // While streaming, reasoning auto-expands.
    expect(screen.getByText('internal chain of thought')).toBeInTheDocument()

    // Once streaming ends, it collapses (no user toggle).
    rerender(
      <AssistantMessageBubble
        message={createMessage('m1', [
          { type: 'thinking', content: 'internal chain of thought' },
          { type: 'text', content: 'The final answer is 42.' },
        ])}
        sessionId={defaultSessionId}
      />,
    )
    expect(screen.queryByText('internal chain of thought')).not.toBeInTheDocument()
    // The answer text is always visible.
    expect(screen.getByText('The final answer is 42.')).toBeInTheDocument()
  })

  it('renders an inline media preview when a tool-call output carries an image block', () => {
    render(
      <AssistantMessageBubble
        message={createMessage('m1', [
          {
            type: 'tool-call',
            id: 'tool-img',
            name: 'generate_image',
            arguments: '{"prompt":"a cat"}',
            state: 'complete',
            output: {
              content: [{ type: 'image', data: 'AAAA', mimeType: 'image/png' }],
            },
          },
        ])}
        sessionId={defaultSessionId}
      />,
    )

    // The tool block auto-expands and shows an IMAGE chip + the rendered <img>.
    expect(screen.getByText('IMAGE')).toBeInTheDocument()
    const img = document.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('data:image/png;base64,AAAA')
  })

  it('keeps non-media tools header-only with no preview', () => {
    render(
      <AssistantMessageBubble
        message={createMessage('m1', [
          {
            type: 'tool-call',
            id: 'tool-bash',
            name: 'bash',
            arguments: '{"command":"ls"}',
            state: 'complete',
            output: { content: [{ type: 'text', text: 'file.txt' }] },
          },
        ])}
        sessionId={defaultSessionId}
      />,
    )

    expect(screen.getByText('RUN')).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
    expect(document.querySelector('video')).toBeNull()
  })

  it('relativizes absolute file paths in the tool title to the open repo', () => {
    render(
      <AssistantMessageBubble
        message={createMessage('m1', [
          {
            type: 'tool-call',
            id: 'tool-read',
            name: 'read',
            arguments: JSON.stringify({
              path: `${PROJECT_ROOT}/src/main/foo.ts`,
            }),
            state: 'complete',
            output: { content: [{ type: 'text', text: 'contents' }] },
          },
        ])}
        sessionId={defaultSessionId}
      />,
    )

    // The title shows the repo-relative path, not the full absolute path.
    expect(screen.getByText('src/main/foo.ts')).toBeInTheDocument()
    expect(screen.queryByText(`${PROJECT_ROOT}/src/main/foo.ts`)).not.toBeInTheDocument()
  })

  it('shows a useful detail (action) instead of repeating the tool name for path-less tools', () => {
    render(
      <AssistantMessageBubble
        message={createMessage('m1', [
          {
            type: 'tool-call',
            id: 'tool-mem',
            name: 'project_memory',
            arguments: JSON.stringify({ action: 'get' }),
            state: 'complete',
            output: { content: [{ type: 'text', text: 'ok' }] },
          },
        ])}
        sessionId={defaultSessionId}
      />,
    )

    // The chip is the Title-Cased tool name; the title carries a meaningful
    // action summary, not a second copy of the raw tool identifier.
    expect(screen.getByText('Project Memory')).toBeInTheDocument()
    expect(screen.getByText('Get memory')).toBeInTheDocument()
    expect(screen.queryByText('project_memory')).not.toBeInTheDocument()
    expect(screen.queryByText('PROJECT_MEMORY')).not.toBeInTheDocument()
  })

  it('renders an expandable ask_user_question body with the question, options, and selected answer', () => {
    render(
      <AssistantMessageBubble
        message={createMessage('m1', [
          {
            type: 'tool-call',
            id: 'tool-ask',
            name: 'ask_user_question',
            arguments: JSON.stringify({
              question: 'Which framework should we use?',
              options: ['React', 'Vue', 'Svelte'],
            }),
            // The user's answer comes back as the tool result text.
            state: 'complete',
            output: { content: [{ type: 'text', text: 'React' }] },
          },
        ])}
        sessionId={defaultSessionId}
      />,
    )

    // The question appears as the title (truncated) and in the body.
    expect(screen.getAllByText('Which framework should we use?').length).toBeGreaterThanOrEqual(1)
    // Options render, with the selected one highlighted.
    expect(screen.getByText('Vue')).toBeInTheDocument()
    expect(screen.getByText('Svelte')).toBeInTheDocument()
    // "React" appears both as an option and as the submitted answer.
    expect(screen.getAllByText('React').length).toBeGreaterThanOrEqual(1)
    // The submitted answer is shown.
    expect(screen.getByText('Your answer')).toBeInTheDocument()
  })
})
