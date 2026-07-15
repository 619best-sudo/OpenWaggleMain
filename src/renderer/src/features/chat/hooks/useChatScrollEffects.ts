import { useLayoutEffect } from 'react'
import { saveScrollCache } from './chat-scroll-cache'
import type { MutableValueRef, ScrollActions } from './chat-scroll-types'

const DEBUG_SERVER_URL = 'http://127.0.0.1:7777/event'
const DEBUG_RUN_ID = 'post-fix'

export interface ScrollEffectRefs {
  readonly scrollerRef: MutableValueRef<HTMLDivElement | null>
  readonly contentRef: MutableValueRef<HTMLDivElement | null>
  readonly shouldAutoScrollRef: MutableValueRef<boolean>
  readonly lastTouchClientYRef: MutableValueRef<number | null>
  readonly pendingUserScrollUpIntentRef: MutableValueRef<boolean>
  readonly isPointerScrollActiveRef: MutableValueRef<boolean>
  readonly pendingRestoreScrollTopRef: MutableValueRef<number | null>
  readonly lastRestoredSessionRef: MutableValueRef<string | null>
  readonly hasRestoredScrollRef: MutableValueRef<boolean>
  readonly previousLastUserMessageIdRef: MutableValueRef<string | null>
  readonly switchBaselineLastUserMessageIdRef: MutableValueRef<string | null>
  readonly scrollCacheRef: MutableValueRef<Map<string, number>>
  readonly persistTimerRef: MutableValueRef<ReturnType<typeof setTimeout> | null>
  readonly scrollbarTimerRef: MutableValueRef<ReturnType<typeof setTimeout> | null>
  readonly actionsRef: MutableValueRef<ScrollActions | null>
}

interface UseChatScrollEffectsParams {
  readonly activeSessionId: string | null
  readonly lastUserMessageId: string | null
  readonly rowsLength: number
  readonly streamVersion: number
  readonly isLoading: boolean
  readonly userDidSend: boolean
  readonly onUserDidSendConsumed: () => void
  readonly refs: ScrollEffectRefs
}

function clearSessionScrollState(activeSessionId: string | null, refs: ScrollEffectRefs) {
  const actions = refs.actionsRef.current
  if (!actions) return

  const previous = refs.lastRestoredSessionRef.current
  if (previous && previous !== activeSessionId) {
    actions.flushScrollCache()
    refs.switchBaselineLastUserMessageIdRef.current = refs.previousLastUserMessageIdRef.current
  }

  refs.hasRestoredScrollRef.current = false
  refs.lastRestoredSessionRef.current = activeSessionId
  refs.pendingRestoreScrollTopRef.current = null
  refs.pendingUserScrollUpIntentRef.current = false
  refs.shouldAutoScrollRef.current = true
  refs.lastTouchClientYRef.current = null
  refs.isPointerScrollActiveRef.current = false
  actions.cancelPendingStickToBottom()
  actions.cancelPendingRestoreRetry()
  actions.syncButtonVisibility()
}

interface RestoreSessionScrollParams {
  readonly activeSessionId: string | null
  readonly lastUserMessageId: string | null
  readonly rowsLength: number
  readonly userDidSend: boolean
  readonly refs: ScrollEffectRefs
}

function restoreSessionScroll({
  activeSessionId,
  lastUserMessageId,
  rowsLength,
  userDidSend,
  refs,
}: RestoreSessionScrollParams) {
  if (refs.hasRestoredScrollRef.current || !activeSessionId || rowsLength === 0 || userDidSend) {
    return
  }

  const switchBaselineLastUserMessageId = refs.switchBaselineLastUserMessageIdRef.current
  if (
    switchBaselineLastUserMessageId !== null &&
    lastUserMessageId === switchBaselineLastUserMessageId
  ) {
    return
  }
  refs.switchBaselineLastUserMessageIdRef.current = null

  const scrollContainer = refs.scrollerRef.current
  const actions = refs.actionsRef.current
  if (!scrollContainer || !actions) return

  const persisted = refs.scrollCacheRef.current.get(activeSessionId)
  if (persisted !== undefined && persisted > 0) {
    refs.pendingRestoreScrollTopRef.current = persisted
    if (actions.applyPendingRestore()) {
      actions.scheduleRestoreRetry()
    }
  } else {
    actions.scrollMessagesToBottom()
  }

  refs.hasRestoredScrollRef.current = true
}

