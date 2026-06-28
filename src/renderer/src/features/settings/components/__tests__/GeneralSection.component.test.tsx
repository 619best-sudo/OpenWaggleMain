import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/types/settings'
import { usePreferencesStore } from '@/features/settings/state/preferences-store'

const { updateSettingsMock } = vi.hoisted(() => ({
  updateSettingsMock: vi.fn(),
}))

vi.mock('@/shared/lib/ipc', () => ({
  api: {
    updateSettings: updateSettingsMock,
  },
}))

import { GeneralSection } from '../sections/GeneralSection'

describe('GeneralSection', () => {
  beforeEach(() => {
    updateSettingsMock.mockReset()
    updateSettingsMock.mockResolvedValue(undefined)
    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      settings: DEFAULT_SETTINGS,
      isLoaded: true,
      loadError: null,
    })
  })

  it('renders the theme picker options', () => {
    render(<GeneralSection />)

    expect(screen.getByRole('button', { name: /Light theme/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Dark theme/i })).toBeInTheDocument()
    expect(screen.getByText(/Active now:/i)).toBeInTheDocument()
  })

  it('renders the general settings heading', () => {
    render(<GeneralSection />)
    expect(screen.getByText('General')).toBeInTheDocument()
    expect(screen.getByText(/Manage workspace-wide preferences/i)).toBeInTheDocument()
  })

  it('updates the selected theme when the user picks a different option', async () => {
    render(<GeneralSection />)

    fireEvent.click(screen.getByRole('button', { name: /Light theme/i }))

    await waitFor(() => {
      expect(updateSettingsMock).toHaveBeenCalledWith({ themeMode: 'light' })
      expect(usePreferencesStore.getState().settings.themeMode).toBe('light')
    })
  })
})
