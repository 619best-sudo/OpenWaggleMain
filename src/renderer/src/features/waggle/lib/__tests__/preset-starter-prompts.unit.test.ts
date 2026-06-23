import { WagglePresetId } from '@shared/types/brand'
import { describe, expect, it } from 'vitest'
import { getPresetStarterPrompts } from '../preset-starter-prompts'

describe('preset starter prompts', () => {
  it('returns starter prompts for lifecycle presets', () => {
    const turingPrompts = getPresetStarterPrompts(WagglePresetId('turing'))
    const planningPrompts = getPresetStarterPrompts(WagglePresetId('product-planning'))
    const designPrompts = getPresetStarterPrompts(WagglePresetId('design-asset-direction'))
    const webBuildPrompts = getPresetStarterPrompts(WagglePresetId('web-build'))
    const mobileBuildPrompts = getPresetStarterPrompts(WagglePresetId('mobile-build'))
    const qaRepairPrompts = getPresetStarterPrompts(WagglePresetId('qa-repair-loop'))
    const releasePrompts = getPresetStarterPrompts(WagglePresetId('release-readiness'))
    const deploymentPrompts = getPresetStarterPrompts(WagglePresetId('deployment'))

    expect(turingPrompts.map((prompt) => prompt.title)).toEqual([
      'Route full product lifecycle',
      'Route mobile feature flow',
    ])
    expect(turingPrompts[0]?.prompt).toMatch(/product-planning, design-asset-direction, web-build, mobile-build, backend-build/i)
    expect(turingPrompts[1]?.prompt).toMatch(/mobile-build, qa-repair-loop, or quality-assurance-engineer/i)

    expect(planningPrompts.map((prompt) => prompt.title)).toEqual([
      'Plan MVP and lifecycle',
      'Plan mobile feature',
    ])
    expect(planningPrompts[0]?.prompt).toMatch(/what QA and release steps should follow/i)
    expect(planningPrompts[1]?.prompt).toMatch(/scope for mobile-build/i)

    expect(designPrompts.map((prompt) => prompt.title)).toEqual([
      'Beautiful landing page direction',
      'App UI from verbal brief',
    ])
    expect(designPrompts[0]?.prompt).toMatch(/hero mode/i)
    expect(designPrompts[1]?.prompt).toMatch(/verbal product prompt/i)

    expect(webBuildPrompts.map((prompt) => prompt.title)).toEqual([
      'Build planned web surface',
      'Hero build with media fallback',
    ])
    expect(webBuildPrompts[1]?.prompt).toMatch(/static, animated-ui, video, or frames/i)

    expect(mobileBuildPrompts.map((prompt) => prompt.title)).toEqual([
      'Build planned mobile flow',
      'Refine existing mobile UI',
    ])
    expect(mobileBuildPrompts[0]?.prompt).toMatch(/QA Repair Loop/i)

    expect(qaRepairPrompts.map((prompt) => prompt.title)).toEqual([
      'Verify, fix, and retest web change',
      'Verify, fix, and retest mobile change',
      'Verify, fix, and retest mixed issue',
    ])
    expect(qaRepairPrompts[0]?.prompt).toMatch(/verifying the real browser behavior/i)
    expect(qaRepairPrompts[1]?.prompt).toMatch(/device or simulator behavior/i)

    expect(releasePrompts.map((prompt) => prompt.title)).toEqual([
      'Ship readiness check',
      'Beta, demo, or merge decision',
    ])
    expect(releasePrompts[0]?.prompt).toMatch(/ready, almost ready, or not ready/i)

    expect(deploymentPrompts.map((prompt) => prompt.title)).toEqual([
      'Manual deployment runbook',
      'Post-release validation',
    ])
    expect(deploymentPrompts[0]?.prompt).toMatch(/manual deployment runbook/i)
  })

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
