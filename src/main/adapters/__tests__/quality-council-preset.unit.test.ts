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

  it('has the full expert panel ending with a reconciling Chief Reviewer', () => {
    const labels = preset?.config.agents.map((agent) => agent.label) ?? []
    expect(labels).toEqual([
      'Design & UX Critic',
      'Accessibility & Frontend Engineer',
      'Reliability & Security Engineer',
      'Chief Reviewer',
    ])
  })

  it('gives each expert a distinct color', () => {
    const colors = preset?.config.agents.map((agent) => agent.color) ?? []
    expect(new Set(colors).size).toBe(colors.length)
  })
})
