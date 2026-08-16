import { useCallback, useInsertionEffect, useRef } from 'react'

/**
 * Returns a callback whose identity never changes but which always invokes the
 * latest version of `handler`.
 *
 * Used where a handler is passed to memoized children: an inline arrow would
 * change identity every render and defeat the memo, while `useCallback` with
 * dependencies would either go stale or churn for the same reason.
 */
export function useEventCallback<TArgs extends readonly unknown[], TResult>(
  handler: (...args: TArgs) => TResult,
): (...args: TArgs) => TResult {
  const handlerRef = useRef(handler)

  useInsertionEffect(() => {
    handlerRef.current = handler
  }, [handler])

  return useCallback((...args: TArgs) => handlerRef.current(...args), [])
}
