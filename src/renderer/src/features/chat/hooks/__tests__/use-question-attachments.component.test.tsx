import { act, renderHook } from '@testing-library/react'
import { useEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useQuestionAttachments } from '../use-question-attachments'

/**
 * These pin the two properties that, when broken together, spun UserQuestionCard
 * in an endless render loop — measured at ~17,000 renders inside a 250ms window,
 * starving timers (a 2s interval went 60s between ticks) and pinning a CPU core
 * for as long as an `ask_user_question` card was on screen.
 *
 * The card resets its state with `useEffect(..., [request.question, resetFiles])`.
 * That makes `reset`'s identity a render trigger, and `reset`'s effect on state a
 * render trigger too. Either one alone is enough to restart the cycle, so both
 * are asserted here rather than just the fix that happened to be applied.
 *
 * A passive-effect loop like this throws no React error — it just spins — so
 * without these tests a regression is silent.
 */
describe('useQuestionAttachments', () => {
  it('keeps a stable `reset` identity across renders', () => {
    const { result, rerender } = renderHook(() =>
      useQuestionAttachments({ projectPath: '/repo', onError: vi.fn() }),
    )

    const first = result.current.reset
    rerender()
    rerender()

    // A fresh identity here re-runs the card's reset effect on every render.
    expect(result.current.reset).toBe(first)
  })

  it('leaves the attachments array identity alone when already empty', () => {
    const { result } = renderHook(() =>
      useQuestionAttachments({ projectPath: '/repo', onError: vi.fn() }),
    )

    const before = result.current.attachments
    act(() => {
      result.current.reset()
    })

    // `setAttachments([])` would commit a new array that never compares equal,
    // so React would re-render — and the card's effect would call reset again.
    expect(result.current.attachments).toBe(before)
  })

  it('settles instead of looping when a component resets on every render', () => {
    // Reproduces the card's exact shape: an effect depending on `reset`, calling
    // `reset`. With either half of the fix missing this never settles.
    //
    // The cap is what keeps this test useful. Left uncapped the regression is a
    // genuine infinite loop that pins the test worker until the pool kills it
    // (~45s), taking the rest of the file's results with it and reporting
    // nothing about the cause. Throwing at a bound fails fast and says why.
    const RENDER_CAP = 50
    let renders = 0
    function Harness() {
      renders += 1
      if (renders > RENDER_CAP) {
        throw new Error(`render loop: useQuestionAttachments re-rendered ${String(renders)} times`)
      }
      const { reset, attachments } = useQuestionAttachments({
        projectPath: '/repo',
        onError: vi.fn(),
      })
      useEffect(() => {
        reset()
      }, [reset])
      return attachments
    }

    const { rerender } = renderHook(() => Harness())
    const afterMount = renders
    rerender()

    // Mount + the explicit rerender. Anything beyond that is the loop restarting.
    expect(renders).toBeLessThanOrEqual(afterMount + 2)
  })
})