interface ConsumeUserSendScrollParams {
  readonly isLoading: boolean
  readonly rowsLength: number
  readonly userDidSend: boolean
  readonly onUserDidSendConsumed: () => void
  readonly refs: ScrollEffectRefs
}

function consumeUserSendScroll({
  isLoading,
  rowsLength,
  userDidSend,
  onUserDidSendConsumed,
  refs,
}: ConsumeUserSendScrollParams) {
  if (!userDidSend || !isLoading || rowsLength === 0 || !refs.scrollerRef.current) return

  const actions = refs.actionsRef.current
  if (!actions) return

  actions.cancelPendingRestoreRetry()
  refs.pendingRestoreScrollTopRef.current = null
  refs.shouldAutoScrollRef.current = true
  refs.pendingUserScrollUpIntentRef.current = false
  refs.hasRestoredScrollRef.current = true
  actions.scrollMessagesToBottom()
  actions.scheduleStickToBottom()
  onUserDidSendConsumed()
}

function persistLatestScrollPosition(refs: ScrollEffectRefs) {
  const sessionId = refs.lastRestoredSessionRef.current
  const scroller = refs.scrollerRef.current
  if (sessionId && scroller) {
    refs.scrollCacheRef.current.delete(sessionId)
    refs.scrollCacheRef.current.set(sessionId, Math.max(0, scroller.scrollTop))
  }
  saveScrollCache(refs.scrollCacheRef.current)
}

export function useChatScrollEffects(params: UseChatScrollEffectsParams) {
  const {
    activeSessionId,
    lastUserMessageId,
    rowsLength,
    streamVersion,
    isLoading,
    userDidSend,
    onUserDidSendConsumed,
    refs,
  } = params

  useLayoutEffect(() => {
    const content = refs.contentRef.current
    if (!content || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      const actions = refs.actionsRef.current
      if (!actions) return
      if (refs.pendingRestoreScrollTopRef.current !== null) {
        if (actions.applyPendingRestore()) {
          actions.scheduleRestoreRetry()
        }
        return
      }
      if (!refs.shouldAutoScrollRef.current) return
      // #region debug-point A:resize-observer-stick
      void fetch(DEBUG_SERVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'permission-transcript-shift',
          runId: DEBUG_RUN_ID,
          hypothesisId: 'A',
          location: 'useChatScrollEffects.ts:ResizeObserver',
          msg: '[DEBUG] Transcript resize observer scheduled stick-to-bottom',
          data: {
            activeSessionId,
            rowsLength,
            streamVersion,
            isLoading,
            scrollTop: refs.scrollerRef.current?.scrollTop ?? null,
            scrollHeight: refs.scrollerRef.current?.scrollHeight ?? null,
            clientHeight: refs.scrollerRef.current?.clientHeight ?? null,
          },
          ts: Date.now(),
        }),
      }).catch(() => {})
      // #endregion
      actions.scheduleStickToBottom()
    })

    observer.observe(content)
    return () => observer.disconnect()
  }, [refs])

  useLayoutEffect(() => clearSessionScrollState(activeSessionId, refs), [activeSessionId, refs])
  useLayoutEffect(
    () =>
      restoreSessionScroll({
        activeSessionId,
        lastUserMessageId,
        rowsLength,
        userDidSend,
        refs,
      }),
    [activeSessionId, lastUserMessageId, rowsLength, userDidSend, refs],
  )
  useLayoutEffect(() => {
    refs.previousLastUserMessageIdRef.current = lastUserMessageId
  }, [lastUserMessageId, refs])
  useLayoutEffect(
    () =>
      consumeUserSendScroll({
        isLoading,
        rowsLength,
        userDidSend,
        onUserDidSendConsumed,
        refs,
      }),
    [isLoading, rowsLength, userDidSend, onUserDidSendConsumed, refs],
  )
  useLayoutEffect(() => {
    const hasContentSignal = rowsLength > 0 || streamVersion > 0
    if (!isLoading && !hasContentSignal) return
    if (!refs.shouldAutoScrollRef.current) return
    refs.actionsRef.current?.scheduleStickToBottom()
  }, [isLoading, rowsLength, streamVersion, refs])

  useLayoutEffect(() => {
    return () => {
      refs.actionsRef.current?.cancelPendingStickToBottom()
      refs.actionsRef.current?.cancelPendingRestoreRetry()
      if (refs.persistTimerRef.current) clearTimeout(refs.persistTimerRef.current)
      if (refs.scrollbarTimerRef.current) clearTimeout(refs.scrollbarTimerRef.current)
      persistLatestScrollPosition(refs)
    }
  }, [refs])
}
