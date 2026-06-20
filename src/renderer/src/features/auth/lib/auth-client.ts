export interface AppAuthUser {
  readonly name: string
  readonly email: string
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

const AUTH_DELAY_MS = 700

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function inferDisplayName(email: string) {
  const localPart = normalizeEmail(email).split('@')[0] ?? 'OpenWaggle User'
  const words = localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))

  return words.join(' ') || 'OpenWaggle User'
}

// Placeholder auth request until the real backend contract is wired in.
export async function loginWithPassword({
  email,
}: LoginWithPasswordInput): Promise<AppAuthUser> {
  await wait(AUTH_DELAY_MS)

  return {
    email: normalizeEmail(email),
    name: inferDisplayName(email),
  }
}

// Placeholder auth request until the real backend contract is wired in.
export async function signupWithPassword({
  name,
  email,
}: SignupWithPasswordInput): Promise<AppAuthUser> {
  await wait(AUTH_DELAY_MS)

  return {
    email: normalizeEmail(email),
    name: name.trim(),
  }
}
