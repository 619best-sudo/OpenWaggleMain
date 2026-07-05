import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  googleAuthWithIdToken,
  loginWithPassword,
  logoutFromBackend,
  refreshSession,
  signupWithPassword,
} from '../auth-client'

const fetchMock = vi.fn<typeof fetch>()

describe('auth-client', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('logs in against the GreatX email auth endpoint', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          user: {
            id: 'user-123',
            email: 'User@Example.com',
            displayName: null,
            isSubscribed: true,
            subscriptionTier: 'pro',
          },
          tokens: {
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    )

    const user = await loginWithPassword({
      email: 'User@Example.com',
      password: 'secret-123',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/auth/email',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'secret-123',
        }),
      }),
    )
    expect(user).toEqual({
      id: 'user-123',
      name: 'User',
      email: 'user@example.com',
      isSubscribed: true,
      subscriptionTier: 'pro',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    })
  })

  it('uses the signup form name when the backend does not return one', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          user: {
            id: 'user-456',
            email: 'new@example.com',
            displayName: null,
            isSubscribed: false,
            subscriptionTier: 'free',
          },
          tokens: {
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    )

    const user = await signupWithPassword({
      name: 'Alex Johnson',
      email: 'new@example.com',
      password: 'secret-123',
    })

    expect(user.name).toBe('Alex Johnson')
  })

  it('posts the Google ID token to the Google auth endpoint', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          user: {
            id: 'user-google',
            email: 'google@example.com',
            displayName: 'Google User',
            isSubscribed: true,
            subscriptionTier: 'business',
          },
          tokens: {
            accessToken: 'google-access-token',
            refreshToken: 'google-refresh-token',
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    )

    const user = await googleAuthWithIdToken({ idToken: 'google-id-token' })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/auth/google',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          idToken: 'google-id-token',
        }),
      }),
    )
    expect(user).toEqual({
      id: 'user-google',
      name: 'Google User',
      email: 'google@example.com',
      isSubscribed: true,
      subscriptionTier: 'business',
      accessToken: 'google-access-token',
      refreshToken: 'google-refresh-token',
    })
  })

  it('surfaces backend validation errors from auth responses', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          message: ['password must be longer than or equal to 8 characters'],
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    )

    await expect(
      signupWithPassword({
        name: 'Alex Johnson',
        email: 'new@example.com',
        password: 'short',
      }),
    ).rejects.toThrow('password must be longer than or equal to 8 characters')
  })

  it('logs out with the stored refresh token', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    )

    await logoutFromBackend({ refreshToken: 'refresh-token' })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/auth/logout',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          refreshToken: 'refresh-token',
        }),
      }),
    )
  })

  it('refreshes the auth session and returns a new access token', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          user: {
            id: 'user-123',
            email: 'User@Example.com',
            displayName: null,
            isSubscribed: true,
            subscriptionTier: 'pro',
          },
          tokens: {
            accessToken: 'refreshed-access-token',
            refreshToken: 'refreshed-refresh-token',
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    )

    const user = await refreshSession({
      refreshToken: 'refresh-token',
      fallbackName: 'Test User',
      fallbackEmail: 'User@Example.com',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/auth/refresh',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          refreshToken: 'refresh-token',
        }),
      }),
    )
    expect(user).toEqual({
      id: 'user-123',
      name: 'Test User',
      email: 'user@example.com',
      isSubscribed: true,
      subscriptionTier: 'pro',
      accessToken: 'refreshed-access-token',
      refreshToken: 'refreshed-refresh-token',
    })
  })
})
