import type { SessionId } from '@shared/types/brand'
import type { ContextUsageSnapshot } from '@shared/types/context-usage'
import type { SupportedModelId } from '@shared/types/llm'
import { useEffect, useState } from 'react'
import { api } from '@/shared/lib/ipc'
import { createRendererLogger } from '@/shared/lib/logger'

const logger = createRendererLogger('context-meter')

interface ContextUsageRequestState {
  readonly key: string
  readonly snapshot: ContextUsageSnapshot | null
  readonly failed: boolean
}

interface UseContextUsageSnapshotInput {
  readonly activeSessionId: SessionId | null
  readonly selectedModel: SupportedModelId
  readonly requestKey: string
}

export function useContextUsageSnapshot({
  activeSessionId,
  selectedModel,
  requestKey,
}: UseContextUsageSnapshotInput) {
  const [requestState, setRequestState] = useState<ContextUsageRequestState>({
    key: '',
    snapshot: null,
    failed: false,
  })

  useEffect(() => {
    if (!activeSessionId || typeof api.getContextUsage !== 'function') return

    let cancelled = false
    const currentRequestKey = requestKey

    api
      .getContextUsage(activeSessionId, selectedModel)
      .then((snapshot) => {
        if (!cancelled) setRequestState({ key: currentRequestKey, snapshot, failed: false })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        logger.warn('Failed to load context usage', {
          error: error instanceof Error ? error.message : String(error),
        })
        setRequestState({ key: currentRequestKey, snapshot: null, failed: true })
      })

    return () => {
      cancelled = true
    }
  }, [activeSessionId, selectedModel, requestKey])

  // Stale-while-revalidate. Returning null while a new key is in flight made
  // the meter fall through to the renderer-side fallback window on every
  // re-fetch, so the reading flickered between the kernel's snapshot and the
  // provider catalog's window on every session update. The last snapshot stays
  // on screen — it is at most one request stale — while `failed` stays
  // key-scoped so a transient error on an OLD request can't grey out the meter
  // of the current one.
  return {
    snapshot: requestState.snapshot,
    failed: requestState.key === requestKey && requestState.failed,
  }
}
