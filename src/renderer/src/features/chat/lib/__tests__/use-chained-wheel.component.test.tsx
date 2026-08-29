import { renderHook } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { useChainedWheel } from '../use-chained-wheel'

/**
 * A transcript scroller containing one inline block, with both boxes' scroll
 * metrics forced — jsdom lays nothing out, so `scrollHeight`/`clientHeight` are
 * always 0 unless defined here.
 */
function mount({
  innerScrollHeight,
  innerClientHeight,
  innerScrollTop,
  innerOverflowY = 'auto',
}: {
  innerScrollHeight: number
  innerClientHeight: number
  innerScrollTop: number
  innerOverflowY?: string
}) {
  const transcript = document.createElement('div')
  Object.defineProperty(transcript, 'scrollHeight', { value: 5000, configurable: true })
  Object.defineProperty(transcript, 'clientHeight', { value: 600, configurable: true })
  transcript.scrollTop = 100

  const inner = document.createElement('div')
  inner.style.overflowY = innerOverflowY
  Object.defineProperty(inner, 'scrollHeight', { value: innerScrollHeight, configurable: true })
  Object.defineProperty(inner, 'clientHeight', { value: innerClientHeight, configurable: true })
  inner.scrollTop = innerScrollTop

  const leaf = document.createElement('span')
  inner.append(leaf)
  transcript.append(inner)
  document.body.append(transcript)

  const ref = createRef<HTMLElement>()
  Object.assign(ref, { current: transcript })
  renderHook(() => useChainedWheel(ref))
  return { transcript, inner, leaf }
}

function wheel(el: HTMLElement, deltaY: number, deltaX = 0) {
  const event = new WheelEvent('wheel', { deltaY, deltaX, cancelable: true, bubbles: true })
  el.dispatchEvent(event)
  return event
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useChainedWheel', () => {
  it('drives the transcript when the inline block has no overflow', () => {
    const { transcript, leaf } = mount({
      innerScrollHeight: 100,
      innerClientHeight: 100,
      innerScrollTop: 0,
    })

    const event = wheel(leaf, 40)

    expect(transcript.scrollTop).toBe(140)
    expect(event.defaultPrevented).toBe(true)
  })

  it('drives the transcript once the inline block is scrolled to its end', () => {
    const { transcript, leaf } = mount({
      innerScrollHeight: 300,
      innerClientHeight: 100,
      innerScrollTop: 200,
    })

    const event = wheel(leaf, 40)

    expect(transcript.scrollTop).toBe(140)
    expect(event.defaultPrevented).toBe(true)
  })

  it('leaves the gesture alone while the inline block can still consume it', () => {
    const { transcript, leaf } = mount({
      innerScrollHeight: 300,
      innerClientHeight: 100,
      innerScrollTop: 50,
    })

    const event = wheel(leaf, 40)

    expect(transcript.scrollTop).toBe(100)
    expect(event.defaultPrevented).toBe(false)
  })

  it('chains upward once the inline block is back at its top', () => {
    const { transcript, leaf } = mount({
      innerScrollHeight: 300,
      innerClientHeight: 100,
      innerScrollTop: 0,
    })

    const event = wheel(leaf, -40)

    expect(transcript.scrollTop).toBe(60)
    expect(event.defaultPrevented).toBe(true)
  })

  it('ignores an overflowing box that is not actually a scroller', () => {
    // Tall content with `overflow-y: visible` never scrolls, so the wheel must
    // not be handed to it just because its content is taller than its box.
    const { transcript, leaf } = mount({
      innerScrollHeight: 300,
      innerClientHeight: 100,
      innerScrollTop: 0,
      innerOverflowY: 'visible',
    })

    const event = wheel(leaf, 40)

    expect(transcript.scrollTop).toBe(140)
    expect(event.defaultPrevented).toBe(true)
  })

  it('never redirects a predominantly horizontal gesture', () => {
    const { transcript, leaf } = mount({
      innerScrollHeight: 100,
      innerClientHeight: 100,
      innerScrollTop: 0,
    })

    const event = wheel(leaf, 5, 60)

    expect(transcript.scrollTop).toBe(100)
    expect(event.defaultPrevented).toBe(false)
  })

  it('leaves the transcript alone when it is itself at the end', () => {
    const { transcript, leaf } = mount({
      innerScrollHeight: 100,
      innerClientHeight: 100,
      innerScrollTop: 0,
    })
    transcript.scrollTop = 4400

    const event = wheel(leaf, 40)

    expect(transcript.scrollTop).toBe(4400)
    expect(event.defaultPrevented).toBe(false)
  })
})
