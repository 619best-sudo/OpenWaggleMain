import { create } from 'zustand'
import {
  type AppAuthUser,
  googleAuthWithIdToken,
  type LoginWithPasswordInput,
  loginWithPassword,
  logoutFromBackend,
  refreshSession,
  type SignupWithPasswordInput,
  signupWithPassword,
} from '@/features/auth/lib/auth-client'
import {
  createGithubRepoStats,
  type AppLeaderboardSnapshot,
  type AppSubscriptionSnapshot,
  type AppTuringMachineActivitySnapshot,
  fetchSubscriptionSnapshot,
  fetchTuringMachineActivity,
  fetchTuringMachineLeaderboard,
  updateGithubRepoStats,
} from '@/features/auth/lib/subscription-client'
import {
  DEFAULT_SUBSCRIPTION_PLAN_TIER,
  normalizeSubscriptionTier,
} from '@/features/auth/lib/subscription-plan'
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
export type GithubSyncStatus =
  | {
      readonly state: 'idle'
      readonly message: string
      readonly syncedAt: null
      readonly username: null
    }
  | {
      readonly state: 'syncing'
      readonly message: string
      readonly syncedAt: string | null
      readonly username: string | null
    }
  | {
      readonly state: 'synced'
      readonly message: string
      readonly syncedAt: string
      readonly username: string
    }
  | {
      readonly state: 'not_ready' | 'error'
      readonly message: string
      readonly syncedAt: string | null
      readonly username: string | null
    }

