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
