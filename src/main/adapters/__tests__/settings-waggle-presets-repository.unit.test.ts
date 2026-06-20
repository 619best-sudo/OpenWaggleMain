import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { SupportedModelId, WagglePresetId } from '@shared/types/brand'
import type { WagglePreset } from '@shared/types/waggle'
import * as Effect from 'effect/Effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  homeDir: '',
  userDataDir: '',
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => state.userDataDir,
  },
}))

vi.mock('node:os', () => ({
  default: { homedir: () => state.homeDir, tmpdir: () => '/tmp' },
  homedir: () => state.homeDir,
  tmpdir: () => '/tmp',
}))

import {
  WagglePresetsRepository,
  type WagglePresetsRepositoryShape,
} from '../../ports/waggle-presets-repository'
import { SettingsWagglePresetsRepositoryLive } from '../settings-waggle-presets-repository'

function createPreset(input: {
  readonly id: string
  readonly name: string
  readonly updatedAt?: number
}): WagglePreset {
  return {
    id: WagglePresetId(input.id),
    name: input.name,
    description: `${input.name} preset`,
    config: {
      mode: 'sequential',
      agents: [
        {
          label: 'Architect',
          model: SupportedModelId('openai/gpt-5.4'),
          roleDescription: 'Plans the implementation',
          color: 'blue',
        },
        {
          label: 'Reviewer',
          model: SupportedModelId('anthropic/claude-sonnet-4-5'),
          roleDescription: 'Reviews the implementation',
          color: 'amber',
        },
      ],
      stop: { primary: 'consensus', maxTurnsSafety: 8 },
    },
    app: {
      requiredMcps: ['playwright'],
      requiredSkills: ['ui-critic'],
    },
    isBuiltIn: false,
    createdAt: 100,
    updatedAt: input.updatedAt ?? 100,
  }
}

function runWithRepository<A>(
  useRepository: (repository: WagglePresetsRepositoryShape) => Effect.Effect<A>,
) {
  return Effect.runPromise(
    Effect.gen(function* () {
      const repository = yield* WagglePresetsRepository
      return yield* useRepository(repository)
    }).pipe(Effect.provide(SettingsWagglePresetsRepositoryLive)),
  )
}

