import { useState } from 'react'
import {
  getMaxScrollTop,
  isScrollContainerNearBottom,
  scrollElementToBottom,
} from '@/features/chat/lib/scroll-to-bottom'
import {
  MAX_SESSION_RESTORE_RETRIES,
  SCROLL_PERSIST_DEBOUNCE_MS,
  SCROLL_UP_HYSTERESIS_PX,
  SCROLLBAR_HIDE_DELAY_MS,
  SESSION_RESTORE_RETRY_MS,
  saveScrollCache,
} from './chat-scroll-cache'
import { resolveAutoScrollSnapshot } from './chat-scroll-snapshot'
import type {
  ScrollTouchEvent,
  ScrollWheelEvent,
  UseChatScrollBehaviourParams,
  UseChatScrollBehaviourResult,
} from './chat-scroll-types'
import { useChatScrollEffects } from './useChatScrollEffects'
import { useChatScrollRefs } from './useChatScrollRefs'

export type {
  UseChatScrollBehaviourParams,
  UseChatScrollBehaviourResult,
} from './chat-scroll-types'

export function useChatScrollBehaviour(
  params: UseChatScrollBehaviourParams,
): UseChatScrollBehaviourResult {
  const {
    activeSessionId,
    rowsLength,
    streamVersion,
    isLoading,
    userDidSend,
    onUserDidSendConsumed,
  } = params
  const { lastUserMessageId } = params

  const {
    scrollerRef,
    contentRef,
    shouldAutoScrollRef,
    lastKnownScrollTopRef,
    isPointerScrollActiveRef,
    lastTouchClientYRef,
    pendingUserScrollUpIntentRef,
    pendingAutoScrollFrameRef,
    pendingRestoreTimerRef,
    restoreRetryCountRef,
    pendingRestoreScrollTopRef,
    activeSessionIdRef,
    scrollCacheRef,
    persistTimerRef,
    scrollbarTimerRef,
    actionsRef,
    effectRefs,
  } = useChatScrollRefs(activeSessionId, lastUserMessageId)

  activeSessionIdRef.current = activeSessionId

  const [showScrollbar, setShowScrollbar] = useState(false)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)

  function syncButtonVisibility() {
    setShowScrollToBottom(!shouldAutoScrollRef.current)
  }

  function saveScrollCacheSoon() {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null
      saveScrollCache(scrollCacheRef.current)
    }, SCROLL_PERSIST_DEBOUNCE_MS)
  }

  function flushScrollCache() {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current)
      persistTimerRef.current = null
    }
    saveScrollCache(scrollCacheRef.current)
  }

  function rememberScrollPosition(sessionId: string | null, scrollTop: number) {
    if (!sessionId) return
    scrollCacheRef.current.delete(sessionId)
    scrollCacheRef.current.set(sessionId, Math.max(0, scrollTop))
    saveScrollCacheSoon()
  }

  function showScrollbarTemporarily() {
    setShowScrollbar(true)
    if (scrollbarTimerRef.current) clearTimeout(scrollbarTimerRef.current)
    scrollbarTimerRef.current = setTimeout(() => {
      setShowScrollbar(false)
    }, SCROLLBAR_HIDE_DELAY_MS)
  }

  function cancelPendingStickToBottom() {
    const pendingFrame = pendingAutoScrollFrameRef.current
    if (pendingFrame === null) return
    pendingAutoScrollFrameRef.current = null
    window.cancelAnimationFrame(pendingFrame)
  }

  function cancelPendingRestoreRetry() {
    if (pendingRestoreTimerRef.current) {
      clearTimeout(pendingRestoreTimerRef.current)
      pendingRestoreTimerRef.current = null
    }
    restoreRetryCountRef.current = 0
  }

  // Abandon an in-flight session-scroll restore when the user takes control, so
  // it stops re-pinning the view. Previously only the scroll-to-bottom button did.
  function abandonPendingRestore() {
    if (pendingRestoreScrollTopRef.current === null) return
    pendingRestoreScrollTopRef.current = null
    cancelPendingRestoreRetry()
  }

  function scrollMessagesToBottom(behavior: ScrollBehavior = 'auto') {
    const scrollContainer = scrollerRef.current
    if (!scrollContainer) return
    scrollElementToBottom(scrollContainer, behavior)
    lastKnownScrollTopRef.current = scrollContainer.scrollTop
    shouldAutoScrollRef.current = true
    pendingUserScrollUpIntentRef.current = false
    pendingRestoreScrollTopRef.current = null
    syncButtonVisibility()
    rememberScrollPosition(activeSessionIdRef.current, scrollContainer.scrollTop)
  }

  function scheduleStickToBottom() {
    if (pendingAutoScrollFrameRef.current !== null) return
    pendingAutoScrollFrameRef.current = window.requestAnimationFrame(() => {
      pendingAutoScrollFrameRef.current = null
      if (!shouldAutoScrollRef.current) return
      scrollMessagesToBottom()
    })
  }

  function applyPendingRestore() {
    const scrollContainer = scrollerRef.current
    const target = pendingRestoreScrollTopRef.current
    if (!scrollContainer || target === null) return false

    const maxScrollTop = getMaxScrollTop(scrollContainer)
    const nextScrollTop = Math.min(target, maxScrollTop)
    scrollContainer.scrollTop = nextScrollTop
    lastKnownScrollTopRef.current = nextScrollTop

    const fullyRestored = maxScrollTop >= target
    shouldAutoScrollRef.current = fullyRestored && isScrollContainerNearBottom(scrollContainer)
    syncButtonVisibility()

    if (!fullyRestored) {
      return true
    }

    pendingRestoreScrollTopRef.current = null
    rememberScrollPosition(activeSessionIdRef.current, nextScrollTop)
    return false
  }

  function scheduleRestoreRetry() {
    if (pendingRestoreTimerRef.current !== null) return
    pendingRestoreTimerRef.current = setTimeout(() => {
      pendingRestoreTimerRef.current = null
      restoreRetryCountRef.current += 1
      if (restoreRetryCountRef.current > MAX_SESSION_RESTORE_RETRIES) {
        // Target is unreachable (session shorter than the saved position, or
        // content stopped growing short of it). Give up instead of re-pinning the
        // view forever, which would trap the user at the bottom.
        abandonPendingRestore()
        return
      }
      if (applyPendingRestore()) {
        scheduleRestoreRetry()
      } else {
        restoreRetryCountRef.current = 0
      }
    }, SESSION_RESTORE_RETRY_MS)
  }

  function scrollToBottom() {
    cancelPendingStickToBottom()
    cancelPendingRestoreRetry()
    scrollMessagesToBottom('smooth')
    scheduleStickToBottom()
  }

  function handleScroll() {
    const scrollContainer = scrollerRef.current
    if (!scrollContainer) return

    showScrollbarTemporarily()

    const currentScrollTop = scrollContainer.scrollTop
    // A position differing from our last programmatic write means a user-initiated
    // scroll (any input). Abandon a pending restore so it stops snapping back; our
    // own restore/stick writes keep `lastKnownScrollTopRef` in sync, so they don't
    // trip this.
    if (currentScrollTop !== lastKnownScrollTopRef.current) {
      abandonPendingRestore()
    }
    const isNearBottom = isScrollContainerNearBottom(scrollContainer)
    const nextAutoScroll = resolveAutoScrollSnapshot({
      currentScrollTop,
      isNearBottom,
      lastKnownScrollTop: lastKnownScrollTopRef.current,
      pendingUserScrollUpIntent: pendingUserScrollUpIntentRef.current,
      shouldAutoScroll: shouldAutoScrollRef.current,
    })

    if (nextAutoScroll.shouldCancelPendingStickToBottom) cancelPendingStickToBottom()

    shouldAutoScrollRef.current = nextAutoScroll.shouldAutoScroll
    pendingUserScrollUpIntentRef.current = nextAutoScroll.pendingUserScrollUpIntent
    syncButtonVisibility()
    lastKnownScrollTopRef.current = currentScrollTop
    rememberScrollPosition(activeSessionIdRef.current, currentScrollTop)
  }

  function optOutOfAutoScrollForUserIntent() {
    const scrollContainer = scrollerRef.current
    pendingUserScrollUpIntentRef.current = true
    // Scrolling up is an explicit signal to stop any restore/auto-follow.
    abandonPendingRestore()
    if (!scrollContainer || scrollContainer.scrollTop <= 0) return

    shouldAutoScrollRef.current = false
    cancelPendingStickToBottom()
    syncButtonVisibility()
  }

  function handleWheel(event: ScrollWheelEvent) {
    if (event.deltaY < 0) {
      optOutOfAutoScrollForUserIntent()
    }
  }

  function handleTouchStart(event: ScrollTouchEvent) {
    const touch = event.touches[0]
    if (!touch) return
    lastTouchClientYRef.current = touch.clientY
  }

  function handleTouchMove(event: ScrollTouchEvent) {
    const touch = event.touches[0]
    if (!touch) return
    const previousTouchY = lastTouchClientYRef.current
    if (previousTouchY !== null && touch.clientY > previousTouchY + SCROLL_UP_HYSTERESIS_PX) {
      optOutOfAutoScrollForUserIntent()
    }
    lastTouchClientYRef.current = touch.clientY
  }

  actionsRef.current = {
    applyPendingRestore,
    cancelPendingRestoreRetry,
    cancelPendingStickToBottom,
    flushScrollCache,
    scheduleRestoreRetry,
    scheduleStickToBottom,
    scrollMessagesToBottom,
    syncButtonVisibility,
  }

  const effectParams = {
    activeSessionId,
    lastUserMessageId,
    rowsLength,
    streamVersion,
    isLoading,
    userDidSend,
    onUserDidSendConsumed,
    refs: effectRefs,
  }
  useChatScrollEffects(effectParams)

  return {
    scrollerRef,
    contentRef,
    showScrollbar,
    showScrollToBottom,
    scrollToBottom,
    handleScroll,
    handleWheel,
    handlePointerDown: () => {
      isPointerScrollActiveRef.current = true
    },
    handlePointerUp: () => {
      isPointerScrollActiveRef.current = false
    },
    handlePointerCancel: () => {
      isPointerScrollActiveRef.current = false
    },
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd: () => {
      lastTouchClientYRef.current = null
    },
  }
}
