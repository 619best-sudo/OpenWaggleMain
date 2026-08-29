import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { UnifiedDiffData } from '@/features/chat/lib/tool-call-block'
import { UnifiedDiffView } from '../ToolCallBlockParts'

/** Build the parsed-diff shape `getToolDiffData` produces. */
function toDiff(text: string): UnifiedDiffData {
  let additions = 0
  let deletions = 0
  const lines = text.split('\n').map((content) => {
    if (content.startsWith('+++') || content.startsWith('---') || content.startsWith('@@')) {
      return { type: 'meta' as const, content }
    }
    if (content.startsWith('+')) {
      additions += 1
      return { type: 'add' as const, content }
    }
    if (content.startsWith('-')) {
      deletions += 1
      return { type: 'remove' as const, content }
    }
    return { type: 'context' as const, content }
  })
  return { text, lines, additions, deletions }
}

describe('UnifiedDiffView presentation', () => {
  it('drops the --- / +++ file headers and a lone @@ hunk header', () => {
    const diff = toDiff(
      [
        '--- /Users/me/Test/index.html',
        '+++ /Users/me/Test/index.html',
        '@@ -1,426 +1,426 @@',
        '-  background: yellow;',
        '+  background: green;',
      ].join('\n'),
    )

    render(<UnifiedDiffView diff={diff} compact path="/Users/me/Test/index.html" />)

    // The path headers repeat what the strip header already shows — gone.
    expect(screen.queryByText(/^--- /)).not.toBeInTheDocument()
    expect(screen.queryByText(/^\+\+\+ /)).not.toBeInTheDocument()
    // A single hunk header separates nothing — gone.
    expect(screen.queryByText('@@ -1,426 +1,426 @@')).not.toBeInTheDocument()
    // The actual change still renders (leading indentation is preserved in the
    // DOM, so match without testing-library's whitespace normalization).
    const keepWhitespace = { normalizer: (text: string) => text }
    expect(screen.getByText('  background: green;', keepWhitespace)).toBeInTheDocument()
    expect(screen.getByText('  background: yellow;', keepWhitespace)).toBeInTheDocument()
  })

  it('keeps @@ headers when there are multiple hunks, since they separate regions', () => {
    const diff = toDiff(['@@ -1,2 +1,2 @@', '-a', '+b', '@@ -50,2 +50,2 @@', '-c', '+d'].join('\n'))

    render(<UnifiedDiffView diff={diff} compact path="/x/a.ts" />)

    expect(screen.getByText('@@ -1,2 +1,2 @@')).toBeInTheDocument()
    expect(screen.getByText('@@ -50,2 +50,2 @@')).toBeInTheDocument()
  })

  it('highlights added rows green and removed rows red, with a bold accent bar', () => {
    const diff = toDiff(
      ['@@ -1,3 +1,3 @@', ' kept', '-  background: yellow;', '+  background: green;'].join('\n'),
    )

    const { container } = render(<UnifiedDiffView diff={diff} compact path="/a/index.html" />)
    const rows = Array.from(container.querySelectorAll('div.flex'))

    const addRow = rows.find((row) => row.textContent?.includes('background: green;'))
    const removeRow = rows.find((row) => row.textContent?.includes('background: yellow;'))
    const contextRow = rows.find((row) => row.textContent?.endsWith('kept'))

    // Added → green wash; removed → red wash.
    expect(addRow?.className).toContain('bg-code-view-add-bg')
    expect(removeRow?.className).toContain('bg-code-view-remove-bg')

    // The accent bar rides on the STICKY gutter, not the row, so it stays
    // pinned while the code scrolls horizontally instead of sliding away.
    const gutterOf = (row: Element | undefined) => row?.querySelector('span.sticky')
    expect(gutterOf(addRow)?.className).toContain('border-l-code-view-add-accent')
    expect(gutterOf(removeRow)?.className).toContain('border-l-code-view-remove-accent')

    // Unchanged context rows stay untinted, so the changes are what stands out.
    expect(contextRow?.className).not.toContain('bg-code-view-add-bg')
    expect(contextRow?.className).not.toContain('bg-code-view-remove-bg')
    // Their bar takes the gutter's own colour rather than `transparent`, which
    // would let the card background show through as a bright line.
    expect(gutterOf(contextRow)?.className).toContain('border-l-code-view-gutter-bg')
  })

  it('numbers rows from the hunk header and scrolls on both axes', () => {
    const diff = toDiff(
      ['@@ -1,2 +7,2 @@', ' kept', '+added', '@@ -30,1 +40,1 @@', '+later'].join('\n'),
    )

    const { container } = render(<UnifiedDiffView diff={diff} compact path="/x/a.ts" />)

    // New-file numbering starts at the hunk's `+7`, and a removed-line-free hunk
    // advances one per row: ' kept' → 7, '+added' → 8.
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    // The second hunk restarts numbering at 40 rather than continuing from 9.
    expect(screen.getByText('40')).toBeInTheDocument()

    // Scrollable in both directions (long lines and long diffs stay reachable).
    const scroller = container.querySelector('.diff-scroll')
    expect(scroller).not.toBeNull()
    expect(scroller?.className).toContain('overflow-auto')
  })

  it('windows a long compact diff instead of rendering every row', () => {
    // A whole-file write/edit yields a diff row per line of the file, each with
    // a `position: sticky` gutter, into a 320px-tall box. Rendering them all put
    // the document into six figures of nodes once a few strips were expanded,
    // which is what made the whole UI lag — not just the strip.
    const diff = toDiff(
      Array.from({ length: 1200 }, (_unused, index) => `+line ${String(index + 1)}`).join('\n'),
    )

    const { container } = render(<UnifiedDiffView diff={diff} compact path="/x/a.ts" />)

    const rowCount = container.querySelectorAll('span.sticky').length
    expect(rowCount).toBeGreaterThan(0)
    expect(rowCount).toBeLessThan(80)
    expect(screen.getByText(/line 1$/)).toBeInTheDocument()
    expect(screen.queryByText(/line 900$/)).toBeNull()
  })

  it('renders every row when NOT compact, where there is no scrolling viewport', () => {
    // Without `compact` the container has no max height, so it never scrolls and
    // there is no offset to window against — hiding rows would strand them.
    const diff = toDiff(
      Array.from({ length: 300 }, (_unused, index) => `+line ${String(index + 1)}`).join('\n'),
    )

    const { container } = render(<UnifiedDiffView diff={diff} path="/x/a.ts" />)

    expect(container.querySelectorAll('span.sticky')).toHaveLength(300)
  })
})
