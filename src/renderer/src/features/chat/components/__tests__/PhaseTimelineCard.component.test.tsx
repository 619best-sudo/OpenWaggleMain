import { getAgentPhaseTitle } from '@shared/types/phase-titles'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PhaseTimelineCard } from '../PhaseTimelineCard'

function makePhaseRow() {
  return {
    type: 'phase' as const,
    id: 'phase:perform',
    phase: {
      id: 'perform' as const,
      label: getAgentPhaseTitle('perform'),
      activityText: 'Making the requested changes.',
      status: 'completed' as const,
      elapsedMs: 2_000,
      tools: [
        {
          toolCallId: 'write-1',
          toolName: 'write',
          status: 'completed' as const,
          toolCall: {
            type: 'tool-call' as const,
            id: 'write-1',
            name: 'write',
            arguments: '{"path":"src/app.ts","content":"const updated = 2;\\n"}',
            state: 'output-available' as const,
          },
          toolResult: {
            type: 'tool-result' as const,
            toolCallId: 'write-1',
            content: {
              content: [{ type: 'text', text: 'Wrote src/app.ts' }],
              details: {
                diff: '@@ -1 +1 @@\n-const original = 1;\n+const updated = 2;',
                additions: 1,
                deletions: 1,
              },
            },
            state: 'complete' as const,
          },
        },
        {
          toolCallId: 'read-1',
          toolName: 'read',
          status: 'completed' as const,
          toolCall: {
            type: 'tool-call' as const,
            id: 'read-1',
            name: 'read',
            arguments: '{"path":"src/app.ts"}',
            state: 'output-available' as const,
          },
          toolResult: {
            type: 'tool-result' as const,
            toolCallId: 'read-1',
            content: 'const updated = 2;\n',
            state: 'complete' as const,
          },
        },
      ],
      summary: 'Updated the file and verified the result.',
    },
  }
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

describe('PhaseTimelineCard', () => {
  it('renders colored mutation badges and shows the written file for write tools', () => {
    render(<PhaseTimelineCard row={makePhaseRow()} />)

    expect(screen.getByText('WRITE')).toBeInTheDocument()
    expect(screen.getByText('READ')).toBeInTheDocument()
    // Write now surfaces the harness-computed unified diff, so both an added and a
    // removed count appear. Each count renders EXACTLY ONCE — in the strip header
    // beside the filename, not also inside the expanded diff body.
    expect(screen.getAllByTitle('1 lines added')).toHaveLength(1)
    expect(screen.getAllByTitle('1 lines removed')).toHaveLength(1)

    // The action chip sits to the LEFT of the path (consistent across all
    // tools), so the accessible button name is "WRITE ... src/app.ts".
    expect(screen.getByRole('button', { name: /WRITE.*src\/app\.ts/i })).toBeInTheDocument()

    // write auto-expands to the REAL diff (removed + added lines), not the raw
    // args.content dump.
    expect(hasRenderedLine('+const updated = 2;')).toBe(true)
    expect(hasRenderedLine('-const original = 1;')).toBe(true)
    // The auto-expanded read card still shows the file content.
    expect(screen.getAllByText(/const updated = 2;/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('content:')).not.toBeInTheDocument()
  })
})
