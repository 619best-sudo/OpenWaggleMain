import { env } from '@/env'
import { DEFAULT_SUBSCRIPTION_PLAN_TIER, normalizeSubscriptionTier } from './subscription-plan'

export interface AppAuthUser {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly isSubscribed: boolean
  readonly subscriptionTier: string
  readonly accessToken: string
  readonly refreshToken: string
}

export interface LoginWithPasswordInput {
  readonly email: string
  readonly password: string
}

export interface SignupWithPasswordInput {
  readonly name: string
  readonly email: string
  readonly password: string
}

export interface GoogleAuthInput {
  readonly idToken: string
}

interface GreatxAuthResponse {
  readonly user: {
    readonly id: string
    readonly email: string | null
    readonly displayName: string | null
    readonly isSubscribed?: boolean | null
    readonly subscriptionTier?: string | null
  }
  readonly tokens: {
    readonly accessToken: string
    readonly refreshToken: string
  }
}

interface LogoutInput {
  readonly refreshToken: string
}

interface RefreshSessionInput {
  readonly refreshToken: string
  readonly fallbackName: string
  readonly fallbackEmail: string
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function inferDisplayName(email: string) {
  const localPart = normalizeEmail(email).split('@')[0] ?? 'Turing Machine User'
  const words = localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))

  return words.join(' ') || 'Turing Machine User'
}

export function getAuthBaseUrl() {
  if (env.appAuthBaseUrl) {
    return env.appAuthBaseUrl
  }

  throw new Error('Auth backend is not configured. Set VITE_APP_AUTH_BASE_URL to continue.')
}

export function resolveAuthUrl(pathname: string) {
  return new URL(pathname, `${getAuthBaseUrl()}/`).toString()
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

async function postJson<TResponse>(pathname: string, body: Record<string, unknown>) {
  const url = resolveAuthUrl(pathname)
  let response: Response

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('Unable to reach the auth server. Check that the backend is running.')
  }

  const payload = (await response.json().catch(() => null)) as
    | TResponse
    | { message?: string | string[] }
    | null
  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Authentication request failed.'))
  }

  if (!payload) {
    throw new Error('Auth server returned an empty response.')
  }

  return payload as TResponse
}

function toAppAuthUser(
  response: GreatxAuthResponse,
  fallbackName: string,
  fallbackEmail: string,
): AppAuthUser {
  const email = response.user.email
    ? normalizeEmail(response.user.email)
    : normalizeEmail(fallbackEmail)
  const displayName =
    response.user.displayName?.trim() || fallbackName.trim() || inferDisplayName(email)

  return {
    id: response.user.id,
    name: displayName,
    email,
    isSubscribed: response.user.isSubscribed ?? false,
    subscriptionTier: normalizeSubscriptionTier(
      response.user.subscriptionTier ?? DEFAULT_SUBSCRIPTION_PLAN_TIER,
    ),
    accessToken: response.tokens.accessToken,
    refreshToken: response.tokens.refreshToken,
  }
}

export async function loginWithPassword({
  email,
  password,
}: LoginWithPasswordInput): Promise<AppAuthUser> {
  const normalizedEmail = normalizeEmail(email)
  const response = await postJson<GreatxAuthResponse>('/auth/email', {
    email: normalizedEmail,
    password,
  })

  return toAppAuthUser(response, inferDisplayName(normalizedEmail), normalizedEmail)
}

export async function signupWithPassword({
  name,
  email,
  password,
}: SignupWithPasswordInput): Promise<AppAuthUser> {
  const normalizedEmail = normalizeEmail(email)
  const trimmedName = name.trim()
  const response = await postJson<GreatxAuthResponse>('/auth/email', {
    email: normalizedEmail,
    password,
  })

  return toAppAuthUser(response, trimmedName, normalizedEmail)
}

export async function googleAuthWithIdToken({ idToken }: GoogleAuthInput): Promise<AppAuthUser> {
  const response = await postJson<GreatxAuthResponse>('/auth/google', {
    idToken,
  })

  const fallbackEmail = response.user.email
    ? normalizeEmail(response.user.email)
    : 'google-user@turingmachine.local'
  const fallbackName = response.user.displayName?.trim() || inferDisplayName(fallbackEmail)
  return toAppAuthUser(response, fallbackName, fallbackEmail)
}

export async function refreshSession({
  refreshToken,
  fallbackName,
  fallbackEmail,
}: RefreshSessionInput): Promise<AppAuthUser> {
  const normalizedEmail = normalizeEmail(fallbackEmail)
  const response = await postJson<GreatxAuthResponse>('/auth/refresh', {
    refreshToken,
  })

  return toAppAuthUser(response, fallbackName, normalizedEmail)
}

export async function logoutFromBackend({ refreshToken }: LogoutInput): Promise<void> {
  await postJson<{ readonly ok: true }>('/auth/logout', { refreshToken })
}
