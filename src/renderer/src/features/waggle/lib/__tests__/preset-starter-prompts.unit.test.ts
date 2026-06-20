import { WagglePresetId } from '@shared/types/brand'
import { describe, expect, it } from 'vitest'
import { getPresetStarterPrompts } from '../preset-starter-prompts'

describe('preset starter prompts', () => {
  it('returns starter prompts for Web Engineer', () => {
    const prompts = getPresetStarterPrompts(WagglePresetId('web-engineer'))

    expect(prompts.map((prompt) => prompt.title)).toEqual([
      'Landing page refresh',
      'Edit existing web feature',
      'Figma to web UI',
      'Web regression and blast radius',
    ])
    expect(prompts[0]?.prompt).toMatch(/figma/i)
    expect(prompts[0]?.prompt).toMatch(/playwright/i)
    expect(prompts[2]?.prompt).toMatch(/repo-owned assets under assets/i)
  })

  it('returns starter prompts for Mobile Engineer', () => {
    const prompts = getPresetStarterPrompts(WagglePresetId('mobile-engineer'))

    expect(prompts.map((prompt) => prompt.title)).toEqual([
      'Mobile onboarding refresh',
      'Edit existing mobile feature',
      'Figma to mobile UI',
      'Mobile regression and blast radius',
    ])
    expect(prompts[0]?.prompt).toMatch(/figma/i)
    expect(prompts[0]?.prompt).toMatch(/mobile runtime tooling/i)
    expect(prompts[3]?.prompt).toMatch(/disturbed by the change/i)
  })

  it('returns starter prompts for Backend Engineer', () => {
    const prompts = getPresetStarterPrompts(WagglePresetId('backend-engineer'))

    expect(prompts.map((prompt) => prompt.title)).toEqual([
      'New API feature',
      'Edit existing feature',
      'Bugfix and data check',
    ])
    expect(prompts[1]?.prompt).toMatch(/existing backend feature/i)
  })

  it('returns starter prompts for Quality Assurance Engineer', () => {
    const prompts = getPresetStarterPrompts(WagglePresetId('quality-assurance-engineer'))

    expect(prompts.map((prompt) => prompt.title)).toEqual([
      'Web QA and regressions',
      'Mobile QA and regressions',
      'Backend API and SQL QA',
      'Disturbed flow blast radius',
    ])
    expect(prompts[0]?.prompt).toMatch(/playwright/i)
    expect(prompts[1]?.prompt).toMatch(/mobile-mcp/i)
    expect(prompts[2]?.prompt).toMatch(/sql mcp/i)
    expect(prompts[3]?.prompt).toMatch(/disturbed indirectly/i)
  })

  it('returns starter prompts for Debugger And Fix', () => {
    const prompts = getPresetStarterPrompts(WagglePresetId('qa-debug'))

    expect(prompts.map((prompt) => prompt.title)).toEqual([
      'UI layout bug',
      'Backend API bug',
      'Logic or state bug',
      'Mixed disturbed flow regression',
    ])
    expect(prompts[0]?.prompt).toMatch(/width, height, x, y, bounding box/i)
    expect(prompts[1]?.prompt).toMatch(/sql or stored-data/i)
    expect(prompts[2]?.prompt).toMatch(/reverse engineer/i)
    expect(prompts[3]?.prompt).toMatch(/disturbed other files or flows/i)
  })

  it('returns no starter prompts for presets without a prompt pack', () => {
    expect(getPresetStarterPrompts(WagglePresetId('launch-readiness'))).toEqual([])
  })
})
