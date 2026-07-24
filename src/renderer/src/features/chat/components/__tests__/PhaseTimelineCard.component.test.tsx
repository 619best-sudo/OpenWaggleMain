import { getAgentPhaseTitle } from '@shared/types/phase-titles'
import { fireEvent, render, screen } from '@testing-library/react'
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

describe('PhaseTimelineCard', () => {
  it('renders colored mutation badges and expands diff details for write tools', () => {
    render(<PhaseTimelineCard row={makePhaseRow()} />)

    expect(screen.getByText('WRITE')).toBeInTheDocument()
    expect(screen.getByText('READ')).toBeInTheDocument()
    expect(screen.getByTitle('1 lines added')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /WRITE.*src\/app\.ts/i }))

    expect(screen.getByText('content:')).toBeInTheDocument()
    expect(screen.getByText(/const updated = 2;/i)).toBeInTheDocument()
  })
})
