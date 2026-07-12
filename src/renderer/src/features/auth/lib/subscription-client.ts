import { resolveAuthUrl } from './auth-client'
import type { GithubRepoStatsSnapshot } from '@shared/types/feedback'

export interface AppSubscriptionSnapshot {
  readonly tier: {
    readonly key: string
    readonly name: string
    readonly descriptionMarkdown: string | null
    readonly turingMachineQuotaUsdCents: number
  }
  readonly subscription: {
    readonly status: string
    readonly billingCycle: 'monthly' | 'yearly'
    readonly currentPeriodStart: string
    readonly currentPeriodEnd: string
    readonly cancelAtPeriodEnd: boolean
  }
  readonly pricing: {
    readonly billingCycle: 'monthly' | 'yearly'
    readonly originalCents: number
    readonly discountedCents: number | null
    readonly finalCents: number
    readonly discountPercent: number
  }
  readonly turingMachine: {
    readonly quotaUsdCents: number
    readonly quotaUsdMicros?: number
    readonly quotaUsd?: number
    readonly consumedUsdCents: number
    readonly consumedUsdMicros?: number
    readonly consumedUsd?: number
    readonly remainingUsdCents: number
    readonly remainingUsdMicros?: number
    readonly remainingUsd?: number
    readonly percentUsed: number
    readonly inputTokens?: number
    readonly outputTokens?: number
  }
}

export interface AppTuringMachineActivityDay {
  readonly date: string
  readonly requestCount: number
  readonly usdCents: number
  readonly usdMicros?: number
  readonly usd?: number
  readonly inputTokens: number
  readonly outputTokens: number
}

export interface AppTuringMachineActivitySnapshot {
  readonly months: number
  readonly startDate: string
  readonly endDate: string
  readonly days: readonly AppTuringMachineActivityDay[]
}

export interface AppLeaderboardEntry {
  readonly userId: string
  readonly name: string
  readonly score: number
  readonly rank: number
  readonly breakdown?: Readonly<Record<string, number>>
}

export interface AppLeaderboardList {
  readonly top: readonly AppLeaderboardEntry[]
  readonly user: AppLeaderboardEntry | null
}

export interface AppLeaderboardSnapshot {
  readonly algorithm: {
    readonly overall: {
      readonly label: string
      readonly formula: string
      readonly maxScore: number
      readonly caps: {
        readonly outputTokens: number
        readonly contribution: number
        readonly github: number
      }
      readonly notes: readonly string[]
    }
    readonly metrics: Readonly<Record<string, { readonly label: string; readonly formula: string; readonly notes: readonly string[] }>>
  }
  readonly overall: AppLeaderboardList
  readonly tokens: AppLeaderboardList
  readonly contribution: AppLeaderboardList
  readonly github: AppLeaderboardList
}

export interface AppGithubRepoSyncResult {
  readonly ok: true
  readonly mode: 'create' | 'update'
  readonly username: string
  readonly publicRepoCount: number
  readonly totalStars: number
  readonly totalForks: number
  readonly activeRepoCount: number
  readonly syncedAt: string
}

export interface AppBillingSessionResponse {
  readonly url: string
  readonly sessionId?: string
  readonly tierKey?: string
  readonly billingCycle?: 'monthly' | 'yearly'
}

export interface AppBillingCheckoutReconcileResponse {
  readonly synced: boolean
  readonly checkoutSessionId: string
  readonly paymentId?: string
  readonly paymentStatus?: string | null
  readonly subscriptionId?: string
  readonly subscriptionStatus?: string
  readonly tierKey?: string
  readonly billingCycle?: 'monthly' | 'yearly'
  readonly reason?: string
}

export interface AppPublicSubscriptionTier {
  readonly key: string
  readonly name: string
  readonly descriptionMarkdown: string | null
  readonly pricing: {
    readonly monthly: {
      readonly originalCents: number
      readonly discountedCents: number | null
      readonly finalCents: number
      readonly discountPercent: number
      readonly billingCycle: 'monthly'
    }
    readonly yearly: {
      readonly originalCents: number
      readonly discountedCents: number | null
      readonly finalCents: number
      readonly discountPercent: number
      readonly billingCycle: 'yearly'
    }
  }
  readonly limits: {
    readonly turingMachineQuotaUsdCents: number
  }
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'message' in payload &&
    Array.isArray(payload.message)
  ) {
    const messages = payload.message.filter((value): value is string => typeof value === 'string')
    if (messages.length > 0) {
      return messages.join(', ')
    }
  }

  if (
    typeof payload === 'object' &&
    payload !== null &&
    'message' in payload &&
    typeof payload.message === 'string'
  ) {
    return payload.message
  }

  return fallback
}

function isBillingSessionResponse(payload: unknown): payload is AppBillingSessionResponse {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'url' in payload &&
    typeof payload.url === 'string' &&
    payload.url.length > 0
  )
}

export async function fetchSubscriptionSnapshot(
  accessToken: string,
): Promise<AppSubscriptionSnapshot> {
  const url = resolveAuthUrl('/subscriptions/me')
  let response: Response

  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    })
  } catch {
    throw new Error('Unable to reach the subscription server. Check that the backend is running.')
  }

  const payload = (await response.json().catch(() => null)) as
    | AppSubscriptionSnapshot
    | { message?: string | string[] }
    | null
  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to load subscription details.'))
  }

  if (!payload) {
    throw new Error('Subscription server returned an empty response.')
  }

  return payload as AppSubscriptionSnapshot
}