describe('SettingsWagglePresetsRepositoryLive', () => {
  let tmpRoot = ''
  let projectPath = ''

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ow-waggle-presets-'))
    state.homeDir = path.join(tmpRoot, 'home')
    state.userDataDir = path.join(tmpRoot, 'user-data')
    projectPath = path.join(tmpRoot, 'project')
    await fs.mkdir(projectPath, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true })
  })

  it('lists built-in presets when no user or project presets exist', async () => {
    const presets = await runWithRepository((repository) => repository.list(projectPath))

    expect(presets.map((preset) => preset.id)).toContain(WagglePresetId('code-review'))
    expect(presets.map((preset) => preset.id)).toContain(WagglePresetId('product-planning'))
    expect(presets.map((preset) => preset.id)).toContain(WagglePresetId('turing'))
    expect(presets.map((preset) => preset.id)).toContain(WagglePresetId('product-ui'))
    expect(presets.map((preset) => preset.id)).toContain(WagglePresetId('backend-systems'))
    expect(presets.map((preset) => preset.id)).toContain(WagglePresetId('backend-engineer'))
    expect(presets.map((preset) => preset.id)).toContain(WagglePresetId('qa-debug'))
    expect(presets.map((preset) => preset.id)).toContain(WagglePresetId('launch-readiness'))
    expect(presets.map((preset) => preset.id)).toContain(WagglePresetId('development-qa'))
    expect(presets.map((preset) => preset.id)).toContain(WagglePresetId('quality-assurance-engineer'))
    expect(presets.map((preset) => preset.id)).toContain(WagglePresetId('security-audit'))
    expect(presets.map((preset) => preset.id)).toContain(WagglePresetId('performance-inspector'))
    expect(presets.map((preset) => preset.id)).toContain(WagglePresetId('frontend-ui-audit'))
    expect(presets.map((preset) => preset.id)).toContain(
      WagglePresetId('reference-image-replication'),
    )
    expect(presets.map((preset) => preset.id)).toContain(WagglePresetId('design-system-compliance'))
    expect(presets.map((preset) => preset.id)).toContain(WagglePresetId('responsive-qa'))
    expect(presets.map((preset) => preset.id)).toContain(WagglePresetId('game-factory'))
    expect(presets.map((preset) => preset.id)).toContain(WagglePresetId('person-360'))
    expect(presets.map((preset) => preset.id)).toContain(
      WagglePresetId('person-profile-optional-career-pass'),
    )
    expect(presets.map((preset) => preset.name)).toContain('Code Review')
    expect(presets.find((preset) => preset.id === WagglePresetId('code-review'))).toMatchObject({
      name: 'Code Review',
      description: expect.stringContaining('blast radius'),
      app: {
        requiredMcps: [],
        requiredSkills: [],
      },
      config: {
        agents: [
          {
            label: 'Architect',
            outputContract: {
              requiredSections: [
                'primary findings',
                'ripple effects to inspect',
                'edge cases at risk',
                'test and coverage gaps',
                'recommended fixes',
              ],
            },
          },
          {
            label: 'Reviewer',
            outputContract: {
              requiredSections: [
                'validated findings',
                'new ripple-effect findings',
                'edge cases verified',
                'residual risks',
                'merge recommendation',
              ],
            },
          },
        ],
      },
    })
    expect(
      presets.find((preset) => preset.id === WagglePresetId('product-planning')),
    ).toMatchObject({
      name: 'Product Planning',
      app: {
        requiredMcps: [],
        requiredSkills: [],
      },
    })
    expect(presets.find((preset) => preset.id === WagglePresetId('turing'))).toMatchObject({
      name: 'Turing',
      app: {
        requiredMcps: [],
        requiredSkills: [],
      },
      config: {
        agents: [{ label: 'Context Reader' }, { label: 'Installed Waggle Selector' }],
      },
    })
    expect(presets.find((preset) => preset.id === WagglePresetId('product-ui'))).toMatchObject({
      name: 'Product UI',
      app: {
        requiredMcps: ['playwright'],
        requiredSkills: ['frontend-implementer', 'ui-screenshot-auditor'],
      },
    })
    expect(presets.find((preset) => preset.id === WagglePresetId('web-engineer'))).toMatchObject({
      name: 'Web Engineer',
      app: {
        requiredMcps: ['playwright'],
        requiredSkills: [],
        optionalMcps: [
          'figma',
          'gsap',
          'remotion',
          'animejs',
          'multimodal-media',
          'ffmpeg',
          'blender',
          '3d-asset-processing',
          'gltf-mcp',
        ],
        optionalSkills: ['frontend-implementer', 'ui-screenshot-auditor', 'media-director'],
      },
      config: {
        agents: [
          { label: 'Web Planner' },
          { label: 'Web Builder' },
          { label: 'Web Animation Expert' },
          { label: 'Web Verifier' },
        ],
      },
    })
    expect(presets.find((preset) => preset.id === WagglePresetId('mobile-engineer'))).toMatchObject(
      {
        name: 'Mobile Engineer',
        app: {
          requiredMcps: ['mobile-mcp'],
          requiredSkills: [],
          optionalMcps: [
            'mobile-device',
            'figma',
            'gsap',
            'remotion',
            'animejs',
            'multimodal-media',
            'ffmpeg',
            'blender',
            '3d-asset-processing',
            'gltf-mcp',
          ],
          optionalSkills: ['frontend-implementer', 'ui-screenshot-auditor', 'media-director'],
        },
        config: {
          agents: [
            { label: 'Mobile Planner' },
            { label: 'Mobile Builder' },
            { label: 'Mobile Animation Expert' },
            { label: 'Mobile Verifier' },
          ],
        },
      },
    )
    expect(presets.find((preset) => preset.id === WagglePresetId('backend-systems'))).toMatchObject(
      {
        name: 'Backend Systems',
        app: {
          requiredMcps: [],
          requiredSkills: ['backend-auditor'],
        },
      },
    )
    expect(presets.find((preset) => preset.id === WagglePresetId('backend-engineer'))).toMatchObject(
      {
        name: 'Backend Engineer',
        app: {
          requiredMcps: [],
          requiredSkills: [],
          optionalMcps: ['postman', 'database'],
          optionalSkills: ['backend-auditor'],
        },
        config: {
          agents: [
            { label: 'Backend Planner' },
            { label: 'Backend Builder' },
            { label: 'Backend Verifier' },
          ],
        },
      },
    )
    expect(presets.find((preset) => preset.id === WagglePresetId('qa-debug'))).toMatchObject({
      name: 'Debugger And Fix',
      app: {
        requiredMcps: [],
        requiredSkills: [],
        optionalMcps: ['playwright', 'mobile-mcp', 'mobile-device', 'postman', 'database'],
        optionalSkills: ['frontend-implementer', 'ui-screenshot-auditor', 'backend-auditor'],
      },
      config: {
        agents: [
          { label: 'Debug Planner' },
          { label: 'Runtime Investigator' },
          { label: 'Fixer' },
          { label: 'Verifier' },
        ],
      },
    })
    expect(
      presets.find((preset) => preset.id === WagglePresetId('launch-readiness')),
    ).toMatchObject({
      name: 'Launch Readiness',
      app: {
        requiredMcps: [],
        requiredSkills: ['release-checker'],
      },
    })
    expect(presets.find((preset) => preset.id === WagglePresetId('development-qa'))).toMatchObject({
      name: 'Development QA',
      app: {
        requiredMcps: ['playwright', 'mobile-mcp', 'postman', 'database'],
        requiredSkills: ['ui-screenshot-auditor', 'backend-auditor'],
      },
    })
    expect(
      presets.find((preset) => preset.id === WagglePresetId('quality-assurance-engineer')),
    ).toMatchObject({
      name: 'Quality Assurance Engineer',
      app: {
        requiredMcps: [],
        requiredSkills: [],
        optionalMcps: ['playwright', 'mobile-mcp', 'postman', 'database'],
        optionalSkills: ['ui-screenshot-auditor', 'backend-auditor'],
      },
      config: {
        agents: [{ label: 'QA Planner' }, { label: 'QA Executor' }, { label: 'QA Lead' }],
      },
    })
    expect(presets.find((preset) => preset.id === WagglePresetId('security-audit'))).toMatchObject({
      name: 'Security Audit',
      app: {
        requiredMcps: [],
        requiredSkills: ['security-auditor'],
      },
    })
    expect(
      presets.find((preset) => preset.id === WagglePresetId('performance-inspector')),
    ).toMatchObject({
      name: 'Performance Inspector',
      app: {
        requiredMcps: ['chrome-devtools', 'mobile-mcp', 'postman', 'sql'],
        requiredSkills: ['performance-auditor'],
      },
    })
    expect(
      presets.find((preset) => preset.id === WagglePresetId('frontend-ui-audit')),
    ).toMatchObject({
      name: 'Frontend UI Audit',
      app: {
        requiredMcps: ['playwright'],
        requiredSkills: ['frontend-implementer', 'ui-screenshot-auditor'],
      },
    })
    expect(
      presets.find((preset) => preset.id === WagglePresetId('reference-image-replication')),
    ).toMatchObject({
      name: 'Reference Image Replication',
      app: {
        requiredMcps: ['playwright'],
        requiredSkills: ['frontend-implementer', 'ui-screenshot-auditor'],
      },
    })
    expect(
      presets.find((preset) => preset.id === WagglePresetId('design-system-compliance')),
    ).toMatchObject({
      name: 'Design System Compliance',
      app: {
        requiredMcps: ['playwright'],
        requiredSkills: ['frontend-implementer', 'ui-critic'],
      },
    })
    expect(presets.find((preset) => preset.id === WagglePresetId('responsive-qa'))).toMatchObject({
      name: 'Responsive QA',
      app: {
        requiredMcps: ['playwright'],
        requiredSkills: ['frontend-implementer', 'ui-screenshot-auditor'],
      },
    })
    expect(presets.find((preset) => preset.id === WagglePresetId('game-factory'))).toMatchObject({
      name: 'Game Factory',
      config: {
        agents: [
          {
            label: 'Planner / Narrative Director',
            outputContract: {
              requiredSections: [
                'progress',
                'files_changed',
                'commands_run',
                'artifacts',
                'blockers',
                'next_task',
              ],
            },
          },
          {
            label: 'Skeleton / Prototype Builder',
            outputContract: {
              requiredSections: [
                'progress',
                'files_changed',
                'commands_run',
                'artifacts',
                'blockers',
                'next_task',
              ],
            },
          },
          {
            label: 'World / Environment Builder',
            outputContract: {
              requiredSections: [
                'progress',
                'files_changed',
                'commands_run',
                'artifacts',
                'blockers',
                'next_task',
              ],
            },
          },
          {
            label: 'Character / Actor Builder',
            outputContract: {
              requiredSections: [
                'progress',
                'files_changed',
                'commands_run',
                'artifacts',
                'blockers',
                'next_task',
              ],
            },
          },
          {
            label: 'QA / Runtime Governor',
            outputContract: {
              requiredSections: [
                'loop_verdict',
                'failure_categories',
                'top_blockers',
                'evidence_reviewed',
                'screenshots',
                'logs',
                'exact_next_cycle',
              ],
            },
          },
        ],
        stop: { primary: 'consensus', maxTurnsSafety: 25 },
        loopContract: {
          placeholderPolicy: 'prefer-placeholders-over-blocking',
          failureCategories: [
            'bootstrap',
            'environment-presentation',
            'character-actor',
            'asset-pipeline',
            'performance',
            'qa-evidence',
          ],
        },
      },
      app: {
        requiredMcps: [
          'playwright',
          'chrome-devtools',
          'blender',
          '3d-asset-processing',
          'gltf-mcp',
          'multimodal-media',
          'ffmpeg',
        ],
        requiredSkills: [
          'game-planner-director',
          'game-skeleton-prototype-builder',
          'game-world-presentation-builder',
          'game-character-actor-builder',
          'game-qa-runtime-governor',
          'game-loop-contract-governor',
        ],
      },
    })
    expect(presets.find((preset) => preset.id === WagglePresetId('person-360'))).toMatchObject({
      name: 'Person 360',
      app: {
        requiredMcps: ['playwright'],
        requiredSkills: [],
      },
    })
    expect(
      presets.find((preset) => preset.id === WagglePresetId('person-profile-optional-career-pass')),
    ).toMatchObject({
      name: 'Person Profile With Optional Career Pass',
      app: {
        requiredMcps: ['playwright'],
        requiredSkills: [],
      },
    })
  })

  it('preserves prompt contracts for Code Review, Turing, Web Engineer, Mobile Engineer, Backend Engineer, Quality Assurance Engineer, and Debugger And Fix', async () => {
    const presets = await runWithRepository((repository) => repository.list(projectPath))

    const codeReview = presets.find((preset) => preset.id === WagglePresetId('code-review'))
    const turing = presets.find((preset) => preset.id === WagglePresetId('turing'))
    const webEngineer = presets.find((preset) => preset.id === WagglePresetId('web-engineer'))
    const mobileEngineer = presets.find((preset) => preset.id === WagglePresetId('mobile-engineer'))
    const backendEngineer = presets.find((preset) => preset.id === WagglePresetId('backend-engineer'))
    const qaEngineer = presets.find(
      (preset) => preset.id === WagglePresetId('quality-assurance-engineer'),
    )
    const debuggerAndFix = presets.find((preset) => preset.id === WagglePresetId('qa-debug'))

    expect(codeReview?.config.agents.map((agent) => agent.label)).toEqual(['Architect', 'Reviewer'])
    expect(codeReview?.config.agents[0]?.roleDescription).toContain(
      'Your highest priority is ripple-effect analysis',
    )
    expect(codeReview?.config.agents[0]?.roleDescription).toContain('High-priority ripple paths:')
    expect(codeReview?.config.agents[1]?.roleDescription).toContain(
      'Your highest priority is to verify or refute ripple effects',
    )
    expect(codeReview?.config.agents[1]?.roleDescription).toContain(
      'explicitly look for:',
    )

    expect(turing?.config.agents.map((agent) => agent.label)).toEqual([
      'Context Reader',
      'Installed Waggle Selector',
    ])
    expect(turing?.config.agents[0]?.roleDescription).toContain('user prompt for next Waggle')
    expect(turing?.config.agents[1]?.roleDescription).toContain('Only recommend a next Waggle')
    expect(turing?.config.agents[1]?.outputContract?.requiredSections).toEqual([
      'selected next Waggle',
      'why it is installed and ready',
      'agent 1 mission',
      'agent 2 mission',
      'user prompt for next Waggle',
      'fallback Waggle if needed',
    ])

    expect(webEngineer?.config.agents.map((agent) => agent.label)).toEqual([
      'Web Planner',
      'Web Builder',
      'Web Animation Expert',
      'Web Verifier',
    ])
    expect(webEngineer?.config.agents[1]?.roleDescription).toContain('asset requests:')
    expect(webEngineer?.config.agents[1]?.roleDescription).toContain('repoAssetPath:')
    expect(webEngineer?.config.agents[1]?.roleDescription).toContain('generationPrompt:')
    expect(webEngineer?.config.agents[1]?.roleDescription).toContain('videoDeliveryMode:')
    expect(webEngineer?.config.agents[1]?.roleDescription).toContain('Persist every generated asset inside the repository')
    expect(webEngineer?.config.agents[0]?.roleDescription).toContain('Figma')
    expect(webEngineer?.config.agents[0]?.roleDescription).toContain(
      'microinteractions and small animation polish as something that can apply anywhere',
    )
    expect(webEngineer?.config.agents[0]?.roleDescription).toContain(
      'homepage, landing page, hero, campaign, marketing',
    )
    expect(webEngineer?.config.agents[0]?.roleDescription).toContain('motion and media decision')
    expect(webEngineer?.config.agents[0]?.roleDescription).toContain(
      'verify it with at least two alternate checks',
    )
    expect(webEngineer?.config.agents[0]?.roleDescription).toContain(
      'Do not mark the task blocked just because one direct file read failed',
    )
    expect(webEngineer?.config.agents[2]?.roleDescription).toContain('asset outputs created:')
    expect(webEngineer?.config.agents[2]?.roleDescription).toContain('all-frames')
    expect(webEngineer?.config.agents[3]?.roleDescription).toContain('Playwright')
    expect(webEngineer?.config.agents[3]?.roleDescription).toContain('Figma')

    expect(mobileEngineer?.config.agents.map((agent) => agent.label)).toEqual([
      'Mobile Planner',
      'Mobile Builder',
      'Mobile Animation Expert',
      'Mobile Verifier',
    ])
    expect(mobileEngineer?.config.agents[1]?.roleDescription).toContain('asset requests:')
    expect(mobileEngineer?.config.agents[1]?.roleDescription).toContain('repoAssetPath:')
    expect(mobileEngineer?.config.agents[1]?.roleDescription).toContain('generationPrompt:')
    expect(mobileEngineer?.config.agents[1]?.roleDescription).toContain('videoDeliveryMode:')
    expect(mobileEngineer?.config.agents[1]?.roleDescription).toContain('Persist every generated asset inside the repository')
    expect(mobileEngineer?.config.agents[0]?.roleDescription).toContain('Figma')
    expect(mobileEngineer?.config.agents[0]?.roleDescription).toContain(
      'microinteractions and small animation polish as something that can apply anywhere',
    )
    expect(mobileEngineer?.config.agents[0]?.roleDescription).toContain(
      'generated images or video as opt-in, not default',
    )
    expect(mobileEngineer?.config.agents[0]?.roleDescription).toContain('motion and media decision')
    expect(mobileEngineer?.config.agents[0]?.roleDescription).toContain(
      'verify it with at least two alternate checks',
    )
    expect(mobileEngineer?.config.agents[0]?.roleDescription).toContain(
      'Do not mark the task blocked just because one direct file read failed',
    )
    expect(mobileEngineer?.config.agents[2]?.roleDescription).toContain('asset outputs created:')
    expect(mobileEngineer?.config.agents[2]?.roleDescription).toContain('all-frames')
    expect(mobileEngineer?.config.agents[3]?.roleDescription).toContain('mobile runtime evidence')
    expect(mobileEngineer?.config.agents[3]?.roleDescription).toContain('Figma')

    expect(backendEngineer?.config.agents.map((agent) => agent.label)).toEqual([
      'Backend Planner',
      'Backend Builder',
      'Backend Verifier',
    ])
    expect(backendEngineer?.config.agents[0]?.roleDescription).toContain('likely files to change')
    expect(backendEngineer?.config.agents[0]?.roleDescription).toContain(
      'verify it with at least two alternate checks',
    )
    expect(backendEngineer?.config.agents[0]?.roleDescription).toContain(
      'Do not mark the task blocked just because one direct file read failed',
    )
    expect(backendEngineer?.config.agents[2]?.roleDescription).toContain(
      'API verification evidence',
    )
    expect(backendEngineer?.config.agents[2]?.roleDescription).toContain(
      'database verification evidence',
    )

    expect(qaEngineer?.config.agents.map((agent) => agent.label)).toEqual([
      'QA Planner',
      'QA Executor',
      'QA Lead',
    ])
    expect(qaEngineer?.config.agents[0]?.roleDescription).toContain('plan the full QA test suite')
    expect(qaEngineer?.config.agents[0]?.roleDescription).toContain('Playwright')
    expect(qaEngineer?.config.agents[0]?.roleDescription).toContain('SQL MCP')
    expect(qaEngineer?.config.agents[0]?.roleDescription).toContain(
      'keep the rest of the suite moving',
    )
    expect(qaEngineer?.config.agents[0]?.roleDescription).toContain(
      'Do not collapse the full QA plan into blocked status',
    )
    expect(qaEngineer?.config.agents[1]?.roleDescription).toContain('execute all planned test cases')
    expect(qaEngineer?.config.agents[1]?.roleDescription).toContain('Postman MCP')
    expect(qaEngineer?.config.agents[1]?.roleDescription).toContain('SQL evidence')
    expect(qaEngineer?.config.agents[1]?.roleDescription).toContain(
      'Do not derail the full QA run',
    )
    expect(qaEngineer?.config.agents[2]?.roleDescription).toContain(
      'final QA judgment',
    )
    expect(qaEngineer?.config.agents[2]?.roleDescription).toContain('ship recommendation')
    expect(qaEngineer?.config.agents[2]?.roleDescription).toContain(
      'Convert blocked areas into a targeted next QA cycle',
    )

    expect(debuggerAndFix?.config.agents.map((agent) => agent.label)).toEqual([
      'Debug Planner',
      'Runtime Investigator',
      'Fixer',
      'Verifier',
    ])
    expect(debuggerAndFix?.config.agents[0]?.roleDescription).toContain(
      'issue classification: UI / backend / logic / mixed',
    )
    expect(debuggerAndFix?.config.agents[0]?.roleDescription).toContain(
      'Every attempted fix must be reversible',
    )
    expect(debuggerAndFix?.config.agents[0]?.roleDescription).toContain(
      'Do not let the Waggle derail on one failed reproduction guess',
    )
    expect(debuggerAndFix?.config.agents[1]?.roleDescription).toContain(
      'width, height, x, y, bounding box',
    )
    expect(debuggerAndFix?.config.agents[1]?.roleDescription).toContain('reverse engineer')
    expect(debuggerAndFix?.config.agents[1]?.roleDescription).toContain(
      'Do not derail the investigation because one tool path',
    )
    expect(debuggerAndFix?.config.agents[2]?.roleDescription).toContain(
      'rollback instructions if verification fails',
    )
    expect(debuggerAndFix?.config.agents[3]?.roleDescription).toContain(
      'keep or revert current fix',
    )
    expect(debuggerAndFix?.config.agents[3]?.roleDescription).toContain(
      'failed-attempt learning for next planner pass',
    )
    expect(debuggerAndFix?.config.agents[3]?.roleDescription).toContain(
      'Do not let the loop derail just because one verification tool',
    )
  })

  it('suppresses hidden built-in presets from Pi-compatible user state', async () => {
    const userPresetPath = path.join(state.homeDir, '.pi', 'agent', 'waggle-presets.json')
    await fs.mkdir(path.dirname(userPresetPath), { recursive: true })
    await fs.writeFile(
      userPresetPath,
      `${JSON.stringify({ wagglePresets: [], hiddenBuiltInPresetIds: ['code-review'] })}\n`,
      'utf-8',
    )

    const presets = await runWithRepository((repository) => repository.list(null))

    expect(presets.map((preset) => preset.id)).not.toContain(WagglePresetId('code-review'))
  })

  it('keeps unrelated preset IDs distinct from built-in presets', async () => {
    const userPresetPath = path.join(state.homeDir, '.pi', 'agent', 'waggle-presets.json')
    await fs.mkdir(path.dirname(userPresetPath), { recursive: true })
    await fs.writeFile(
      userPresetPath,
      `${JSON.stringify({
        wagglePresets: [createPreset({ id: 'custom-code-review', name: 'Custom Override' })],
        hiddenBuiltInPresetIds: [],
      })}\n`,
      'utf-8',
    )

    const presets = await runWithRepository((repository) => repository.list(null))

    expect(presets.find((preset) => preset.id === WagglePresetId('code-review'))?.name).toBe(
      'Code Review',
    )
    expect(presets.find((preset) => preset.id === WagglePresetId('custom-code-review'))?.name).toBe(
      'Custom Override',
    )
  })

  it('preserves hidden built-in preset state when saving and deleting user presets', async () => {
    const userPresetPath = path.join(state.homeDir, '.pi', 'agent', 'waggle-presets.json')
    await fs.mkdir(path.dirname(userPresetPath), { recursive: true })
    await fs.writeFile(
      userPresetPath,
      `${JSON.stringify({ wagglePresets: [], hiddenBuiltInPresetIds: ['code-review'] })}\n`,
      'utf-8',
    )
    const globalPreset = createPreset({ id: 'custom-review', name: 'Global Review' })

    await runWithRepository((repository) => repository.save(globalPreset))
    await runWithRepository((repository) => repository.delete(globalPreset.id))

    const raw = JSON.parse(await fs.readFile(userPresetPath, 'utf-8'))
    expect(raw).toMatchObject({
      wagglePresets: [],
      hiddenBuiltInPresetIds: ['code-review'],
    })
  })

  it('rejects invalid presets instead of writing disappearing preset state', async () => {
    const userPresetPath = path.join(state.homeDir, '.pi', 'agent', 'waggle-presets.json')
    const invalidPreset: WagglePreset = {
      ...createPreset({ id: 'invalid-models', name: 'Invalid Models' }),
      config: {
        ...createPreset({ id: 'invalid-models', name: 'Invalid Models' }).config,
        agents: [
          {
            ...createPreset({ id: 'invalid-models', name: 'Invalid Models' }).config.agents[0],
            model: SupportedModelId(''),
          },
          createPreset({ id: 'invalid-models', name: 'Invalid Models' }).config.agents[1],
        ],
      },
    }

    await expect(runWithRepository((repository) => repository.save(invalidPreset))).rejects.toThrow(
      'Invalid Waggle preset',
    )
    await expect(fs.readFile(userPresetPath, 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('persists global presets in user data when no project path is provided', async () => {
    const globalPreset = createPreset({ id: 'custom-review', name: 'Global Review' })

    await runWithRepository((repository) => repository.save(globalPreset))
    const presets = await runWithRepository((repository) => repository.list(null))

    expect(presets.find((preset) => preset.id === globalPreset.id)?.name).toBe('Global Review')
  })

  it('persists project presets in .pi/waggle-presets.json', async () => {
    const projectPreset = createPreset({ id: 'project-review', name: 'Project Review' })

    await runWithRepository((repository) => repository.save(projectPreset, projectPath))

    const raw = await fs.readFile(path.join(projectPath, '.pi', 'waggle-presets.json'), 'utf-8')
    expect(JSON.parse(raw)).toMatchObject({
      wagglePresets: [expect.objectContaining({ name: 'Project Review' })],
    })
  })

  it('prefers project presets over global presets with the same id', async () => {
    const globalPreset = createPreset({ id: 'shared-review', name: 'Global Review' })
    const projectPreset = createPreset({
      id: 'shared-review',
      name: 'Project Review',
      updatedAt: 200,
    })

    await runWithRepository((repository) => repository.save(globalPreset))
    await runWithRepository((repository) => repository.save(projectPreset, projectPath))

    const projectPresets = await runWithRepository((repository) => repository.list(projectPath))
    const globalPresets = await runWithRepository((repository) => repository.list(null))

    expect(projectPresets.find((preset) => preset.id === projectPreset.id)?.name).toBe(
      'Project Review',
    )
    expect(globalPresets.find((preset) => preset.id === globalPreset.id)?.name).toBe(
      'Global Review',
    )
    expect(projectPresets.filter((preset) => preset.id === projectPreset.id)).toHaveLength(1)
  })

  it('deletes presets from the requested scope only', async () => {
    const globalPreset = createPreset({ id: 'delete-review', name: 'Global Review' })
    const projectPreset = createPreset({ id: 'delete-review', name: 'Project Review' })

    await runWithRepository((repository) => repository.save(globalPreset))
    await runWithRepository((repository) => repository.save(projectPreset, projectPath))
    await runWithRepository((repository) => repository.delete(projectPreset.id, projectPath))

    const projectPresets = await runWithRepository((repository) => repository.list(projectPath))
    const globalPresets = await runWithRepository((repository) => repository.list(null))

    expect(projectPresets.find((preset) => preset.id === projectPreset.id)?.name).toBe(
      'Global Review',
    )
    expect(globalPresets.find((preset) => preset.id === globalPreset.id)?.name).toBe(
      'Global Review',
    )
  })
})
