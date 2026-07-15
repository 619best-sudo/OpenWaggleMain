import { describe, expect, it } from 'vitest'
import { BUILT_IN_WAGGLE_PRESETS } from '../settings-waggle-presets-built-ins'

describe('Quality Council built-in preset', () => {
  const preset = BUILT_IN_WAGGLE_PRESETS.find(
    (candidate) => String(candidate.id) === 'quality-council',
  )

  it('is surfaced as a built-in Council of Experts panel', () => {
    expect(preset).toBeDefined()
    expect(preset?.name).toBe('Quality Council')
    expect(preset?.isBuiltIn).toBe(true)
  })

  it('runs a sequential expert council that converges on consensus', () => {
    expect(preset?.config.mode).toBe('sequential')
    expect(preset?.config.stop.primary).toBe('consensus')
  })

  it('is a two-agent Reviewer -> Auditor panel (the engine converges pairwise)', () => {
    const labels = preset?.config.agents.map((agent) => agent.label) ?? []
    // The waggle consensus check compares the last two turns, so a council here
    // must be exactly two alternating experts to converge instead of burning turns.
    expect(labels).toEqual(['Reviewer', 'Auditor'])
  })

  it('gives each expert a distinct color', () => {
    const colors = preset?.config.agents.map((agent) => agent.color) ?? []
    expect(new Set(colors).size).toBe(colors.length)
  })
})
