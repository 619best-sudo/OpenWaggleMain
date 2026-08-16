import { SessionId } from '@shared/types/brand'
import type { UIMessage } from '@shared/types/chat-ui'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../StreamingText', () => ({
  StreamingText: ({ text }: { text: string }) => <div data-testid="streaming-text">{text}</div>,
}))
vi.mock('../AgentLabel', () => ({ AgentLabel: () => null }))
const PROJECT_ROOT = '/Users/me/OpenWaggleMain'
vi.mock('@/features/sessions/state', () => ({
  useSessionStore: (selector: (state: { activeWorkspace: unknown }) => unknown) =>
    selector({ activeWorkspace: { tree: { session: { projectPath: PROJECT_ROOT } } } }),
}))
vi.mock('@/shared/lib/ipc', () => ({
  api: { resolveToolMediaFile: vi.fn().mockResolvedValue({ error: 'no project' }) },
}))

import { AssistantMessageBubble } from '../AssistantMessageBubble'

type MessagePart = UIMessage['parts'][number]
const sid = SessionId('session-1')
function msg(parts: MessagePart[]): UIMessage {
  return { id: 'm1', role: 'assistant', parts }
}

/**
 * A diff row renders as three sections — line-number gutter, +/- mark, then
 * syntax-highlighted token spans — so its text is split across elements and
 * prefixed by the gutter number. Match on the row's trailing `<mark><code>`.
 */
function hasRenderedLine(markAndCode: string) {
  return Array.from(document.querySelectorAll('div')).some((el) =>
    (el.textContent ?? '').endsWith(markAndCode),
  )
}

