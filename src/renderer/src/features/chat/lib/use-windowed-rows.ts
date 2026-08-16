/**
 * Row windowing for the tool-call code views (file bodies and diffs).
 *
 * Those views are ~320px tall — about sixteen rows — but read/write/edit strips
 * auto-expand and a file or whole-file diff runs to thousands of rows. Rendering
 * all of them put tens of thousands of nodes into the document per expanded
 * tool, each code row carrying a `position: sticky` gutter. Several expanded
 * tools in one transcript pushed the page into six figures of nodes, and from
 * then on every paint, scroll and sticky recalculation paid for all of it — so
 * opening one file view made the WHOLE UI lag, not just that strip.
 *
 * Only the rows near the viewport are rendered; spacer blocks stand in for the
 * rest so the scrollbar and scroll offsets still describe the whole content.
 *
 * Requires UNIFORM row height, which both callers guarantee by setting an
 * explicit `lineHeight` and never wrapping (`whitespace-pre` inside a `w-max`
 * track). The row height must BE the rendered height, not an estimate — the
 * mapping from scroll offset to row index depends on it exactly.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/** Rows rendered beyond the viewport on each side, so fast scrolls stay filled. */
const OVERSCAN_ROWS = 12

export interface WindowedRows {
  /** Attach to the scrolling element. */
  readonly scrollRef: (node: HTMLDivElement | null) => void
  /** Attach to the scrolling element's `onScroll`. */
  readonly onScroll: () => void
  /** First rendered row index, inclusive. */
  readonly firstRow: number
  /** Last rendered row index, exclusive. */
  readonly lastRow: number
  /** Height in px of the spacer standing in for the rows above `firstRow`. */
  readonly topSpacerPx: number
  /** Height in px of the spacer standing in for the rows from `lastRow` on. */
  readonly bottomSpacerPx: number
}

export function useWindowedRows(
  totalRows: number,
  rowHeightPx: number,
  viewportHeightPx: number,
): WindowedRows {
  const nodeRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<number | null>(null)
  const [scrollTop, setScrollTop] = useState(0)

  const scrollRef = useCallback((node: HTMLDivElement | null) => {
    nodeRef.current = node
  }, [])

  const onScroll = useCallback(() => {
    // Coalesce to one state commit per frame: scroll events fire faster than
    // paints, and each commit re-renders the row window.
    if (frameRef.current !== null) return
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      setScrollTop(nodeRef.current?.scrollTop ?? 0)
    })
  }, [])

  useEffect(
    () => () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
    },
    [],
  )

  const rowsInViewport = Math.ceil(viewportHeightPx / rowHeightPx)
  const firstRow = Math.max(0, Math.floor(scrollTop / rowHeightPx) - OVERSCAN_ROWS)
  const lastRow = Math.min(totalRows, firstRow + rowsInViewport + OVERSCAN_ROWS * 2)

  return {
    scrollRef,
    onScroll,
    firstRow,
    lastRow,
    topSpacerPx: firstRow * rowHeightPx,
    bottomSpacerPx: Math.max(0, totalRows - lastRow) * rowHeightPx,
  }
}
