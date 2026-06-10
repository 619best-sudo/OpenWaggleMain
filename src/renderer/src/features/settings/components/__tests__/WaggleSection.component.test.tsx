import { SupportedModelId, WagglePresetId } from '@shared/types/brand'
import type { ProviderInfo } from '@shared/types/llm'
import { DEFAULT_SETTINGS } from '@shared/types/settings'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandPalette } from '@/features/command-palette/components'
import { usePreferencesStore } from '@/features/settings/state/preferences-store'
import { useWaggleStore } from '@/features/waggle/state'
import { useUIStore } from '@/shell/ui-store'
import { renderWithQueryClient } from '@/test-utils/query-test-utils'
import { createPreset, PROJECT_PATH, PROVIDER_MODELS } from './WaggleSection.test-utils'

const {
  listWagglePresetsMock,
  saveWagglePresetMock,
  deleteWagglePresetMock,
  usePreferencesMock,
  useProvidersMock,
} = vi.hoisted(() => ({
  listWagglePresetsMock: vi.fn(),
  saveWagglePresetMock: vi.fn(),
  deleteWagglePresetMock: vi.fn(),
  usePreferencesMock: vi.fn(),
  useProvidersMock: vi.fn(),
}))

vi.mock('@/features/settings/hooks/useSettings', () => ({
  usePreferences: usePreferencesMock,
  useProviders: useProvidersMock,
}))

vi.mock('@/shared/lib/ipc', () => ({
  api: {
    listWagglePresets: listWagglePresetsMock,
    saveWagglePreset: saveWagglePresetMock,
    deleteWagglePreset: deleteWagglePresetMock,
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

    usePreferencesMock.mockReturnValue({
      settings: DEFAULT_SETTINGS,
    })
    useProvidersMock.mockReturnValue({
      providerModels: PROVIDER_MODELS,
    })
    deleteWagglePresetMock.mockResolvedValue(undefined)
  })

  it('keeps the editor closed until a Waggle is selected or created', async () => {
    const preset = createPreset()
    listWagglePresetsMock.mockResolvedValueOnce([preset])

    renderWithQueryClient(<WaggleSection />)

    expect(await screen.findByText('Waggles')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('Reviewer')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /new waggle/i }))

    expect(await screen.findByRole('dialog', { name: /create waggle/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create waggle/i })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Agent A')).toBeInTheDocument()
  })

  it('keeps model names out of the Waggle list items', async () => {
    const preset = createPreset()
    listWagglePresetsMock.mockResolvedValueOnce([preset])

    renderWithQueryClient(<WaggleSection />)

    await screen.findByText('Review Pair')

    expect(screen.queryByText('Claude Sonnet 4.5')).not.toBeInTheDocument()
    expect(screen.queryByText('Claude Opus 4')).not.toBeInTheDocument()
    expect(screen.getByText(/reviewer/i)).toBeInTheDocument()
    expect(screen.getByText(/implementer/i)).toBeInTheDocument()
  })

  it('loads a selected preset into the editable form', async () => {
    const preset = createPreset()
    listWagglePresetsMock.mockResolvedValueOnce([preset])

    renderWithQueryClient(<WaggleSection />)

    fireEvent.click((await screen.findByText('Review Pair')).closest('button') ?? document.body)

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /edit review pair/i })).toBeInTheDocument()
      expect(screen.getByDisplayValue('Reviewer')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Implementer')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Finds regressions before they land.')).toBeInTheDocument()
    })
  })

  it('closes the Waggle modal when cancel is pressed', async () => {
    const preset = createPreset()
    listWagglePresetsMock.mockResolvedValueOnce([preset])

    renderWithQueryClient(<WaggleSection />)

    fireEvent.click((await screen.findByText('Review Pair')).closest('button') ?? document.body)
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

    fireEvent.click((await screen.findByText('Review Pair')).closest('button') ?? document.body)
    fireEvent.change(screen.getByDisplayValue('Reviewer'), {
      target: { value: 'Refiner' },
    })
    fireEvent.change(screen.getByDisplayValue('Finds regressions before they land.'), {
      target: { value: 'Tightens the remediation plan.' },
    })

    fireEvent.click(await screen.findByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(saveWagglePresetMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: preset.id,
          name: 'Refiner + Implementer',
          description: 'Custom: Tightens the remediation plan.',
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

    fireEvent.click(await screen.findByRole('button', { name: /new waggle/i }))
    fireEvent.change(screen.getByDisplayValue('Agent A'), {
      target: { value: 'Strategist' },
    })
    fireEvent.change(screen.getByDisplayValue('Agent B'), {
      target: { value: 'Skeptic' },
    })
    fireEvent.change(elementAt(screen.getAllByPlaceholderText(/describe this agent's/i), 0), {
      target: { value: 'Frames trade-offs before implementation.' },
    })

    fireEvent.click(screen.getByRole('button', { name: /create waggle/i }))

    await waitFor(() => {
      expect(saveWagglePresetMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: WagglePresetId(''),
          name: 'Strategist + Skeptic',
          description: 'Custom: Frames trade-offs before implementation.',
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

    fireEvent.click((await screen.findByText('Review Pair')).closest('button') ?? document.body)
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
        <CommandPalette slashSkills={[]} onSelectSkill={vi.fn()} onStartWaggle={vi.fn()} />
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