export async function fetchTuringMachineActivity(
  accessToken: string,
  months = 4,
): Promise<AppTuringMachineActivitySnapshot> {
  const url = resolveAuthUrl(`/subscriptions/me/turing-machine/activity?months=${String(months)}`)
  let response: Response

  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    })
  } catch {
    throw new Error(
      'Unable to reach the Turing Machine activity server. Check that the backend is running.',
    )
  }

  const payload = (await response.json().catch(() => null)) as
    | AppTuringMachineActivitySnapshot
    | { message?: string | string[] }
    | null
  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to load Turing Machine activity.'))
  }

  if (!payload) {
    throw new Error('Turing Machine activity server returned an empty response.')
  }

  return payload as AppTuringMachineActivitySnapshot
}

export async function fetchTuringMachineLeaderboard(
  accessToken: string,
): Promise<AppLeaderboardSnapshot> {
  const url = resolveAuthUrl('/subscriptions/turing-machine/leaderboard')
  let response: Response

  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    })
  } catch {
    throw new Error('Unable to reach the leaderboard server. Check that the backend is running.')
  }

  const payload = (await response.json().catch(() => null)) as
    | AppLeaderboardSnapshot
    | { message?: string | string[] }
    | null
  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to load leaderboard.'))
  }

  if (!payload) {
    throw new Error('Leaderboard server returned an empty response.')
  }

  return payload as AppLeaderboardSnapshot
}

export async function fetchBillingTierCatalog(): Promise<readonly AppPublicSubscriptionTier[]> {
  const url = resolveAuthUrl('/subscription-tiers')
  let response: Response

  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })
  } catch {
    throw new Error('Unable to reach the billing catalog. Check that the backend is running.')
  }

  const payload = (await response.json().catch(() => null)) as
    | { tiers?: readonly AppPublicSubscriptionTier[]; message?: string | string[] }
    | null
  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to load billing plans.'))
  }

  if (!payload || !Array.isArray(payload.tiers)) {
    throw new Error('Billing catalog returned an invalid response.')
  }

  return payload.tiers
}

async function createBillingSession(
  accessToken: string,
  path: '/subscriptions/me/billing/checkout' | '/subscriptions/me/billing/portal',
  body?: Record<string, unknown>,
): Promise<AppBillingSessionResponse> {
  const url = resolveAuthUrl(path)
  let response: Response

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body ?? {}),
    })
  } catch {
    throw new Error('Unable to reach the billing server. Check that the backend is running.')
  }

  const payload = (await response.json().catch(() => null)) as
    | AppBillingSessionResponse
    | { message?: string | string[] }
    | null
  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to start billing.'))
  }

  if (!isBillingSessionResponse(payload)) {
    throw new Error('Billing server returned an invalid session response.')
  }

  return payload
}

export async function createBillingCheckoutSession(
  accessToken: string,
  input?: {
    readonly tierKey?: string
    readonly billingCycle?: 'monthly' | 'yearly'
  },
): Promise<AppBillingSessionResponse> {
  return createBillingSession(accessToken, '/subscriptions/me/billing/checkout', input)
}

export async function createBillingPortalSession(
  accessToken: string,
): Promise<AppBillingSessionResponse> {
  return createBillingSession(accessToken, '/subscriptions/me/billing/portal')
}

export async function reconcileBillingCheckoutSession(
  accessToken: string,
  checkoutSessionId: string,
): Promise<AppBillingCheckoutReconcileResponse> {
  const url = resolveAuthUrl('/subscriptions/me/billing/reconcile-checkout')
  let response: Response

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ checkoutSessionId }),
    })
  } catch {
    throw new Error('Unable to reach the billing server. Check that the backend is running.')
  }

  const payload = (await response.json().catch(() => null)) as
    | AppBillingCheckoutReconcileResponse
    | { message?: string | string[] }
    | null
  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to refresh billing status.'))
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    !('synced' in payload) ||
    typeof payload.synced !== 'boolean' ||
    !('checkoutSessionId' in payload) ||
    typeof payload.checkoutSessionId !== 'string'
  ) {
    throw new Error('Billing server returned an invalid reconciliation response.')
  }

  return payload as AppBillingCheckoutReconcileResponse
}

async function writeGithubRepoStats(
  accessToken: string,
  method: 'POST' | 'PUT',
  snapshot: GithubRepoStatsSnapshot,
): Promise<AppGithubRepoSyncResult> {
  const url = resolveAuthUrl('/subscriptions/me/turing-machine/github-stats')
  let response: Response

  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: snapshot.username,
        repos: snapshot.repos,
      }),
    })
  } catch {
    throw new Error('Unable to reach the GitHub sync server. Check that the backend is running.')
  }

  const payload = (await response.json().catch(() => null)) as
    | AppGithubRepoSyncResult
    | { message?: string | string[] }
    | null

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to sync GitHub repo stats.'))
  }

  if (!payload) {
    throw new Error('GitHub sync server returned an empty response.')
  }

  return payload as AppGithubRepoSyncResult
}

export async function createGithubRepoStats(
  accessToken: string,
  snapshot: GithubRepoStatsSnapshot,
): Promise<AppGithubRepoSyncResult> {
  return writeGithubRepoStats(accessToken, 'POST', snapshot)
}

export async function updateGithubRepoStats(
  accessToken: string,
  snapshot: GithubRepoStatsSnapshot,
): Promise<AppGithubRepoSyncResult> {
  return writeGithubRepoStats(accessToken, 'PUT', snapshot)
}
