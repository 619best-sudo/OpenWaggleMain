import { create } from 'zustand'
import {
  loginWithPassword,
  refreshSession,
  logoutFromBackend,
  signupWithPassword,
  type AppAuthUser,
  type LoginWithPasswordInput,
  type SignupWithPasswordInput,
} from '@/features/auth/lib/auth-client'
import { api } from '@/shared/lib/ipc'
import { createRendererLogger } from '@/shared/lib/logger'

const STORAGE_KEY = 'openwaggle.app-auth.user'
const TURING_MACHINE_PROVIDER_ID = 'turing-machine'
const TOKEN_REFRESH_SKEW_MS = 60_000
const MIN_TOKEN_REFRESH_DELAY_MS = 5_000
const logger = createRendererLogger('app-auth')
let sessionRefreshTimeoutId: number | null = null

export type AuthView = 'login' | 'signup'
export type AppAuthStatus = 'signed_out' | 'submitting' | 'authenticated'

interface AppAuthState {
  readonly view: AuthView
  readonly status: AppAuthStatus
  readonly user: AppAuthUser | null
  readonly error: string | null
  setView: (view: AuthView) => void
  clearError: () => void
  signIn: (input: LoginWithPasswordInput) => Promise<void>
  signUp: (input: SignupWithPasswordInput) => Promise<void>
  signOut: () => Promise<void>
}

function readStoredUser(): AppAuthUser | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AppAuthUser>
    if (
      typeof parsed.id !== 'string' ||
      typeof parsed.name !== 'string' ||
      typeof parsed.email !== 'string' ||
      typeof parsed.accessToken !== 'string' ||
      typeof parsed.refreshToken !== 'string'
    ) {
      return null
    }
    return {
      id: parsed.id,
      name: parsed.name,
      email: parsed.email,
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
    }
  } catch {
    return null
  }
}

function persistUser(user: AppAuthUser | null) {
  if (typeof window === 'undefined') return

  if (user) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    return
  }

  window.localStorage.removeItem(STORAGE_KEY)
}

function clearSessionRefreshTimer() {
  if (typeof window === 'undefined' || sessionRefreshTimeoutId === null) return
  window.clearTimeout(sessionRefreshTimeoutId)
  sessionRefreshTimeoutId = null
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const [, payload] = token.split('.')
  if (!payload) return null

  try {
    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padding = '='.repeat((4 - (normalizedPayload.length % 4)) % 4)
    const decodedPayload = atob(`${normalizedPayload}${padding}`)
    return JSON.parse(decodedPayload) as Record<string, unknown>
  } catch {
    return null
  }
}

function getAccessTokenExpiryTime(token: string): number | null {
  const payload = decodeJwtPayload(token)
  const exp = payload?.exp
  return typeof exp === 'number' ? exp * 1000 : null
}

function shouldRefreshAccessToken(token: string, now = Date.now()) {
  const expiryTime = getAccessTokenExpiryTime(token)
  if (expiryTime === null) return true
  return expiryTime - now <= TOKEN_REFRESH_SKEW_MS
}

export async function syncAppSessionProviderToken(user: AppAuthUser | null) {
  const token = user?.accessToken.trim() ?? ''
  await api.setProviderApiKey(TURING_MACHINE_PROVIDER_ID, token)
}

async function applyAuthenticatedUser(user: AppAuthUser, syncWarningMessage: string) {
  persistUser(user)
  useAppAuthStore.setState({ status: 'authenticated', user, error: null })
  scheduleSessionRefresh(user)
  await syncAppSessionProviderToken(user).catch((error) => {
    logger.warn(syncWarningMessage, {
      error: error instanceof Error ? error.message : String(error),
    })
  })
}

function scheduleSessionRefresh(user: AppAuthUser | null) {
  clearSessionRefreshTimer()
  if (typeof window === 'undefined' || user === null) return

  const expiryTime = getAccessTokenExpiryTime(user.accessToken)
  const refreshDelay =
    expiryTime === null
      ? MIN_TOKEN_REFRESH_DELAY_MS
      : Math.max(expiryTime - Date.now() - TOKEN_REFRESH_SKEW_MS, MIN_TOKEN_REFRESH_DELAY_MS)

  sessionRefreshTimeoutId = window.setTimeout(() => {
    void refreshAuthenticatedSession('scheduled')
  }, refreshDelay)
}

