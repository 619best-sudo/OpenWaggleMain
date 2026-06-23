import { SupportedModelId, WagglePresetId } from '@shared/types/brand'
import type { ProviderInfo } from '@shared/types/llm'
import { DEFAULT_SETTINGS } from '@shared/types/settings'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandPalette } from '@/features/command-palette/components'
import { usePreferencesStore } from '@/features/settings/state/preferences-store'
import { useWaggleLaunchPromptStore, useWaggleStore } from '@/features/waggle/state'
import { useUIStore } from '@/shell/ui-store'
import { renderWithQueryClient } from '@/test-utils/query-test-utils'
import { createPreset, PROJECT_PATH, PROVIDER_MODELS } from './WaggleSection.test-utils'
import { WaggleDependencyDialog } from '../sections/WaggleDependencyDialog'

const {
  listWagglePresetsMock,
  saveWagglePresetMock,
  deleteWagglePresetMock,
  getWaggleAppInstallStatusMock,
  installWaggleAppDependenciesMock,
  createSessionMock,
  useChatMock,
  navigateMock,
  usePreferencesMock,
  useProvidersMock,
} = vi.hoisted(() => ({
  listWagglePresetsMock: vi.fn(),
  saveWagglePresetMock: vi.fn(),
  deleteWagglePresetMock: vi.fn(),
  getWaggleAppInstallStatusMock: vi.fn(),
  installWaggleAppDependenciesMock: vi.fn(),
  createSessionMock: vi.fn(),
  useChatMock: vi.fn(),
  navigateMock: vi.fn(),
  usePreferencesMock: vi.fn(),
  useProvidersMock: vi.fn(),
}))

vi.mock('@/features/settings/hooks/useSettings', () => ({
  usePreferences: usePreferencesMock,
  useProviders: useProvidersMock,
}))

vi.mock('@/features/chat/hooks/useChat', () => ({
  useChat: useChatMock,
}))

vi.mock('@tanstack/react-router', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')

  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

vi.mock('@/shared/lib/ipc', () => ({
  api: {
    listWagglePresets: listWagglePresetsMock,
    saveWagglePreset: saveWagglePresetMock,
    deleteWagglePreset: deleteWagglePresetMock,
    getWaggleAppInstallStatus: getWaggleAppInstallStatusMock,
    installWaggleAppDependencies: installWaggleAppDependenciesMock,
  },
}))

vi.mock('@/features/providers/components', async () => {
  const { Select } = await import('@/shared/ui/Select')

  return {
    ModelSelector: ({
      value,
      onChange,
      providerModels,
    }: {
      value: string
      onChange: (model: string) => void
      providerModels: ProviderInfo[]
    }) => (
      <Select aria-label="Model" value={value} onChange={(event) => onChange(event.target.value)}>
        {providerModels.flatMap((group) =>
          group.models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          )),
        )}
      </Select>
    ),
  }
})

import { WaggleSection } from '../sections/WaggleSection'

function elementAt<TElement extends Element>(elements: readonly TElement[], index: number) {
  const element = elements[index]
  if (!element) {
    throw new Error(`Expected element at index ${String(index)}`)
  }
  return element
}

