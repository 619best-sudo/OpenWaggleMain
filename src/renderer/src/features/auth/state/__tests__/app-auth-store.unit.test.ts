import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authClientMock, apiMock, loggerMock } = vi.hoisted(() => ({
  authClientMock: {
    loginWithPassword: vi.fn(),
    refreshSession: vi.fn(),
    signupWithPassword: vi.fn(),
    logoutFromBackend: vi.fn(),
  },
  apiMock: {
    setProviderApiKey: vi.fn(),
  },
  loggerMock: {
    warn: vi.fn(),
  },
}))

vi.mock('@/features/auth/lib/auth-client', () => authClientMock)
vi.mock('@/shared/lib/ipc', () => ({ api: apiMock }))
vi.mock('@/shared/lib/logger', () => ({
  createRendererLogger: () => loggerMock,
}))

import {
  syncAppSessionProviderToken,
  useAppAuthStore,
} from '../app-auth-store'

describe('app-auth-store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.setProviderApiKey.mockResolvedValue(undefined)
    authClientMock.loginWithPassword.mockResolvedValue({
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    })
    authClientMock.signupWithPassword.mockResolvedValue({
      id: 'user-2',
      name: 'New User',
      email: 'new@example.com',
      accessToken: 'signup-access-token',
      refreshToken: 'signup-refresh-token',
    })
    authClientMock.refreshSession.mockResolvedValue({
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
      accessToken: 'refreshed-access-token',
      refreshToken: 'refreshed-refresh-token',
    })
    authClientMock.logoutFromBackend.mockResolvedValue(undefined)
    useAppAuthStore.setState({
      view: 'login',
      status: 'signed_out',
      user: null,
      error: null,
    })
  })

  it('syncs the backend model provider token through the Pi auth bridge', async () => {
    await syncAppSessionProviderToken({
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    })

    expect(apiMock.setProviderApiKey).toHaveBeenCalledWith('turing-machine', 'access-token')
  })

  it('signs in and mirrors the access token into the provider auth store', async () => {
    await useAppAuthStore.getState().signIn({
      email: 'test@example.com',
      password: 'secret123',
    })

    expect(authClientMock.loginWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'secret123',
    })
    expect(apiMock.setProviderApiKey).toHaveBeenCalledWith('turing-machine', 'access-token')
    expect(useAppAuthStore.getState().status).toBe('authenticated')
    expect(useAppAuthStore.getState().user?.accessToken).toBe('access-token')
  })

  it('signs out and clears the mirrored provider token', async () => {
    useAppAuthStore.setState({
      status: 'authenticated',
      user: {
        id: 'user-1',
        name: 'Test User',
        email: 'test@example.com',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    })

    await useAppAuthStore.getState().signOut()

    expect(authClientMock.logoutFromBackend).toHaveBeenCalledWith({
      refreshToken: 'refresh-token',
    })
    expect(apiMock.setProviderApiKey).toHaveBeenCalledWith('turing-machine', '')
    expect(useAppAuthStore.getState().status).toBe('signed_out')
    expect(useAppAuthStore.getState().user).toBeNull()
  })

})