interface AppAuthState {
  readonly view: AuthView
  readonly status: AppAuthStatus
  readonly user: AppAuthUser | null
  readonly subscriptionSnapshot: AppSubscriptionSnapshot | null
  readonly turingMachineActivity: AppTuringMachineActivitySnapshot | null
  readonly leaderboardSnapshot: AppLeaderboardSnapshot | null
  readonly githubSyncStatus: GithubSyncStatus
  readonly error: string | null
  setView: (view: AuthView) => void
  clearError: () => void
  signInWithGoogle: () => Promise<void>
  signIn: (input: LoginWithPasswordInput) => Promise<void>
  signUp: (input: SignupWithPasswordInput) => Promise<void>
  signOut: () => Promise<void>
  syncGithubStats: () => Promise<void>
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
      isSubscribed: typeof parsed.isSubscribed === 'boolean' ? parsed.isSubscribed : false,
      subscriptionTier: normalizeSubscriptionTier(
        typeof parsed.subscriptionTier === 'string'
          ? parsed.subscriptionTier
          : DEFAULT_SUBSCRIPTION_PLAN_TIER,
      ),
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

export async function ensureFreshAppSessionProviderTokenForTuringMachine() {
  const currentUser = useAppAuthStore.getState().user
  if (!currentUser) {
    return
  }

  if (shouldRefreshAccessToken(currentUser.accessToken)) {
    await refreshAuthenticatedSession('pre-run')
  }

  const refreshedUser = useAppAuthStore.getState().user
  if (!refreshedUser || shouldRefreshAccessToken(refreshedUser.accessToken)) {
    throw new Error('Your session expired. Please sign in again.')
  }

  await syncAppSessionProviderToken(refreshedUser).catch((error) => {
    logger.warn('Failed to sync backend model token before starting a Turing Machine run', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  })
}

/**
 * Mint a new backend token because a run in flight was rejected as unauthorized.
 *
 * Unlike {@link ensureFreshAppSessionProviderTokenForTuringMachine} this does NOT
 * consult the expiry skew before refreshing. The backend has already told us the
 * token is no good, which is stronger evidence than anything the local `exp`
 * claim can offer — and the two disagree precisely in the cases that matter:
 * a clock skew, an early server-side revocation, or a token that lapsed while
 * the renderer's own refresh timer was throttled or the machine was asleep.
 *
 * Never throws: the caller is a run that has already failed, and its recovery
 * must not be able to make things worse.
 */
export async function recoverAppSessionForUnauthorizedRun(): Promise<void> {
  try {
    await refreshAuthenticatedSession('run-unauthorized')
  } catch (error) {
    logger.warn('Failed to recover app auth session for an unauthorized run', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function refreshSubscriptionSnapshotForUser(
  user: AppAuthUser,
  warningMessage: string,
  options?: { readonly clearBeforeFetch?: boolean },
) {
  if (options?.clearBeforeFetch) {
    useAppAuthStore.setState({ subscriptionSnapshot: null })
  }

  try {
    const subscriptionSnapshot = await fetchSubscriptionSnapshot(user.accessToken)
    const nextUser = {
      ...user,
      isSubscribed: subscriptionSnapshot.tier.key !== 'free',
      subscriptionTier: normalizeSubscriptionTier(subscriptionSnapshot.tier.key),
    }
    persistUser(nextUser)
    useAppAuthStore.setState({
      user: nextUser,
      subscriptionSnapshot,
    })
  } catch (error) {
    logger.warn(warningMessage, {
      error: error instanceof Error ? error.message : String(error),
    })
    if (options?.clearBeforeFetch) {
      useAppAuthStore.setState({ subscriptionSnapshot: null })
    }
  }
}

async function refreshTuringMachineActivityForUser(
  user: AppAuthUser,
  warningMessage: string,
  options?: { readonly clearBeforeFetch?: boolean },
) {
  if (options?.clearBeforeFetch) {
    useAppAuthStore.setState({ turingMachineActivity: null })
  }

  try {
    const turingMachineActivity = await fetchTuringMachineActivity(user.accessToken)
    useAppAuthStore.setState({ turingMachineActivity })
  } catch (error) {
    logger.warn(warningMessage, {
      error: error instanceof Error ? error.message : String(error),
    })
    if (options?.clearBeforeFetch) {
      useAppAuthStore.setState({ turingMachineActivity: null })
    }
  }
}

async function refreshTuringMachineLeaderboardForUser(
  user: AppAuthUser,
  warningMessage: string,
  options?: { readonly clearBeforeFetch?: boolean },
) {
  if (options?.clearBeforeFetch) {
    useAppAuthStore.setState({ leaderboardSnapshot: null })
  }

  try {
    const leaderboardSnapshot = await fetchTuringMachineLeaderboard(user.accessToken)
    useAppAuthStore.setState({ leaderboardSnapshot })
  } catch (error) {
    logger.warn(warningMessage, {
      error: error instanceof Error ? error.message : String(error),
    })
    if (options?.clearBeforeFetch) {
      useAppAuthStore.setState({ leaderboardSnapshot: null })
    }
  }
}

export async function refreshUsageSnapshotsForAuthenticatedUser(options?: {
  readonly includeLeaderboard?: boolean
}) {
  const user = useAppAuthStore.getState().user
  if (!user) return

  await Promise.all([
    refreshSubscriptionSnapshotForUser(
      user,
      'Failed to refresh subscription snapshot after run completion',
      { clearBeforeFetch: false },
    ),
    refreshTuringMachineActivityForUser(
      user,
      'Failed to refresh Turing Machine activity after run completion',
      { clearBeforeFetch: false },
    ),
    ...(options?.includeLeaderboard
      ? [
          refreshTuringMachineLeaderboardForUser(
            user,
            'Failed to refresh leaderboard after run completion',
            { clearBeforeFetch: false },
          ),
        ]
      : []),
  ])
}

async function syncGithubRepoStatsForUser(user: AppAuthUser, warningMessage: string) {
  const previousStatus = useAppAuthStore.getState().githubSyncStatus
  useAppAuthStore.setState({
    githubSyncStatus: {
      state: 'syncing',
      message: 'Syncing GitHub repo stats from your local terminal session...',
      syncedAt: previousStatus.syncedAt,
      username: previousStatus.username,
    },
  })

  try {
    const ghStatus = await api.checkGhCli()
    if (!ghStatus.available) {
      useAppAuthStore.setState({
        githubSyncStatus: {
          state: 'not_ready',
          message: 'GitHub CLI is not installed on this device yet.',
          syncedAt: previousStatus.syncedAt,
          username: previousStatus.username,
        },
      })
      return
    }

    if (!ghStatus.authenticated) {
      useAppAuthStore.setState({
        githubSyncStatus: {
          state: 'not_ready',
          message: 'Run `gh auth login` in terminal to enable GitHub sync.',
          syncedAt: previousStatus.syncedAt,
          username: previousStatus.username,
        },
      })
      return
    }

    const snapshot = await api.collectGithubRepoStats()
    if (snapshot === null) {
      useAppAuthStore.setState({
        githubSyncStatus: {
          state: 'not_ready',
          message: 'GitHub repo stats are not available from the current terminal session.',
          syncedAt: previousStatus.syncedAt,
          username: previousStatus.username,
        },
      })
      return
    }

    let result
    try {
      result = await createGithubRepoStats(user.accessToken, snapshot)
    } catch {
      result = await updateGithubRepoStats(user.accessToken, snapshot)
    }

    useAppAuthStore.setState({
      githubSyncStatus: {
        state: 'synced',
        message:
          result.mode === 'create'
            ? 'GitHub repo stats synced for the first time.'
            : 'GitHub repo stats are up to date.',
        syncedAt: result.syncedAt,
        username: result.username,
      },
    })
  } catch (error) {
    useAppAuthStore.setState({
      githubSyncStatus: {
        state: 'error',
        message: error instanceof Error ? error.message : 'GitHub sync failed.',
        syncedAt: previousStatus.syncedAt,
        username: previousStatus.username,
      },
    })
    logger.warn(warningMessage, {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function applyAuthenticatedUser(
  user: AppAuthUser,
  syncWarningMessage: string,
  options?: { readonly syncGithubRepoStats?: boolean },
) {
  persistUser(user)
  useAppAuthStore.setState({
    status: 'authenticated',
    user,
    subscriptionSnapshot: null,
    turingMachineActivity: null,
    leaderboardSnapshot: null,
    githubSyncStatus: {
      state: 'idle',
      message: 'Run a sync to pull GitHub repo stats into your profile.',
      syncedAt: null,
      username: null,
    },
    error: null,
  })
  scheduleSessionRefresh(user)
  await syncAppSessionProviderToken(user).catch((error) => {
    logger.warn(syncWarningMessage, {
      error: error instanceof Error ? error.message : String(error),
    })
  })
  if (options?.syncGithubRepoStats) {
    await syncGithubRepoStatsForUser(
      user,
      'Failed to sync GitHub repo stats from the local gh CLI session',
    )
  }
  await refreshSubscriptionSnapshotForUser(
    user,
    'Failed to load subscription snapshot after authenticating',
    { clearBeforeFetch: true },
  )
  await refreshTuringMachineActivityForUser(
    user,
    'Failed to load Turing Machine activity after authenticating',
    { clearBeforeFetch: true },
  )
  await refreshTuringMachineLeaderboardForUser(
    user,
    'Failed to load leaderboard after authenticating',
    { clearBeforeFetch: true },
  )
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
    subscriptionSnapshot: null,
    turingMachineActivity: null,
    leaderboardSnapshot: null,
    githubSyncStatus: {
      state: 'idle',
      message: 'Run a sync to pull GitHub repo stats into your profile.',
      syncedAt: null,
      username: null,
    },
    error,
    view: 'login',
  })
}

type SessionRefreshReason = 'restore' | 'scheduled' | 'pre-run' | 'run-unauthorized'

async function refreshAuthenticatedSession(reason: SessionRefreshReason) {
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
        : reason === 'pre-run'
          ? 'Failed to sync backend model token before starting a Turing Machine run'
          : reason === 'run-unauthorized'
            ? 'Failed to sync backend model token while recovering an unauthorized run'
            : 'Failed to sync backend model token after refreshing session',
      { syncGithubRepoStats: reason === 'restore' },
    )
  } catch (error) {
    logger.warn(
      reason === 'restore'
        ? 'Failed to restore app auth session'
        : reason === 'pre-run'
          ? 'Failed to refresh app auth session before starting a Turing Machine run'
          : reason === 'run-unauthorized'
            ? 'Failed to refresh app auth session for an unauthorized run'
            : 'Failed to refresh app auth session',
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
  await syncGithubRepoStatsForUser(
    user,
    'Failed to sync GitHub repo stats while restoring the local app session',
  )
  await refreshSubscriptionSnapshotForUser(
    user,
    'Failed to restore subscription snapshot from local auth state',
    { clearBeforeFetch: true },
  )
  await refreshTuringMachineActivityForUser(
    user,
    'Failed to restore Turing Machine activity from local auth state',
    { clearBeforeFetch: true },
  )
  await refreshTuringMachineLeaderboardForUser(
    user,
    'Failed to restore leaderboard from local auth state',
    { clearBeforeFetch: true },
  )
}

const initialUser = readStoredUser()

export const useAppAuthStore = create<AppAuthState>((set, get) => ({
  view: 'login',
  status: initialUser ? 'authenticated' : 'signed_out',
  user: initialUser,
  subscriptionSnapshot: null,
  turingMachineActivity: null,
  leaderboardSnapshot: null,
  githubSyncStatus: {
    state: 'idle',
    message: 'Run a sync to pull GitHub repo stats into your profile.',
    syncedAt: null,
    username: null,
  },
  error: null,

  setView(view) {
    set({ view, error: null })
  },

  clearError() {
    set({ error: null })
  },

  async signInWithGoogle() {
    set({ status: 'submitting', error: null })

    try {
      const idToken = await api.startAppGoogleOAuth()
      const user = await googleAuthWithIdToken({ idToken })
      await applyAuthenticatedUser(user, 'Failed to sync backend model token after Google sign-in', {
        syncGithubRepoStats: true,
      })
    } catch (error) {
      set({
        status: 'signed_out',
        error: error instanceof Error ? error.message : 'Unable to sign in with Google right now.',
      })
    }
  },

  async signIn(input) {
    set({ status: 'submitting', error: null })

    try {
      const user = await loginWithPassword(input)
      await applyAuthenticatedUser(user, 'Failed to sync backend model token after sign-in', {
        syncGithubRepoStats: true,
      })
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
      await applyAuthenticatedUser(user, 'Failed to sync backend model token after sign-up', {
        syncGithubRepoStats: true,
      })
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
    set({
      status: 'signed_out',
      user: null,
      subscriptionSnapshot: null,
      turingMachineActivity: null,
      leaderboardSnapshot: null,
      githubSyncStatus: {
        state: 'idle',
        message: 'Run a sync to pull GitHub repo stats into your profile.',
        syncedAt: null,
        username: null,
      },
      error: null,
      view: 'login',
    })
  },

  async syncGithubStats() {
    const user = get().user
    if (!user) return

    await syncGithubRepoStatsForUser(user, 'Failed to sync GitHub repo stats from the profile page')
    await refreshTuringMachineLeaderboardForUser(
      user,
      'Failed to refresh leaderboard after GitHub repo sync',
      { clearBeforeFetch: false },
    )
  },
}))

export function useAppAuth() {
  const view = useAppAuthStore((state) => state.view)
  const status = useAppAuthStore((state) => state.status)
  const user = useAppAuthStore((state) => state.user)
  const subscriptionSnapshot = useAppAuthStore((state) => state.subscriptionSnapshot)
  const turingMachineActivity = useAppAuthStore((state) => state.turingMachineActivity)
  const leaderboardSnapshot = useAppAuthStore((state) => state.leaderboardSnapshot)
  const githubSyncStatus = useAppAuthStore((state) => state.githubSyncStatus)
  const error = useAppAuthStore((state) => state.error)
  const setView = useAppAuthStore((state) => state.setView)
  const clearError = useAppAuthStore((state) => state.clearError)
  const signInWithGoogle = useAppAuthStore((state) => state.signInWithGoogle)
  const signIn = useAppAuthStore((state) => state.signIn)
  const signUp = useAppAuthStore((state) => state.signUp)
  const signOut = useAppAuthStore((state) => state.signOut)
  const syncGithubStats = useAppAuthStore((state) => state.syncGithubStats)

  return {
    view,
    status,
    user,
    subscriptionSnapshot,
    turingMachineActivity,
    leaderboardSnapshot,
    githubSyncStatus,
    error,
    isAuthenticated: status === 'authenticated',
    setView,
    clearError,
    signInWithGoogle,
    signIn,
    signUp,
    signOut,
    syncGithubStats,
  }
}

if (initialUser) {
  void initializeStoredSession(initialUser)
}

// Subscribed at module scope rather than from a component: the run that needs
// recovery is owned by the main process and can fail at any moment, including
// while no auth-aware view is mounted. Tying this to a component's lifetime
// would make recovery depend on which screen the user happens to be looking at.
//
// The capability check is for test doubles, not for production — the preload
// surface is contract-tested, so the method is always there in a real renderer.
// Importing this module must not explode just because a suite stubbed `api`
// with only the handful of methods its own subject calls.
if (typeof window !== 'undefined' && typeof api.onAppAuthRefreshRequired === 'function') {
  api.onAppAuthRefreshRequired(() => {
    void recoverAppSessionForUnauthorizedRun()
  })
}