describe('WaggleSection', () => {
  beforeEach(() => {
    listWagglePresetsMock.mockReset()
    saveWagglePresetMock.mockReset()
    deleteWagglePresetMock.mockReset()
    getWaggleAppInstallStatusMock.mockReset()
    installWaggleAppDependenciesMock.mockReset()
    createSessionMock.mockReset()
    useChatMock.mockReset()
    navigateMock.mockReset()
    usePreferencesMock.mockReset()
    useProvidersMock.mockReset()
    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      settings: {
        ...DEFAULT_SETTINGS,
        projectPath: PROJECT_PATH,
      },
    })
    useUIStore.setState(useUIStore.getInitialState())
    useWaggleStore.setState(useWaggleStore.getInitialState())
    useWaggleLaunchPromptStore.setState({ pendingBySessionId: {} })

    usePreferencesMock.mockReturnValue({
      settings: DEFAULT_SETTINGS,
    })
    useProvidersMock.mockReturnValue({
      providerModels: PROVIDER_MODELS,
    })
    createSessionMock.mockResolvedValue('session-123')
    useChatMock.mockReturnValue({
      activeSession: null,
      activeSessionId: null,
      createSession: createSessionMock,
    })
    deleteWagglePresetMock.mockResolvedValue(undefined)
    getWaggleAppInstallStatusMock.mockResolvedValue({
      ready: false,
      requiredDependencyCount: 3,
      optionalDependencyCount: 0,
      installedCount: 1,
      missingCount: 2,
      unsupportedCount: 0,
      optionalInstalledCount: 0,
      optionalMissingCount: 0,
      optionalUnsupportedCount: 0,
      dependencies: [
        {
          kind: 'mcp',
          id: 'playwright',
          label: 'Playwright',
          required: true,
          state: 'installed',
          description:
            'Lets Waggle agents inspect and automate browser UI state during UI-focused flows.',
          setupSteps: [
            'Confirm the target project can run locally before using browser automation.',
          ],
        },
        {
          kind: 'mcp',
          id: 'postgres',
          label: 'Postgres',
          required: true,
          state: 'missing',
          detail: 'Ready to add to project MCP config.',
          description:
            'Lets Waggle agents inspect database schema and run read-oriented database checks.',
          setupSteps: [
            'Add the database connection details required by this MCP in project MCP config after install.',
          ],
        },
        {
          kind: 'skill',
          id: 'ui-critic',
          label: 'UI Critic',
          required: true,
          state: 'missing',
          detail: 'Ready to install into this project.',
          description:
            'Reviews UI work for hierarchy, affordances, copy quality, and obvious regressions.',
        },
      ],
    })
    installWaggleAppDependenciesMock.mockResolvedValue({
      status: {
        ready: true,
        requiredDependencyCount: 3,
        optionalDependencyCount: 0,
        installedCount: 3,
        missingCount: 0,
        unsupportedCount: 0,
        optionalInstalledCount: 0,
        optionalMissingCount: 0,
        optionalUnsupportedCount: 0,
        dependencies: [],
      },
      installedDependencyIds: ['playwright', 'postgres', 'ui-critic'],
      enabledDependencyIds: [],
      skippedDependencyIds: [],
      unsupportedDependencyIds: [],
    })
  })

  it('keeps the editor closed until a Waggle is selected or created', async () => {
    const preset = createPreset()
    listWagglePresetsMock.mockResolvedValueOnce([preset])

    renderWithQueryClient(<WaggleSection />)

    expect(await screen.findByText('Teammates')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('Reviewer')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /create app/i }))

    expect(await screen.findByRole('dialog', { name: /create waggle/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create waggle/i })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Agent 1')).toBeInTheDocument()
  })

  it('keeps model names out of the Waggle list items', async () => {
    const preset = createPreset()
    listWagglePresetsMock.mockResolvedValueOnce([preset])

    renderWithQueryClient(<WaggleSection />)

    await screen.findByText('Review Pair')

    expect(screen.queryByText('Claude Sonnet 4.5')).not.toBeInTheDocument()
    expect(screen.queryByText('Claude Opus 4')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument()
  })

  it('groups built-in presets into lifecycle, launch, inspection, specialist, and custom sections', async () => {
    listWagglePresetsMock.mockResolvedValueOnce([
      createPreset({
        id: WagglePresetId('turing'),
        name: 'Turing',
        isBuiltIn: true,
        app: { requiredMcps: [], requiredSkills: [] },
      }),
      createPreset({
        id: WagglePresetId('product-planning'),
        name: 'Product Planning',
        isBuiltIn: true,
        app: { requiredMcps: [], requiredSkills: [] },
      }),
      createPreset({
        id: WagglePresetId('design-asset-direction'),
        name: 'Design And Asset Direction',
        isBuiltIn: true,
        app: { requiredMcps: [], requiredSkills: ['media-director'] },
      }),
      createPreset({
        id: WagglePresetId('qa-repair-loop'),
        name: 'QA Repair Loop',
        isBuiltIn: true,
        app: { requiredMcps: [], requiredSkills: ['ui-screenshot-auditor'] },
      }),
      createPreset({
        id: WagglePresetId('mobile-build'),
        name: 'Mobile Build',
        isBuiltIn: true,
        app: { requiredMcps: ['mobile-mcp'], requiredSkills: ['frontend-implementer'] },
      }),
      createPreset({
        id: WagglePresetId('release-readiness'),
        name: 'Release Readiness',
        isBuiltIn: true,
        app: { requiredMcps: [], requiredSkills: ['release-checker'] },
      }),
      createPreset({
        id: WagglePresetId('development-qa'),
        name: 'Development QA',
        isBuiltIn: true,
      }),
      createPreset({
        id: WagglePresetId('product-ui'),
        name: 'Product UI',
        isBuiltIn: true,
      }),
      createPreset({
        id: WagglePresetId('quality-assurance-engineer'),
        name: 'Quality Assurance Engineer',
        isBuiltIn: true,
      }),
      createPreset({
        id: WagglePresetId('frontend-ui-audit'),
        name: 'Frontend UI Audit',
        isBuiltIn: true,
      }),
      createPreset({
        id: WagglePresetId('code-review'),
        name: 'Code Review',
        isBuiltIn: true,
        app: { requiredMcps: [], requiredSkills: [] },
      }),
      createPreset({
        id: WagglePresetId('person-360'),
        name: 'Person 360',
        isBuiltIn: true,
        app: { requiredMcps: [], requiredSkills: [] },
      }),
      createPreset({
        id: WagglePresetId('person-profile-optional-career-pass'),
        name: 'Person Profile With Optional Career Pass',
        isBuiltIn: true,
        app: { requiredMcps: [], requiredSkills: [] },
      }),
      createPreset(),
    ])

    renderWithQueryClient(<WaggleSection />)

    expect(await screen.findByText('Product And Tech Lifecycle')).toBeInTheDocument()
    expect(screen.getByText('Mobile Lifecycle')).toBeInTheDocument()
    expect(screen.getByText('Core Launch Set')).toBeInTheDocument()
    expect(screen.getByText('Quality And Inspection')).toBeInTheDocument()
    expect(screen.getByText('UI Specialists')).toBeInTheDocument()
    expect(screen.getByText('Other Built-Ins')).toBeInTheDocument()
    expect(screen.getByText('Custom Waggles')).toBeInTheDocument()
    expect(screen.getAllByText('Turing')).toHaveLength(2)
    expect(screen.getAllByText('Design And Asset Direction')).toHaveLength(2)
    expect(screen.getAllByText('Mobile Build')).toHaveLength(2)
    expect(screen.getAllByText('QA Repair Loop')).toHaveLength(2)
    expect(screen.getAllByText('Release Readiness')).toHaveLength(2)
    expect(screen.getAllByText('Quality Assurance Engineer').length).toBeGreaterThan(0)
    expect(screen.getByText('Person 360')).toBeInTheDocument()
    expect(screen.getByText('Person Profile With Optional Career Pass')).toBeInTheDocument()
    expect(
      screen.getByText(/Run the end-to-end chain in order: Turing -> Product Planning -> Design And Asset Direction/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Use this curated mobile path when the request is app-first: Turing -> Product Planning -> Design And Asset Direction -> Mobile Build/i),
    ).toBeInTheDocument()
  })

  it('shows compact lifecycle guidance on cards for build and QA presets', async () => {
    listWagglePresetsMock.mockResolvedValueOnce([
      createPreset({
        id: WagglePresetId('mobile-build'),
        name: 'Mobile Build',
        isBuiltIn: true,
        app: { requiredMcps: ['mobile-mcp'], requiredSkills: ['frontend-implementer'] },
      }),
      createPreset({
        id: WagglePresetId('qa-repair-loop'),
        name: 'QA Repair Loop',
        isBuiltIn: true,
        app: { requiredMcps: [], requiredSkills: ['ui-screenshot-auditor'] },
      }),
      createPreset({
        id: WagglePresetId('quality-assurance-engineer'),
        name: 'Quality Assurance Engineer',
        isBuiltIn: true,
      }),
    ])

    renderWithQueryClient(<WaggleSection />)

    const mobileStage = await screen.findAllByTestId('preset-stage-mobile-build')
    expect(within(elementAt(mobileStage, 0)).getByText('Build')).toBeInTheDocument()
    expect(screen.getAllByText(/Best For: Implementing the planned mobile screen or flow/i)).not.toHaveLength(0)
    expect(screen.getAllByTestId('preset-next-mobile-build')).not.toHaveLength(0)
    expect(screen.getAllByText(/Recommended Next: QA Repair Loop/i)).not.toHaveLength(0)

    const qaStage = await screen.findAllByTestId('preset-stage-qa-repair-loop')
    expect(within(elementAt(qaStage, 0)).getByText('QA')).toBeInTheDocument()
    expect(screen.getAllByText(/Best For: Self-healing verify -> fix -> retest cycles/i)).not.toHaveLength(0)
    expect(screen.getAllByText(/Recommended Next: Release Readiness when fixes pass/i)).not.toHaveLength(0)

    const qaEngineerStage = await screen.findAllByTestId('preset-stage-quality-assurance-engineer')
    expect(within(elementAt(qaEngineerStage, 0)).getByText('QA')).toBeInTheDocument()
    expect(screen.getAllByText(/Best For: Broader cross-surface QA before ship/i)).not.toHaveLength(0)
  })

  it('shows compact lifecycle guidance on routing, planning, design, release, and deployment cards', async () => {
    listWagglePresetsMock.mockResolvedValueOnce([
      createPreset({
        id: WagglePresetId('turing'),
        name: 'Turing',
        isBuiltIn: true,
        app: { requiredMcps: [], requiredSkills: [] },
      }),
      createPreset({
        id: WagglePresetId('product-planning'),
        name: 'Product Planning',
        isBuiltIn: true,
        app: { requiredMcps: [], requiredSkills: [] },
      }),
      createPreset({
        id: WagglePresetId('design-asset-direction'),
        name: 'Design And Asset Direction',
        isBuiltIn: true,
        app: { requiredMcps: [], requiredSkills: ['media-director'] },
      }),
      createPreset({
        id: WagglePresetId('release-readiness'),
        name: 'Release Readiness',
        isBuiltIn: true,
        app: { requiredMcps: [], requiredSkills: ['release-checker'] },
      }),
      createPreset({
        id: WagglePresetId('deployment'),
        name: 'Deployment',
        isBuiltIn: true,
        app: { requiredMcps: [], requiredSkills: [] },
      }),
    ])

    renderWithQueryClient(<WaggleSection />)

    const turingStage = await screen.findAllByTestId('preset-stage-turing')
    expect(within(elementAt(turingStage, 0)).getByText('Routing')).toBeInTheDocument()
    const turingGuidance = await screen.findAllByTestId('preset-guidance-turing')
    expect(within(elementAt(turingGuidance, 0)).getByText(/Best For: Routing the next lifecycle step from repo context/i)).toBeInTheDocument()
    expect(within(elementAt(turingGuidance, 0)).getByText(/Recommended Next: Usually Product Planning or a build Waggle/i)).toBeInTheDocument()

    const planningStage = await screen.findAllByTestId('preset-stage-product-planning')
    expect(within(elementAt(planningStage, 0)).getByText('Planning')).toBeInTheDocument()
    const planningGuidance = await screen.findAllByTestId('preset-guidance-product-planning')
    expect(within(elementAt(planningGuidance, 0)).getByText(/Best For: Turning a vague request into a buildable scope/i)).toBeInTheDocument()
    expect(within(elementAt(planningGuidance, 0)).getByText(/Recommended Next: Design And Asset Direction or a build Waggle/i)).toBeInTheDocument()

    const designStage = await screen.findAllByTestId('preset-stage-design-asset-direction')
    expect(within(elementAt(designStage, 0)).getByText('Design')).toBeInTheDocument()
    const designGuidance = await screen.findAllByTestId('preset-guidance-design-asset-direction')
    expect(within(elementAt(designGuidance, 0)).getByText(/Best For: Choosing UI direction, hero mode, and asset fallbacks/i)).toBeInTheDocument()
    expect(within(elementAt(designGuidance, 0)).getByText(/Recommended Next: Web Build or Mobile Build/i)).toBeInTheDocument()

    const releaseStage = await screen.findAllByTestId('preset-stage-release-readiness')
    expect(within(elementAt(releaseStage, 0)).getByText('Release')).toBeInTheDocument()
    const releaseGuidance = await screen.findAllByTestId('preset-guidance-release-readiness')
    expect(within(elementAt(releaseGuidance, 0)).getByText(/Best For: Ship, merge, beta, or demo decisions/i)).toBeInTheDocument()
    expect(within(elementAt(releaseGuidance, 0)).getByText(/Recommended Next: Deployment/i)).toBeInTheDocument()

    const deploymentStage = await screen.findAllByTestId('preset-stage-deployment')
    expect(within(elementAt(deploymentStage, 0)).getByText('Deploy')).toBeInTheDocument()
    const deploymentGuidance = await screen.findAllByTestId('preset-guidance-deployment')
    expect(within(elementAt(deploymentGuidance, 0)).getByText(/Best For: Automated rollout or a manual deployment runbook/i)).toBeInTheDocument()
  })

  it('shows preflight verdicts on lifecycle cards when capability coverage is partial', async () => {
    const preset = createPreset({
      id: WagglePresetId('mobile-build'),
      name: 'Mobile Build',
      isBuiltIn: true,
      app: { requiredMcps: ['mobile-mcp'], requiredSkills: ['frontend-implementer'] },
    })
    listWagglePresetsMock.mockResolvedValueOnce([preset])
    getWaggleAppInstallStatusMock.mockResolvedValueOnce({
      ready: true,
      requiredDependencyCount: 2,
      optionalDependencyCount: 2,
      installedCount: 2,
      missingCount: 0,
      unsupportedCount: 0,
      optionalInstalledCount: 0,
      optionalMissingCount: 2,
      optionalUnsupportedCount: 0,
      dependencies: [],
      preflight: {
        verdict: 'partial',
        summary:
          'Mobile Build can launch, but some optional capabilities are missing and coverage will be narrower.',
        checks: [
          {
            id: 'required-dependencies',
            label: 'Required Dependencies',
            status: 'pass',
            detail: 'All required MCPs and skills are installed.',
            blocking: false,
          },
        ],
      },
    })

    renderWithQueryClient(<WaggleSection />)

    const preflightBadges = await screen.findAllByTestId('preset-preflight-mobile-build')
    expect(within(elementAt(preflightBadges, 0)).getByText(/Preflight partial/i)).toBeInTheDocument()
    expect(screen.getAllByTestId('preset-preflight-summary-mobile-build')).not.toHaveLength(0)
    expect(
      screen.getAllByText(/can launch, but some optional capabilities are missing and coverage will be narrower/i),
    ).not.toHaveLength(0)
  })

  it('installs Waggle app dependencies from the list card', async () => {
    const preset = createPreset()
    listWagglePresetsMock.mockResolvedValueOnce([preset])

    renderWithQueryClient(<WaggleSection />)

    const installButton = await screen.findByRole('button', { name: 'Install' })
    await waitFor(() => {
      expect(installButton).toBeEnabled()
    })
    fireEvent.click(installButton)

    await waitFor(() => {
      expect(installWaggleAppDependenciesMock).toHaveBeenCalledWith(preset, PROJECT_PATH)
    })
  })

  it('keeps launch disabled on the Waggle app surface while dependencies are missing', async () => {
    const preset = createPreset()
    listWagglePresetsMock.mockResolvedValueOnce([preset])

    renderWithQueryClient(<WaggleSection />)

    // Wait for the preset to render and the "Install" button to be visible
    expect(await screen.findByText('Install')).toBeInTheDocument()

    // Ensure the "Launch" button is not present when dependencies are missing
    expect(screen.queryByText('Launch')).not.toBeInTheDocument()
  })

  it('launches a ready Waggle app from the Waggle app surface only', async () => {
    const preset = createPreset()
    listWagglePresetsMock.mockResolvedValueOnce([preset])
    getWaggleAppInstallStatusMock.mockResolvedValueOnce({
      ready: true,
      requiredDependencyCount: 3,
      optionalDependencyCount: 0,
      installedCount: 3,
      missingCount: 0,
      unsupportedCount: 0,
      optionalInstalledCount: 0,
      optionalMissingCount: 0,
      optionalUnsupportedCount: 0,
      dependencies: [],
    })

    renderWithQueryClient(<WaggleSection />)

    fireEvent.click(await screen.findByText('Launch'))

    await waitFor(() => {
      expect(createSessionMock).toHaveBeenCalledWith(PROJECT_PATH)
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/sessions/$sessionId',
        params: { sessionId: 'session-123' },
      })
      expect(useWaggleStore.getState().activeConfig).toEqual(preset.config)
      expect(useWaggleStore.getState().configSessionId).toBe('session-123')
    })
  })

  it('launches Backend Engineer with a selected starter prompt', async () => {
    const preset = createPreset({
      id: WagglePresetId('backend-engineer'),
      name: 'Backend Engineer',
      isBuiltIn: true,
      app: {
        requiredMcps: [],
        requiredSkills: [],
        optionalMcps: ['postman', 'database'],
        optionalSkills: ['backend-auditor'],
      },
    })
    listWagglePresetsMock.mockResolvedValueOnce([preset])
    getWaggleAppInstallStatusMock.mockResolvedValueOnce({
      ready: true,
      requiredDependencyCount: 0,
      optionalDependencyCount: 3,
      installedCount: 0,
      missingCount: 0,
      unsupportedCount: 0,
      optionalInstalledCount: 3,
      optionalMissingCount: 0,
      optionalUnsupportedCount: 0,
      dependencies: [],
    })

    renderWithQueryClient(<WaggleSection />)

    fireEvent.click(elementAt(await screen.findAllByRole('button', { name: /starter prompts/i }), 0))
    fireEvent.click(await screen.findByRole('button', { name: /edit existing feature/i }))

    await waitFor(() => {
      expect(createSessionMock).toHaveBeenCalledWith(PROJECT_PATH)
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/sessions/$sessionId',
        params: { sessionId: 'session-123' },
      })
      expect(useWaggleStore.getState().activeConfig).toEqual(preset.config)
      expect(useWaggleLaunchPromptStore.getState().pendingBySessionId['session-123']?.prompt).toMatch(
        /edit to an existing backend feature/i,
      )
    })
  })

  it('launches Turing with a mobile lifecycle starter prompt', async () => {
    const preset = createPreset({
      id: WagglePresetId('turing'),
      name: 'Turing',
      isBuiltIn: true,
      app: {
        requiredMcps: [],
        requiredSkills: [],
      },
    })
    listWagglePresetsMock.mockResolvedValueOnce([preset])
    getWaggleAppInstallStatusMock.mockResolvedValueOnce({
      ready: true,
      requiredDependencyCount: 0,
      optionalDependencyCount: 0,
      installedCount: 0,
      missingCount: 0,
      unsupportedCount: 0,
      optionalInstalledCount: 0,
      optionalMissingCount: 0,
      optionalUnsupportedCount: 0,
      dependencies: [],
    })

    renderWithQueryClient(<WaggleSection />)

    fireEvent.click(elementAt(await screen.findAllByRole('button', { name: /starter prompts/i }), 0))
    fireEvent.click(await screen.findByRole('button', { name: /route mobile feature flow/i }))

    await waitFor(() => {
      expect(createSessionMock).toHaveBeenCalledWith(PROJECT_PATH)
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/sessions/$sessionId',
        params: { sessionId: 'session-123' },
      })
      expect(useWaggleStore.getState().activeConfig).toEqual(preset.config)
      expect(useWaggleLaunchPromptStore.getState().pendingBySessionId['session-123']?.prompt).toMatch(
        /mobile-build, qa-repair-loop, or quality-assurance-engineer/i,
      )
    })
  })

  it('launches Web Engineer with a Figma starter prompt', async () => {
    const preset = createPreset({
      id: WagglePresetId('web-engineer'),
      name: 'Web Engineer',
      isBuiltIn: true,
      app: {
        requiredMcps: ['playwright'],
        requiredSkills: [],
        optionalMcps: ['figma', 'gsap', 'remotion', 'animejs'],
        optionalSkills: ['frontend-implementer', 'ui-screenshot-auditor'],
      },
    })
    listWagglePresetsMock.mockResolvedValueOnce([preset])
    getWaggleAppInstallStatusMock.mockResolvedValueOnce({
      ready: true,
      requiredDependencyCount: 1,
      optionalDependencyCount: 6,
      installedCount: 1,
      missingCount: 0,
      unsupportedCount: 0,
      optionalInstalledCount: 6,
      optionalMissingCount: 0,
      optionalUnsupportedCount: 0,
      dependencies: [],
    })

    renderWithQueryClient(<WaggleSection />)

    fireEvent.click(elementAt(await screen.findAllByRole('button', { name: /starter prompts/i }), 0))
    fireEvent.click(await screen.findByRole('button', { name: /figma to web ui/i }))

    await waitFor(() => {
      expect(createSessionMock).toHaveBeenCalledWith(PROJECT_PATH)
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/sessions/$sessionId',
        params: { sessionId: 'session-123' },
      })
      expect(useWaggleStore.getState().activeConfig).toEqual(preset.config)
      expect(useWaggleLaunchPromptStore.getState().pendingBySessionId['session-123']?.prompt).toMatch(
        /provided figma or design reference/i,
      )
    })
  })

  it('launches Mobile Engineer with a regression starter prompt', async () => {
    const preset = createPreset({
      id: WagglePresetId('mobile-engineer'),
      name: 'Mobile Engineer',
      isBuiltIn: true,
      app: {
        requiredMcps: ['mobile-mcp'],
        requiredSkills: [],
        optionalMcps: ['mobile-device', 'figma', 'animejs'],
        optionalSkills: ['frontend-implementer', 'ui-screenshot-auditor'],
      },
    })
    listWagglePresetsMock.mockResolvedValueOnce([preset])
    getWaggleAppInstallStatusMock.mockResolvedValueOnce({
      ready: true,
      requiredDependencyCount: 1,
      optionalDependencyCount: 5,
      installedCount: 1,
      missingCount: 0,
      unsupportedCount: 0,
      optionalInstalledCount: 5,
      optionalMissingCount: 0,
      optionalUnsupportedCount: 0,
      dependencies: [],
    })

    renderWithQueryClient(<WaggleSection />)

    fireEvent.click(elementAt(await screen.findAllByRole('button', { name: /starter prompts/i }), 0))
    fireEvent.click(await screen.findByRole('button', { name: /mobile regression and blast radius/i }))

    await waitFor(() => {
      expect(createSessionMock).toHaveBeenCalledWith(PROJECT_PATH)
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/sessions/$sessionId',
        params: { sessionId: 'session-123' },
      })
      expect(useWaggleStore.getState().activeConfig).toEqual(preset.config)
      expect(useWaggleLaunchPromptStore.getState().pendingBySessionId['session-123']?.prompt).toMatch(
        /other screens, navigation paths, shared state, APIs, or data flows/i,
      )
    })
  })

  it('launches Quality Assurance Engineer with a disturbed-flow starter prompt', async () => {
    const preset = createPreset({
      id: WagglePresetId('quality-assurance-engineer'),
      name: 'Quality Assurance Engineer',
      isBuiltIn: true,
      app: {
        requiredMcps: [],
        requiredSkills: [],
        optionalMcps: ['playwright', 'mobile-mcp', 'postman', 'database'],
        optionalSkills: ['ui-screenshot-auditor', 'backend-auditor'],
      },
    })
    listWagglePresetsMock.mockResolvedValueOnce([preset])
    getWaggleAppInstallStatusMock.mockResolvedValueOnce({
      ready: true,
      requiredDependencyCount: 0,
      optionalDependencyCount: 6,
      installedCount: 0,
      missingCount: 0,
      unsupportedCount: 0,
      optionalInstalledCount: 6,
      optionalMissingCount: 0,
      optionalUnsupportedCount: 0,
      dependencies: [],
    })

    renderWithQueryClient(<WaggleSection />)

    fireEvent.click(elementAt(await screen.findAllByRole('button', { name: /starter prompts/i }), 0))
    fireEvent.click(await screen.findByRole('button', { name: /disturbed flow blast radius/i }))

    await waitFor(() => {
      expect(createSessionMock).toHaveBeenCalledWith(PROJECT_PATH)
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/sessions/$sessionId',
        params: { sessionId: 'session-123' },
      })
      expect(useWaggleStore.getState().activeConfig).toEqual(preset.config)
      expect(useWaggleLaunchPromptStore.getState().pendingBySessionId['session-123']?.prompt).toMatch(
        /other files, routes, screens, APIs, database behaviors, and user flows/i,
      )
    })
  })

  it('launches Debugger And Fix with a mixed disturbed-flow starter prompt', async () => {
    const preset = createPreset({
      id: WagglePresetId('qa-debug'),
      name: 'Debugger And Fix',
      isBuiltIn: true,
      app: {
        requiredMcps: [],
        requiredSkills: [],
        optionalMcps: ['playwright', 'mobile-mcp', 'mobile-device', 'postman', 'database'],
        optionalSkills: ['frontend-implementer', 'ui-screenshot-auditor', 'backend-auditor'],
      },
    })
    listWagglePresetsMock.mockResolvedValueOnce([preset])
    getWaggleAppInstallStatusMock.mockResolvedValueOnce({
      ready: true,
      requiredDependencyCount: 0,
      optionalDependencyCount: 8,
      installedCount: 0,
      missingCount: 0,
      unsupportedCount: 0,
      optionalInstalledCount: 8,
      optionalMissingCount: 0,
      optionalUnsupportedCount: 0,
      dependencies: [],
    })

    renderWithQueryClient(<WaggleSection />)

    fireEvent.click(elementAt(await screen.findAllByRole('button', { name: /starter prompts/i }), 0))
    fireEvent.click(await screen.findByRole('button', { name: /mixed disturbed flow regression/i }))

    await waitFor(() => {
      expect(createSessionMock).toHaveBeenCalledWith(PROJECT_PATH)
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/sessions/$sessionId',
        params: { sessionId: 'session-123' },
      })
      expect(useWaggleStore.getState().activeConfig).toEqual(preset.config)
      expect(useWaggleLaunchPromptStore.getState().pendingBySessionId['session-123']?.prompt).toMatch(
        /disturbed other files or flows/i,
      )
    })
  })

  it('launches Web Build with a lifecycle starter prompt', async () => {
    const preset = createPreset({
      id: WagglePresetId('web-build'),
      name: 'Web Build',
      isBuiltIn: true,
      app: {
        requiredMcps: ['playwright'],
        requiredSkills: ['frontend-implementer'],
        optionalMcps: ['figma', 'multimodal-media', 'ffmpeg'],
        optionalSkills: ['ui-screenshot-auditor', 'media-director'],
      },
    })
    listWagglePresetsMock.mockResolvedValueOnce([preset])
    getWaggleAppInstallStatusMock.mockResolvedValueOnce({
      ready: true,
      requiredDependencyCount: 2,
      optionalDependencyCount: 5,
      installedCount: 2,
      missingCount: 0,
      unsupportedCount: 0,
      optionalInstalledCount: 5,
      optionalMissingCount: 0,
      optionalUnsupportedCount: 0,
      dependencies: [],
    })

    renderWithQueryClient(<WaggleSection />)

    fireEvent.click(elementAt(await screen.findAllByRole('button', { name: /starter prompts/i }), 0))
    fireEvent.click(await screen.findByRole('button', { name: /hero build with media fallback/i }))

    await waitFor(() => {
      expect(createSessionMock).toHaveBeenCalledWith(PROJECT_PATH)
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/sessions/$sessionId',
        params: { sessionId: 'session-123' },
      })
      expect(useWaggleStore.getState().activeConfig).toEqual(preset.config)
      expect(useWaggleLaunchPromptStore.getState().pendingBySessionId['session-123']?.prompt).toMatch(
        /static, animated-ui, video, or frames/i,
      )
    })
  })

  it('launches QA Repair Loop with a mobile starter prompt', async () => {
    const preset = createPreset({
      id: WagglePresetId('qa-repair-loop'),
      name: 'QA Repair Loop',
      isBuiltIn: true,
      app: {
        requiredMcps: [],
        requiredSkills: ['ui-screenshot-auditor', 'backend-auditor'],
        optionalMcps: ['playwright', 'mobile-mcp', 'mobile-device', 'postman', 'database'],
        optionalSkills: ['frontend-implementer'],
      },
    })
    listWagglePresetsMock.mockResolvedValueOnce([preset])
    getWaggleAppInstallStatusMock.mockResolvedValueOnce({
      ready: true,
      requiredDependencyCount: 2,
      optionalDependencyCount: 6,
      installedCount: 2,
      missingCount: 0,
      unsupportedCount: 0,
      optionalInstalledCount: 6,
      optionalMissingCount: 0,
      optionalUnsupportedCount: 0,
      dependencies: [],
    })

    renderWithQueryClient(<WaggleSection />)

    fireEvent.click(elementAt(await screen.findAllByRole('button', { name: /starter prompts/i }), 0))
    fireEvent.click(await screen.findByRole('button', { name: /verify, fix, and retest mobile change/i }))

    await waitFor(() => {
      expect(createSessionMock).toHaveBeenCalledWith(PROJECT_PATH)
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/sessions/$sessionId',
        params: { sessionId: 'session-123' },
      })
      expect(useWaggleStore.getState().activeConfig).toEqual(preset.config)
      expect(useWaggleLaunchPromptStore.getState().pendingBySessionId['session-123']?.prompt).toMatch(
        /device or simulator behavior/i,
      )
    })
  })

  it('shows dependency setup details in a Waggle-app-only dialog', async () => {
    const preset = createPreset()
    listWagglePresetsMock.mockResolvedValueOnce([preset])

    renderWithQueryClient(<WaggleSection />)

    const installButton = await screen.findByRole('button', { name: 'Install' })
    await waitFor(() => {
      expect(installButton).toBeEnabled()
    })
    fireEvent.click(installButton)

    await waitFor(() => {
      expect(installWaggleAppDependenciesMock).toHaveBeenCalledWith(preset, PROJECT_PATH)
    })
  })

  it('renders the dependency dialog with a bounded shell and scrollable body', () => {
    const preset = createPreset()

    renderWithQueryClient(
      <WaggleDependencyDialog
        preset={preset}
        status={{
          ready: false,
          requiredDependencyCount: 2,
          optionalDependencyCount: 4,
          installedCount: 1,
          missingCount: 1,
          unsupportedCount: 0,
          optionalInstalledCount: 0,
          optionalMissingCount: 4,
          optionalUnsupportedCount: 0,
          preflight: {
            verdict: 'blocked',
            summary: 'Review Pair is blocked until required capabilities are installed.',
            checks: [
              {
                id: 'required-dependencies',
                label: 'Required Dependencies',
                status: 'fail',
                detail: '1 required missing, 0 required unsupported.',
                blocking: true,
              },
              {
                id: 'optional-coverage',
                label: 'Optional Coverage',
                status: 'warn',
                detail: '4 optional missing, 0 optional unsupported. Waggle can still run with narrower coverage.',
                blocking: false,
              },
            ],
          },
          dependencies: Array.from({ length: 8 }, (_, index) => ({
            kind: index % 2 === 0 ? 'mcp' : 'skill',
            id: `dependency-${index}`,
            label: `Dependency ${index + 1}`,
            required: index < 2,
            state: index === 0 ? 'installed' : 'missing',
            description: 'A long dependency description that should stay inside the dialog body.',
            setupSteps: [
              'First setup instruction.',
              'Second setup instruction.',
            ],
          })),
        }}
        isInstalling={false}
        onInstall={async () => {}}
        onClose={() => {}}
      />,
    )

    expect(screen.getByTestId('waggle-dependency-dialog')).toHaveClass(
      'max-h-[min(88vh,820px)]',
      'flex-col',
      'overflow-hidden',
    )
    expect(screen.getByTestId('waggle-dependency-dialog-body')).toHaveClass(
      'min-h-0',
      'flex-1',
      'overflow-y-auto',
      'overscroll-contain',
    )
    expect(screen.getByText(/Preflight blocked/i)).toBeInTheDocument()
    expect(screen.getByText(/Review Pair is blocked until required capabilities are installed/i)).toBeInTheDocument()
    expect(screen.getByText('Preflight Checks')).toBeInTheDocument()
    expect(screen.getByText('Required Dependencies')).toBeInTheDocument()
    expect(screen.getByText('Optional Coverage')).toBeInTheDocument()
  })

  it('loads a selected preset into the editable form', async () => {
    const preset = createPreset()
    listWagglePresetsMock.mockResolvedValueOnce([preset])

    renderWithQueryClient(<WaggleSection />)

    fireEvent.click((await screen.findAllByText('Review Pair'))[0])

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /edit review pair/i })).toBeInTheDocument()
      expect(screen.getByDisplayValue('Reviewer')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Implementer')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Finds regressions before they land.')).toBeInTheDocument()
      expect(screen.getByLabelText(/required mcps/i)).toHaveValue('playwright\npostgres')
      expect(screen.getByLabelText(/required skills/i)).toHaveValue('ui-critic')
    })
  })

  it('shows tool-generation and native-input capability cues in the modal', async () => {
    const preset = createPreset()
    listWagglePresetsMock.mockResolvedValueOnce([preset])

    renderWithQueryClient(<WaggleSection />)

    fireEvent.click((await screen.findAllByText('Review Pair'))[0])

    expect(await screen.findByRole('dialog', { name: /edit review pair/i })).toBeInTheDocument()
    expect(screen.getAllByText(/tool generation: image \/ audio \/ video/i)).toHaveLength(2)
    expect(screen.getByText(/native image input/i)).toBeInTheDocument()
    expect(screen.getByText(/text handoff only/i)).toBeInTheDocument()
    expect(
      screen.getByText(
        /when using mcps, always map artifact starter payload values into the tool schema exactly/i,
      ),
    ).toBeInTheDocument()
  })

  it('closes the Waggle modal when cancel is pressed', async () => {
    const preset = createPreset()
    listWagglePresetsMock.mockResolvedValueOnce([preset])

    renderWithQueryClient(<WaggleSection />)

    fireEvent.click((await screen.findAllByText('Review Pair'))[0])
    fireEvent.click(await screen.findByRole('button', { name: /cancel/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /edit review pair/i })).not.toBeInTheDocument()
    })
  })

  it('saves edits back to the active preset using the current form state', async () => {
    const preset = createPreset()
    const savedPreset = createPreset({
      name: 'Refiner + Implementer',
      description: 'Custom: Tightens the remediation plan.',
      config: {
        ...preset.config,
        agents: [
          {
            ...preset.config.agents[0],
            label: 'Refiner',
            roleDescription: 'Tightens the remediation plan.',
          },
          preset.config.agents[1],
        ],
      },
      updatedAt: 2,
    })
    listWagglePresetsMock.mockResolvedValueOnce([preset]).mockResolvedValueOnce([savedPreset])
    saveWagglePresetMock.mockResolvedValueOnce(savedPreset)

    renderWithQueryClient(<WaggleSection />)

    fireEvent.click((await screen.findAllByText('Review Pair'))[0])
    await screen.findByRole('dialog', { name: /edit review pair/i })
    fireEvent.change(screen.getByDisplayValue('Reviewer'), {
      target: { value: 'Refiner' },
    })
    fireEvent.change(screen.getByDisplayValue('Finds regressions before they land.'), {
      target: { value: 'Tightens the remediation plan.' },
    })
    fireEvent.change(screen.getByLabelText(/required mcps/i), {
      target: { value: 'playwright\nfigma' },
    })
    fireEvent.change(screen.getByLabelText(/required skills/i), {
      target: { value: 'ui-critic\nrelease-checker' },
    })

    fireEvent.click(await screen.findByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(saveWagglePresetMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: preset.id,
          name: 'Refiner + Implementer',
          description: 'Custom: Tightens the remediation plan.',
          app: {
            requiredMcps: ['playwright', 'figma'],
            requiredSkills: ['ui-critic', 'release-checker'],
          },
          config: expect.objectContaining({
            agents: expect.arrayContaining([
              expect.objectContaining({
                label: 'Refiner',
                roleDescription: 'Tightens the remediation plan.',
              }),
            ]),
          }),
        }),
        PROJECT_PATH,
      )
    })
    expect(listWagglePresetsMock).toHaveBeenCalledTimes(2)
  })

  it('creates a new custom preset from the current form values', async () => {
    const savedPreset = createPreset({
      id: WagglePresetId('preset-2'),
      name: 'Strategist + Skeptic',
      description: 'Custom: Frames trade-offs before implementation.',
      config: {
        mode: 'sequential',
        agents: [
          {
            label: 'Strategist',
            model: SupportedModelId('anthropic/claude-sonnet-4-5'),
            roleDescription: 'Frames trade-offs before implementation.',
            color: 'blue',
          },
          {
            label: 'Skeptic',
            model: SupportedModelId('anthropic/claude-opus-4'),
            roleDescription: 'Challenges weak assumptions.',
            color: 'amber',
          },
        ],
        stop: {
          primary: 'consensus',
          maxTurnsSafety: 8,
        },
      },
    })
    listWagglePresetsMock.mockResolvedValueOnce([]).mockResolvedValueOnce([savedPreset])
    saveWagglePresetMock.mockResolvedValueOnce(savedPreset)

    renderWithQueryClient(<WaggleSection />)

    fireEvent.click(await screen.findByRole('button', { name: /create app/i }))
    await screen.findByRole('dialog', { name: /create waggle/i })
    fireEvent.change(screen.getByDisplayValue('Agent 1'), {
      target: { value: 'Strategist' },
    })
    fireEvent.change(screen.getByDisplayValue('Agent 2'), {
      target: { value: 'Skeptic' },
    })
    fireEvent.change(elementAt(screen.getAllByPlaceholderText(/describe this agent's/i), 0), {
      target: { value: 'Frames trade-offs before implementation.' },
    })
    fireEvent.change(screen.getByLabelText(/required mcps/i), {
      target: { value: 'playwright\npostgres' },
    })
    fireEvent.change(screen.getByLabelText(/required skills/i), {
      target: { value: 'ui-critic\nbackend-auditor' },
    })

    fireEvent.click(screen.getByRole('button', { name: /create waggle/i }))

    await waitFor(() => {
      expect(saveWagglePresetMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: WagglePresetId(''),
          name: 'Strategist + Skeptic',
          description: 'Custom: Frames trade-offs before implementation.',
          app: {
            requiredMcps: ['playwright', 'postgres'],
            requiredSkills: ['ui-critic', 'backend-auditor'],
          },
          isBuiltIn: false,
        }),
        PROJECT_PATH,
      )
    })
    expect(listWagglePresetsMock).toHaveBeenCalledTimes(2)
  })

  it('shows an inline error when presets fail to load', async () => {
    listWagglePresetsMock.mockRejectedValueOnce(new Error('Failed to load presets'))

    renderWithQueryClient(<WaggleSection />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load presets')
  })

  it('shows an inline error when saving edits fails', async () => {
    const preset = createPreset()
    listWagglePresetsMock.mockResolvedValueOnce([preset])
    saveWagglePresetMock.mockRejectedValueOnce(new Error('Save exploded'))

    renderWithQueryClient(<WaggleSection />)

    fireEvent.click((await screen.findAllByText('Review Pair'))[0])
    fireEvent.change(screen.getByDisplayValue('Reviewer'), {
      target: { value: 'Refiner' },
    })

    fireEvent.click(await screen.findByRole('button', { name: /save changes/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Save exploded')
  })

  it('shares the Waggle preset query cache with the command palette', async () => {
    const preset = createPreset()
    listWagglePresetsMock.mockResolvedValueOnce([preset])

    renderWithQueryClient(
      <>
        <WaggleSection />
        <CommandPalette
          slashSkills={[]}
          onSelectSkill={vi.fn()}
          onStartWaggle={vi.fn()}
          onStartTeam={vi.fn()}
        />
      </>,
    )

    await waitFor(() => {
      expect(listWagglePresetsMock).toHaveBeenCalledTimes(1)
      expect(listWagglePresetsMock).toHaveBeenCalledWith(PROJECT_PATH)
    })

    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'review' } })

    await waitFor(() => {
      const presetButtons = screen.getAllByRole('button', { name: /review pair/i })
      expect(presetButtons.length).toBeGreaterThan(0)
    })

    const paletteButton = screen
      .getAllByRole('button', { name: /review pair/i })
      .find((button) => within(button).queryByText('Sequential'))

    expect(paletteButton).toBeTruthy()
  })
})
