import { SCROLL_UP_HYSTERESIS_PX } from './chat-scroll-cache'

export interface ScrollPositionSnapshot {
  readonly currentScrollTop: number
  readonly isNearBottom: boolean
  readonly lastKnownScrollTop: number
  readonly pendingUserScrollUpIntent: boolean
  readonly shouldAutoScroll: boolean
}

function scrolledUpBeyondHysteresis(currentScrollTop: number, lastKnownScrollTop: number) {
  return currentScrollTop < lastKnownScrollTop - SCROLL_UP_HYSTERESIS_PX
}

/**
 * Given the current scroll position, decide whether auto-follow (stick to bottom)
 * should stay on. Re-attaches when the user returns near the bottom; detaches
 * when the user scrolls up beyond the hysteresis threshold.
 */
export function resolveAutoScrollSnapshot(snapshot: ScrollPositionSnapshot) {
  if (!snapshot.shouldAutoScroll && snapshot.isNearBottom) {
    return {
      pendingUserScrollUpIntent: false,
      shouldAutoScroll: true,
      shouldCancelPendingStickToBottom: false,
    }
  }

  const userDetachedFromBottom =
    snapshot.shouldAutoScroll &&
    !snapshot.isNearBottom &&
    scrolledUpBeyondHysteresis(snapshot.currentScrollTop, snapshot.lastKnownScrollTop)
  const shouldAutoScroll = userDetachedFromBottom ? false : snapshot.shouldAutoScroll

  return {
    pendingUserScrollUpIntent: snapshot.pendingUserScrollUpIntent
      ? false
      : snapshot.pendingUserScrollUpIntent,
    shouldAutoScroll,
    shouldCancelPendingStickToBottom: snapshot.shouldAutoScroll && !shouldAutoScroll,
  }
}
