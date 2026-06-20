import { create } from 'zustand'
import {
  loginWithPassword,
  signupWithPassword,
  type AppAuthUser,
  type LoginWithPasswordInput,
  type SignupWithPasswordInput,
} from '@/features/auth/lib/auth-client'

const STORAGE_KEY = 'openwaggle.app-auth.user'

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
  signOut: () => void
}

function readStoredUser(): AppAuthUser | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AppAuthUser>
    if (typeof parsed.name !== 'string' || typeof parsed.email !== 'string') return null
    return { name: parsed.name, email: parsed.email }
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

const initialUser = readStoredUser()

export const useAppAuthStore = create<AppAuthState>((set) => ({
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
      persistUser(user)
      set({ status: 'authenticated', user, error: null })
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
      persistUser(user)
      set({ status: 'authenticated', user, error: null })
    } catch (error) {
      set({
        status: 'signed_out',
        error: error instanceof Error ? error.message : 'Unable to create your account right now.',
      })
    }
  },

  signOut() {
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
