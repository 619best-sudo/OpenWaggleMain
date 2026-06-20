import { describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/lib/ipc', () => ({
  api: {},
}))

import { clampTerminalDimensions } from '../useTerminalSession'

describe('clampTerminalDimensions', () => {
  it('clamps dimensions to the allowed terminal bounds', () => {
    expect(clampTerminalDimensions(4, 4)).toEqual({ cols: 10, rows: 5 })
    expect(clampTerminalDimensions(999, 999)).toEqual({ cols: 500, rows: 200 })
  })

  it('floors fractional dimensions before clamping', () => {
    expect(clampTerminalDimensions(79.9, 24.8)).toEqual({ cols: 79, rows: 24 })
  })
})
