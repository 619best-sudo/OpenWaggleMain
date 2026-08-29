import { beforeEach, describe, expect, it, vi } from 'vitest'

function createJwtWithExpiry(offsetSeconds: number) {
  const encode = (value: Record<string, unknown>) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')

  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    exp: Math.floor(Date.now() / 1000) + offsetSeconds,
  })}.signature`
}

const { authClientMock, apiMock, loggerMock } = vi.hoisted(() => ({
  authClientMock: {
    googleAuthWithIdToken: vi.fn(),
    loginWithPassword: vi.fn(),
    refreshSession: vi.fn(),
    signupWithPassword: vi.fn(),
    logoutFromBackend: vi.fn(),
  },
  apiMock: {
    setProviderApiKey: vi.fn(),
    startAppGoogleOAuth: vi.fn(),
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
  ensureFreshAppSessionProviderTokenForTuringMachine,
  syncAppSessionProviderToken,
  useAppAuthStore,
} from '../app-auth-store'

describe('app-auth-store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const refreshedAccessToken = createJwtWithExpiry(3600)
    apiMock.setProviderApiKey.mockResolvedValue(undefined)
    apiMock.startAppGoogleOAuth.mockResolvedValue('google-id-token')
    authClientMock.loginWithPassword.mockResolvedValue({
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    })
    authClientMock.googleAuthWithIdToken.mockResolvedValue({
      id: 'user-3',
      name: 'Google User',
      email: 'google@example.com',
      accessToken: 'google-access-token',
      refreshToken: 'google-refresh-token',
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
      accessToken: refreshedAccessToken,
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

  it('refreshes and resyncs the provider token before a Turing Machine run when the access token is stale', async () => {
    useAppAuthStore.setState({
      status: 'authenticated',
      user: {
        id: 'user-1',
        name: 'Test User',
        email: 'test@example.com',
        accessToken: 'stale-access-token',
        refreshToken: 'refresh-token',
      },
      error: null,
    })

    await ensureFreshAppSessionProviderTokenForTuringMachine()

    expect(authClientMock.refreshSession).toHaveBeenCalledWith({
      refreshToken: 'refresh-token',
      fallbackName: 'Test User',
      fallbackEmail: 'test@example.com',
    })
    const syncedAccessToken = useAppAuthStore.getState().user?.accessToken
    expect(typeof syncedAccessToken).toBe('string')
    expect(syncedAccessToken).not.toBe('stale-access-token')
    expect(apiMock.setProviderApiKey).toHaveBeenLastCalledWith('turing-machine', syncedAccessToken)
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

  it('signs in with Google and mirrors the backend token into the provider auth store', async () => {
    await useAppAuthStore.getState().signInWithGoogle()

    expect(apiMock.startAppGoogleOAuth).toHaveBeenCalledWith()
    expect(authClientMock.googleAuthWithIdToken).toHaveBeenCalledWith({
      idToken: 'google-id-token',
    })
    expect(apiMock.setProviderApiKey).toHaveBeenCalledWith('turing-machine', 'google-access-token')
    expect(useAppAuthStore.getState().status).toBe('authenticated')
    expect(useAppAuthStore.getState().user?.email).toBe('google@example.com')
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
