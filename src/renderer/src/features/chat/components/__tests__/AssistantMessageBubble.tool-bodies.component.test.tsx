import { SessionId } from '@shared/types/brand'
import type { UIMessage } from '@shared/types/chat-ui'
import { fireEvent, render, screen } from '@testing-library/react'
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

function renderBubble(parts: MessagePart[]) {
  return render(<AssistantMessageBubble message={msg(parts)} sessionId={sid} />)
}

describe('tool strip bodies', () => {
  it('READ: keeps trailing commentary out of the numbered file view', () => {
    renderBubble([
      {
        type: 'tool-call',
        id: 'call-read-1',
        name: 'read',
        arguments: JSON.stringify({ path: `${PROJECT_ROOT}/a.ts` }),
        state: 'complete',
        output: {
          content: [
            { type: 'text', text: '1\tconst a = 1\n2\tconst b = 2' },
            { type: 'text', text: 'Truncated after 2 lines to stay under the limit.' },
          ],
        },
      },
    ])

    // The reasoning is collapsed behind a badge at the bottom of the file...
    const toggle = screen.getByRole('button', { name: /Show reasoning/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/Truncated after 2 lines/)).not.toBeInTheDocument()

    // ...and NOT a numbered line of the file. The file has two lines, so a
    // gutter showing "3" would mean the note had been folded into the source.
    expect(screen.queryByText('3')).not.toBeInTheDocument()

    // Expanding shows it below the file, as plain prose.
    fireEvent.click(toggle)
    expect(screen.getByText(/Truncated after 2 lines/)).toBeInTheDocument()
    expect(screen.queryByText('3')).not.toBeInTheDocument()
  })

  it('READ: splits the harness single-block shape (numbered bytes + tail)', () => {
    // What `readTool` actually returns: bytes and reasoning concatenated in ONE
    // text block. The tail must not render as the file's third line.
    renderBubble([
      {
        type: 'tool-call',
        id: 'call-read-tail',
        name: 'read',
        arguments: JSON.stringify({ path: `${PROJECT_ROOT}/a.ts` }),
        state: 'complete',
        output: {
          content: [
            {
              type: 'text',
              text: '1\tconst a = 1\n2\tconst b = 2\n\nREGIONS: 1-2 — demo\nNEXT FILE: ../x.ts',
            },
          ],
        },
      },
    ])

    fireEvent.click(screen.getByRole('button', { name: /Show reasoning/i }))
    expect(screen.getByText(/REGIONS: 1-2 — demo/)).toBeInTheDocument()
    // Two file lines only: no gutter "3"/"4"/"5" for the tail.
    expect(screen.queryByText('3')).not.toBeInTheDocument()
  })

  it('READ: renders no reasoning badge when the result has no notes', () => {
    renderBubble([
      {
        type: 'tool-call',
        id: 'call-read-2',
        name: 'read',
        arguments: JSON.stringify({ path: `${PROJECT_ROOT}/a.ts` }),
        state: 'complete',
        output: { content: [{ type: 'text', text: '1\tconst a = 1' }] },
      },
    ])

    expect(screen.queryByRole('button', { name: /reasoning/i })).not.toBeInTheDocument()
  })

  it('BASH: hides shell output until the strip is clicked', () => {
    renderBubble([
      {
        type: 'tool-call',
        id: 'call-bash-1',
        name: 'bash',
        arguments: JSON.stringify({ command: 'pnpm test' }),
        state: 'complete',
        output: { content: [{ type: 'text', text: 'ok: 42 passed' }] },
      },
    ])

    expect(screen.queryByText('ok: 42 passed')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { expanded: false }))

    expect(screen.getByText('ok: 42 passed')).toBeInTheDocument()
  })

  it('does not auto-expand a failed read', () => {
    renderBubble([
      {
        type: 'tool-call',
        id: 'call-read-3',
        name: 'read',
        arguments: JSON.stringify({ path: `${PROJECT_ROOT}/missing.ts` }),
        state: 'error',
        error: 'ENOENT: no such file',
        output: { content: [{ type: 'text', text: 'ENOENT: no such file' }] },
      },
    ])

    // The failure is reported in the header, and the body stays shut: an error
    // payload is not the file view the auto-expansion was for.
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument()
  })
})
