import { type RefObject, useEffect } from 'react'

/** Sub-pixel slack, so a scroller resting at its end counts as at its end. */
const EDGE_EPSILON_PX = 1

/** Does this element scroll vertically under its own overflow rules? */
function isVerticalScroller(el: HTMLElement) {
  if (el.scrollHeight <= el.clientHeight + EDGE_EPSILON_PX) return false
  const overflowY = getComputedStyle(el).overflowY
  return overflowY === 'auto' || overflowY === 'scroll'
}

/** Can `el` still move in the wheel's direction? */
function canConsume(el: HTMLElement, deltaY: number) {
  if (deltaY > 0) {
    return el.scrollTop + el.clientHeight < el.scrollHeight - EDGE_EPSILON_PX
  }
  return el.scrollTop > 0
}

/**
 * Keeps the transcript scrolling when the pointer is over an inline block.
 *
 * Blocks embedded in the transcript — thinking bodies, file views, diffs, tool
 * output — have their own capped, scrollable boxes, and two browser behaviours
 * make those boxes swallow the page scroll:
 *
 *  1. `overscroll-behavior: contain` stops the scroll chaining to the ancestor
 *     at all. (Removed from the transcript's blocks; it is the wrong default
 *     inside a document you are meant to read straight through.)
 *  2. Chromium LATCHES a wheel gesture to whichever scroller it started on. Even
 *     with chaining allowed, trackpad momentum that begins over an inline block
 *     keeps targeting that block until the gesture ends — so the transcript
 *     freezes while the pointer happens to rest over a code view.
 *
 * CSS only fixes the first. So this listens once on the transcript itself,
 * where every inline block's wheel event bubbles through, and redirects the
 * delta whenever no scroller between the target and the transcript can use it.
 * One delegated listener rather than a hook per block: it covers the blocks
 * that exist now and any added later, with nothing to remember to wire up.
 *
 * Horizontal intent is left alone — a diff scrolled sideways must keep working
 * — so only predominantly vertical gestures are ever redirected.
 */
export function useChainedWheel(transcriptRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const transcript = transcriptRef.current
    if (!transcript) return

    function onWheel(event: WheelEvent) {
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
      if (event.deltaY === 0) return
      const scroller = transcriptRef.current
      if (!scroller) return

      // Walk from the wheel's target up to the transcript, looking for an inner
      // scroller with room left. `composedPath` is not used: these are plain
      // elements, and `parentElement` stops cleanly at the transcript.
      let node = event.target instanceof HTMLElement ? event.target : null
      while (node && node !== scroller) {
        if (isVerticalScroller(node) && canConsume(node, event.deltaY)) return
        node = node.parentElement
      }

      // Nothing inside wanted it — drive the transcript directly, so a latched
      // gesture cannot strand the page.
      if (!canConsume(scroller, event.deltaY)) return
      scroller.scrollTop += event.deltaY
      event.preventDefault()
    }

    // Non-passive: the whole point is to cancel the default target and redirect.
    transcript.addEventListener('wheel', onWheel, { passive: false })
    return () => transcript.removeEventListener('wheel', onWheel)
  }, [transcriptRef])
}
