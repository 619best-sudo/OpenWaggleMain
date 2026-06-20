import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useSettingsSetupMock = vi.fn()
const usePreferencesMock = vi.fn()
const useAppAuthMock = vi.fn()

vi.mock('@/features/settings/hooks/useSettings', () => ({
  useSettingsSetup: () => {
    useSettingsSetupMock()
  },
  usePreferences: () => usePreferencesMock(),
}))

vi.mock('@/features/auth/state/app-auth-store', () => ({
  useAppAuth: () => useAppAuthMock(),
}))

vi.mock('@/features/auth/components/AuthScreen', () => ({
  AuthScreen: () => <div data-testid="auth-screen">auth</div>,
}))

vi.mock('@tanstack/react-router', () => ({
  RouterProvider: () => <div data-testid="router-provider">router</div>,
}))

vi.mock('@/router', () => ({
  router: {},
}))

import { App } from '../App'

describe('App', () => {
  beforeEach(() => {
    useSettingsSetupMock.mockReset()
    usePreferencesMock.mockReset()
    useAppAuthMock.mockReset()
    usePreferencesMock.mockReturnValue({ isLoaded: true })
    useAppAuthMock.mockReturnValue({ isAuthenticated: true })
  })

  it('renders loading view before preferences are loaded', () => {
    usePreferencesMock.mockReturnValue({ isLoaded: false })

    render(<App />)

    expect(screen.queryByTestId('router-provider')).toBeNull()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('renders the route tree after preferences are loaded', () => {
    render(<App />)

    expect(screen.getByTestId('router-provider')).toBeInTheDocument()
  })

  it('renders the auth screen before the user is authenticated', () => {
    useAppAuthMock.mockReturnValue({ isAuthenticated: false })

    render(<App />)

    expect(screen.queryByTestId('router-provider')).toBeNull()
    expect(screen.getByTestId('auth-screen')).toBeInTheDocument()
  })
})