async function clearAuthenticatedSession(error: string | null) {
  clearSessionRefreshTimer()
  await syncAppSessionProviderToken(null).catch((syncError) => {
    logger.warn('Failed to clear backend model token while resetting auth state', {
      error: syncError instanceof Error ? syncError.message : String(syncError),
    })
  })
  persistUser(null)
  useAppAuthStore.setState({
    status: 'signed_out',
    user: null,
    error,
    view: 'login',
  })
}

async function refreshAuthenticatedSession(reason: 'restore' | 'scheduled') {
  const currentUser = useAppAuthStore.getState().user
  if (!currentUser) return

  try {
    const refreshedUser = await refreshSession({
      refreshToken: currentUser.refreshToken,
      fallbackName: currentUser.name,
      fallbackEmail: currentUser.email,
    })
    await applyAuthenticatedUser(
      refreshedUser,
      reason === 'restore'
        ? 'Failed to sync backend model token after restoring session'
        : 'Failed to sync backend model token after refreshing session',
    )
  } catch (error) {
    logger.warn(
      reason === 'restore' ? 'Failed to restore app auth session' : 'Failed to refresh app auth session',
      {
        error: error instanceof Error ? error.message : String(error),
      },
    )

    if (shouldRefreshAccessToken(currentUser.accessToken)) {
      await clearAuthenticatedSession('Your session expired. Please sign in again.')
      return
    }

    scheduleSessionRefresh(currentUser)
  }
}

async function initializeStoredSession(user: AppAuthUser) {
  if (shouldRefreshAccessToken(user.accessToken)) {
    await refreshAuthenticatedSession('restore')
    return
  }

  scheduleSessionRefresh(user)
  await syncAppSessionProviderToken(user).catch((error) => {
    logger.warn('Failed to restore backend model token from local auth state', {
      error: error instanceof Error ? error.message : String(error),
    })
  })
}

const initialUser = readStoredUser()

export const useAppAuthStore = create<AppAuthState>((set, get) => ({
  view: 'login',
  status: initialUser ? 'authenticated' : 'signed_out',
  user: initialUser,
  error: null,

  setView(view) {
    set({ view, error: null })
  },

  clearError() {
    set({ error: null })
  },

  async signIn(input) {
    set({ status: 'submitting', error: null })

    try {
      const user = await loginWithPassword(input)
      await applyAuthenticatedUser(user, 'Failed to sync backend model token after sign-in')
    } catch (error) {
      set({
        status: 'signed_out',
        error: error instanceof Error ? error.message : 'Unable to sign in right now.',
      })
    }
  },

  async signUp(input) {
    set({ status: 'submitting', error: null })

    try {
      const user = await signupWithPassword(input)
      await applyAuthenticatedUser(user, 'Failed to sync backend model token after sign-up')
    } catch (error) {
      set({
        status: 'signed_out',
        error: error instanceof Error ? error.message : 'Unable to create your account right now.',
      })
    }
  },

  async signOut() {
    clearSessionRefreshTimer()
    const refreshToken = get().user?.refreshToken

    if (refreshToken) {
      try {
        await logoutFromBackend({ refreshToken })
      } catch {
        // Clear local auth state even if the backend session was already gone.
      }
    }

    await syncAppSessionProviderToken(null).catch((error) => {
      logger.warn('Failed to clear backend model token during sign-out', {
        error: error instanceof Error ? error.message : String(error),
      })
    })
    persistUser(null)
    set({ status: 'signed_out', user: null, error: null, view: 'login' })
  },
}))

export function useAppAuth() {
  const view = useAppAuthStore((state) => state.view)
  const status = useAppAuthStore((state) => state.status)
  const user = useAppAuthStore((state) => state.user)
  const error = useAppAuthStore((state) => state.error)
  const setView = useAppAuthStore((state) => state.setView)
  const clearError = useAppAuthStore((state) => state.clearError)
  const signIn = useAppAuthStore((state) => state.signIn)
  const signUp = useAppAuthStore((state) => state.signUp)
  const signOut = useAppAuthStore((state) => state.signOut)

  return {
    view,
    status,
    user,
    error,
    isAuthenticated: status === 'authenticated',
    setView,
    clearError,
    signIn,
    signUp,
    signOut,
  }
}

if (initialUser) {
  void initializeStoredSession(initialUser)
}