// Post-completion (hydrated) shape: the tool-call part has NO inline `output`;
// the result lives on a sibling `tool-result` part in the SAME message. This is
// exactly what `sessionToUIMessages` produces after a turing run completes.
describe('AssistantMessageBubble (hydrated / post-completion)', () => {
  it('EDIT: recovers the diff from a sibling tool-result when the call has no inline output', () => {
    render(
      <AssistantMessageBubble
        message={msg([
          {
            type: 'tool-call',
            id: 'call-edit-1',
            name: 'edit',
            arguments: JSON.stringify({
              path: `${PROJECT_ROOT}/a.ts`,
              oldString: 'a',
              newString: 'b',
            }),
            state: 'complete',
          },
          {
            type: 'tool-result',
            toolCallId: 'call-edit-1',
            state: 'complete',
            content: {
              content: [{ type: 'text', text: 'Edited a.ts (1 replacement(s))' }],
              details: {
                path: `${PROJECT_ROOT}/a.ts`,
                diff: '@@ -1 +1 @@\n-const a = 1\n+const b = 1',
                additions: 1,
                deletions: 1,
              },
            },
          },
        ])}
        sessionId={sid}
      />,
    )
    // The unified diff body must render (added/removed lines).
    expect(hasRenderedLine('+const b = 1')).toBe(true)
    expect(hasRenderedLine('-const a = 1')).toBe(true)
  })

  it('WRITE: renders the real unified diff from the tool result (not just args.content)', () => {
    render(
      <AssistantMessageBubble
        message={msg([
          {
            type: 'tool-call',
            id: 'call-write-1',
            name: 'write',
            // Authoring mode: args.content is only a draft; the real bytes live in
            // the result diff. The rendered body must reflect the result, not this.
            arguments: JSON.stringify({
              path: `${PROJECT_ROOT}/b.ts`,
              content: 'DRAFT PLACEHOLDER',
            }),
            state: 'complete',
          },
          {
            type: 'tool-result',
            toolCallId: 'call-write-1',
            state: 'complete',
            content: {
              content: [{ type: 'text', text: 'Wrote b.ts (authored by z)' }],
              details: {
                path: `${PROJECT_ROOT}/b.ts`,
                diff: '@@ -0,0 +1 @@\n+export const real = 42',
                additions: 1,
                deletions: 0,
              },
            },
          },
        ])}
        sessionId={sid}
      />,
    )
    // The real authored line renders; the draft placeholder does not.
    expect(hasRenderedLine('+export const real = 42')).toBe(true)
    expect(screen.queryByText('DRAFT PLACEHOLDER')).not.toBeInTheDocument()
  })

  it('places the +/- counts directly after the filename, not pushed to the far right', () => {
    render(
      <AssistantMessageBubble
        message={msg([
          {
            type: 'tool-call',
            id: 'call-edit-1',
            name: 'edit',
            arguments: JSON.stringify({ path: `${PROJECT_ROOT}/a.ts` }),
            state: 'complete',
          },
          {
            type: 'tool-result',
            toolCallId: 'call-edit-1',
            state: 'complete',
            content: {
              content: [{ type: 'text', text: 'Edited a.ts' }],
              details: { diff: '@@ -1 +1 @@\n-const a = 1\n+const b = 1' },
            },
          },
        ])}
        sessionId={sid}
      />,
    )

    const header = screen.getByRole('button', { name: /EDIT.*a\.ts/i })
    const children = Array.from(header.children)
    const nameIndex = children.findIndex((el) => el.textContent === 'a.ts')
    const countsIndex = children.findIndex((el) => el.textContent === '+1-1')
    expect(nameIndex).toBeGreaterThanOrEqual(0)
    // Counts are the very next element after the filename.
    expect(countsIndex).toBe(nameIndex + 1)
    // A flex spacer follows them, so they sit beside the name rather than at the
    // extreme right edge of the strip.
    expect(children[countsIndex + 1]?.className).toContain('flex-1')
  })

  it('READ: recovers the file body from a sibling tool-result when the call has no inline output', () => {
    render(
      <AssistantMessageBubble
        message={msg([
          {
            type: 'tool-call',
            id: 'call-read-1',
            name: 'read',
            arguments: JSON.stringify({ path: `${PROJECT_ROOT}/a.ts` }),
            state: 'complete',
          },
          {
            type: 'tool-result',
            toolCallId: 'call-read-1',
            state: 'complete',
            content: {
              content: [{ type: 'text', text: '1\tconst a = 1' }],
              details: { path: `${PROJECT_ROOT}/a.ts`, lineCount: 1 },
            },
          },
        ])}
        sessionId={sid}
      />,
    )
    expect(screen.getByText(/const a = 1/)).toBeInTheDocument()
  })

  // Regression: reading an .html file used to be detected as MEDIA (the result's
  // details.path ended in .html, so getToolMediaOutput returned an HTML media
  // reference), and the media preview branch preempted FileContentView. When the
  // path was outside the active project the preview rendered as "Nothing to
  // preview." — so the read appeared EMPTY even though the body was stored fine.
  // Symmetric to the WRITE-of-.html regression below; read's body is source the
  // user wants to see, never a rendered asset.
  it('READ of an .html file shows the source, not an empty media preview', () => {
    render(
      <AssistantMessageBubble
        message={msg([
          {
            type: 'tool-call',
            id: 'call-read-html',
            name: 'read',
            arguments: JSON.stringify({ path: `${PROJECT_ROOT}/index.html` }),
            state: 'complete',
          },
          {
            type: 'tool-result',
            toolCallId: 'call-read-html',
            state: 'complete',
            content: {
              content: [{ type: 'text', text: '1\t<!DOCTYPE html>\n2\t<html><title>kofin</title></html>' }],
              details: { path: `${PROJECT_ROOT}/index.html`, lineCount: 2 },
            },
          },
        ])}
        sessionId={sid}
      />,
    )
    expect(screen.getByText(/<!DOCTYPE html>/)).toBeInTheDocument()
    expect(screen.queryByText('Media file could not be found.')).not.toBeInTheDocument()
    expect(screen.queryByText('Nothing to preview.')).not.toBeInTheDocument()
  })

  // Regression: writing an .html file used to be detected as MEDIA, and the media
  // preview branch preempted the diff — so a 437-line new page rendered as
  // "Media file could not be found." instead of showing what was written.
  it('WRITE of an .html file shows the diff, not a media preview', () => {
    render(
      <AssistantMessageBubble
        message={msg([
          {
            type: 'tool-call',
            id: 'call-write-html',
            name: 'write',
            arguments: JSON.stringify({
              path: `${PROJECT_ROOT}/index.html`,
              content: '<h1>Hello</h1>',
            }),
            state: 'complete',
          },
          {
            type: 'tool-result',
            toolCallId: 'call-write-html',
            state: 'complete',
            content: {
              content: [{ type: 'text', text: `Wrote ${PROJECT_ROOT}/index.html` }],
              details: {
                path: `${PROJECT_ROOT}/index.html`,
                diff: '@@ -0,0 +1 @@\n+<h1>Hello</h1>',
                additions: 1,
                deletions: 0,
              },
            },
          },
        ])}
        sessionId={sid}
      />,
    )
    expect(hasRenderedLine('+<h1>Hello</h1>')).toBe(true)
    expect(screen.queryByText('Media file could not be found.')).not.toBeInTheDocument()
    expect(screen.queryByText('Nothing to preview.')).not.toBeInTheDocument()
  })
})
