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

  it('caps the reasoning body at five lines and scrolls past that', () => {
    render(
      <AssistantMessageBubble
        message={createMessage('m1', [
          { type: 'thinking', content: 'Let me read the memory first.' },
          {
            type: 'tool-call',
            id: 'tool-1',
            name: 'read',
            arguments: JSON.stringify({ path: 'src/app.ts' }),
            state: 'complete',
          },
        ])}
        sessionId={defaultSessionId}
      />,
    )

    // Five lines at the body's own line-height, so the cap tracks the type scale
    // instead of a pixel number. Short reasoning still renders at its natural
    // height — this only bounds the overlong case.
    const body = screen.getByText('Let me read the memory first.').closest('.diff-scroll')
    expect(body).not.toBeNull()
    expect(body).toHaveStyle({ maxHeight: '7.5em' })
    expect(body).toHaveClass('overflow-y-auto')
    // A block that has not hit the cap must not contain overscroll: Chromium
    // honours `overscroll-behavior: contain` even with nothing to scroll, which
    // would make hovering a two-line thinking block swallow the wheel.
    expect(body).not.toHaveClass('overscroll-contain')
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

  it('auto-expands a media tool block when the image arrives mid-stream (after mount)', () => {
    // A screenshot/media tool mounts BEFORE its result streams in: the call is
    // authored (toolcall_start) and starts executing with no `output`, so `media`
    // is null at mount. The image only arrives on `tool_execution_end`. The
    // block's default-expanded initializer runs once (at mount, when media is
    // null), so without auto-expand-on-arrival the image stays hidden behind the
    // collapsed header until the run completes and the session re-hydrates.
    const { rerender } = render(
      <AssistantMessageBubble
        message={createMessage('m1', [
          {
            type: 'tool-call',
            id: 'tool-shot',
            name: 'browser_take_screenshot',
            arguments: '{}',
            state: 'executing',
          },
        ])}
        sessionId={defaultSessionId}
      />,
    )

    // Mounted executing, no result yet: expandable header only, no image.
    expect(document.querySelector('img')).toBeNull()

    // The image result streams in (tool_execution_end).
    rerender(
      <AssistantMessageBubble
        message={createMessage('m1', [
          {
            type: 'tool-call',
            id: 'tool-shot',
            name: 'browser_take_screenshot',
            arguments: '{}',
            state: 'complete',
            output: {
              content: [{ type: 'image', data: 'AAAA', mimeType: 'image/png' }],
            },
          },
        ])}
        sessionId={defaultSessionId}
      />,
    )

    // The block must auto-expand on the image's first appearance — the image is
    // visible without the user having to click, and without waiting for the run
    // to complete and re-hydrate.
    const img = document.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('data:image/png;base64,AAAA')
  })

  it('previews an assets_generator result (file-reference block) instead of only its text', () => {
    // assets_generator returns the generated asset by reference, not inline:
    //   { content: [{ type: 'file', uri: <path>, mimeType }], output: <text> }
    // Previously this block type was unrecognized, so the tool showed only its
    // text output ("Generated image → <path>") with no preview. It must now be
    // recognized as media and render a preview frame + IMAGE action label.
    render(
      <AssistantMessageBubble
        message={createMessage('m1', [
          {
            type: 'tool-call',
            id: 'asset-1',
            name: 'assets_generator',
            arguments: '{"kind":"image","prompt":"hero"}',
            state: 'complete',
            output: {
              output: 'Generated image → assets/hero.png (12345 bytes).',
              details: { uri: 'assets/hero.png', mimeType: 'image/png', size: 12345 },
              content: [{ type: 'file', uri: 'assets/hero.png', mimeType: 'image/png' }],
            },
          },
        ])}
        sessionId={defaultSessionId}
      />,
    )

    // Recognized as an image → the IMAGE action label shows on the header, and
    // the media preview frame renders (the path is IPC-resolved at display time;
    // here it surfaces the loading skeleton while it resolves).
    expect(screen.getByText('IMAGE')).toBeInTheDocument()
    const skeleton = document.querySelector('.animate-pulse')
    expect(skeleton).not.toBeNull()
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

  /**
   * The agent is told to prefer the OBJECT form of `options`
   * (`{label, description, recommended}`) — a bare label makes the user do the
   * thinking the picker existed to prevent. This renderer filtered to
   * `typeof === 'string'`, so every richly-described question replayed with an
   * EMPTY options list: the live card showed the trade-offs and the transcript
   * showed nothing, which reads as "the agent asked without offering anything".
   */
  it('renders object-form ask_user_question options, not just bare strings', () => {
    render(
      <AssistantMessageBubble
        message={createMessage('m1', [
          {
            type: 'tool-call',
            id: 'tool-ask',
            name: 'ask_user_question',
            arguments: JSON.stringify({
              question: 'Which datastore?',
              options: [
                { label: 'Postgres', description: 'Migrations included', recommended: true },
                { label: 'SQLite', description: 'Zero setup' },
              ],
            }),
            // Still waiting on the user — the options only render before an
            // answer lands.
            state: 'complete',
          },
        ])}
        sessionId={defaultSessionId}
      />,
    )

    expect(screen.getAllByText('Postgres').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('SQLite')).toBeInTheDocument()
    expect(screen.getByText(/Recommended/)).toBeInTheDocument()
  })

  it('renders a mixed options array without dropping either form', () => {
    render(
      <AssistantMessageBubble
        message={createMessage('m1', [
          {
            type: 'tool-call',
            id: 'tool-ask',
            name: 'ask_user_question',
            arguments: JSON.stringify({
              question: 'Which targets?',
              options: ['web', { label: 'ios', description: 'Needs a mac runner' }],
            }),
            state: 'complete',
          },
        ])}
        sessionId={defaultSessionId}
      />,
    )

    expect(screen.getAllByText('web').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('ios')).toBeInTheDocument()
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
            // The user's answer comes back as the tool result text, wrapped in
            // the envelope the harness writes for the model.
            state: 'complete',
            output: {
              content: [
                {
                  type: 'text',
                  text: [
                    'User answered: React',
                    '(clarification for: Which framework should we use?)',
                    'Reason this was needed: The user did not name a framework.',
                  ].join('\n'),
                },
              ],
            },
          },
        ])}
        sessionId={defaultSessionId}
      />,
    )

    // The question is the header, and is not restated in the body.
    expect(screen.getAllByText('Which framework should we use?')).toHaveLength(1)
    // Only the answer survives — the model-facing envelope is stripped.
    expect(screen.getByText('React')).toBeInTheDocument()
    expect(screen.queryByText(/clarification for/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Reason this was needed/)).not.toBeInTheDocument()
    // Once answered, the unchosen options are noise and drop out.
    expect(screen.queryByText('Vue')).not.toBeInTheDocument()
    expect(screen.queryByText('Svelte')).not.toBeInTheDocument()
  })
})
