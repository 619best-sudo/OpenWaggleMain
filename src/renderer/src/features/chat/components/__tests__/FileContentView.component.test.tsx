import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { READ_VIEW_MAX_HEIGHT_PX } from '@/features/chat/lib/tool-call-block'
import { FileContentView } from '../FileContentView'

/**
 * The file view is ~320px tall — about sixteen rows — but read/write/edit strips
 * auto-expand and a file may run to thousands of lines. Rendering every row put
 * tens of thousands of nodes (and a `position: sticky` gutter per row) into the
 * document per expanded file, which made the whole UI lag once one was open, not
 * just that strip. These tests pin the windowing that fixes it; without them a
 * regression is invisible, because rendering everything still looks correct.
 */
function numberedFile(lineCount: number): string {
  return Array.from(
    { length: lineCount },
    (_unused, index) => `${String(index + 1)}\tconst value${String(index + 1)} = ${String(index)}`,
  ).join('\n')
}

function renderLines(container: HTMLElement): number {
  // One gutter cell per rendered row.
  return container.querySelectorAll('[aria-hidden]').length
}

describe('FileContentView windowing', () => {
  it('renders only a viewport-sized window of a long file', () => {
    const { container } = render(
      <FileContentView
        content={numberedFile(1500)}
        variant="default"
        maxHeight={READ_VIEW_MAX_HEIGHT_PX}
      />,
    )

    // Two spacer divs are aria-hidden too, so allow for them; the point is that
    // the count is bounded by the viewport, not by the file.
    expect(renderLines(container)).toBeLessThan(80)

    // The top of the file is what a freshly expanded view shows.
    expect(screen.getByText(/const value1 =/)).toBeTruthy()
    expect(screen.queryByText(/const value900 =/)).toBeNull()
  })

  it('keeps the scrollable height of the WHOLE file so the scrollbar is honest', () => {
    const { container } = render(
      <FileContentView
        content={numberedFile(1000)}
        variant="default"
        maxHeight={READ_VIEW_MAX_HEIGHT_PX}
      />,
    )

    const spacers = Array.from(container.querySelectorAll<HTMLElement>('div[aria-hidden]'))
    const spacerHeight = spacers.reduce(
      (total, node) => total + Number.parseFloat(node.style.height || '0'),
      0,
    )
    const renderedRows = renderLines(container) - spacers.length

    // Spacers stand in for exactly the rows that were not rendered.
    expect(spacerHeight).toBeGreaterThan(0)
    expect(renderedRows).toBeGreaterThan(0)
    expect(renderedRows + spacerHeight / 20.625).toBeCloseTo(1000, 0)
  })

  it('swaps in the rows around the scroll offset', async () => {
    const { container } = render(
      <FileContentView
        content={numberedFile(1500)}
        variant="default"
        maxHeight={READ_VIEW_MAX_HEIGHT_PX}
      />,
    )

    const scroller = container.querySelector('.diff-scroll')
    if (!scroller) throw new Error('Expected the scroll container')

    // Row 700 sits at 700 * 20.625px.
    Object.defineProperty(scroller, 'scrollTop', { value: 700 * 20.625, writable: true })
    fireEvent.scroll(scroller)

    // The scroll handler coalesces to one commit per animation frame.
    await waitFor(() => expect(screen.getByText(/const value701 =/)).toBeTruthy())
    expect(screen.queryByText(/const value1 =/)).toBeNull()
  })

  it('still renders every row of a short file', () => {
    render(
      <FileContentView
        content={numberedFile(5)}
        variant="default"
        maxHeight={READ_VIEW_MAX_HEIGHT_PX}
      />,
    )

    expect(screen.getByText(/const value1 =/)).toBeTruthy()
    expect(screen.getByText(/const value5 =/)).toBeTruthy()
  })
})
