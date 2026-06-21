import authIllustration from '../../../../../assets/authIllustration.png'
import { Sparkles, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useAppAuth } from '@/features/auth/state/app-auth-store'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { TextInput } from '@/shared/ui/TextInput'

interface LoginFormState {
  readonly email: string
  readonly password: string
}

interface SignupFormState {
  readonly name: string
  readonly email: string
  readonly password: string
  readonly confirmPassword: string
}

const DEFAULT_LOGIN_FORM: LoginFormState = {
  email: '',
  password: '',
}

const DEFAULT_SIGNUP_FORM: SignupFormState = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function AuthScreen() {
  const { view, status, error, setView, clearError, signIn, signUp } = useAppAuth()
  const [loginForm, setLoginForm] = useState<LoginFormState>(DEFAULT_LOGIN_FORM)
  const [signupForm, setSignupForm] = useState<SignupFormState>(DEFAULT_SIGNUP_FORM)
  const [formError, setFormError] = useState<string | null>(null)

  const isSubmitting = status === 'submitting'
  const visibleError = formError ?? error
  const isLoginView = view === 'login'

  function switchView(nextView: 'login' | 'signup') {
    setFormError(null)
    clearError()
    setView(nextView)
  }

  function validateLoginForm() {
    if (!EMAIL_PATTERN.test(loginForm.email.trim())) {
      return 'Enter a valid email address.'
    }
    if (loginForm.password.trim().length < 6) {
      return 'Password must be at least 6 characters.'
    }
    return null
  }

  function validateSignupForm() {
    if (signupForm.name.trim().length < 2) {
      return 'Name must be at least 2 characters.'
    }
    if (!EMAIL_PATTERN.test(signupForm.email.trim())) {
      return 'Enter a valid email address.'
    }
    if (signupForm.password.trim().length < 8) {
      return 'Password must be at least 8 characters.'
    }
    if (signupForm.password !== signupForm.confirmPassword) {
      return 'Passwords do not match.'
    }
    return null
  }

  async function handleLoginSubmit() {
    const nextError = validateLoginForm()
    setFormError(nextError)
    clearError()
    if (nextError) return
    await signIn(loginForm)
  }

  async function handleSignupSubmit() {
    const nextError = validateSignupForm()
    setFormError(nextError)
    clearError()
    if (nextError) return
    await signUp({
      name: signupForm.name.trim(),
      email: signupForm.email.trim(),
      password: signupForm.password,
    })
  }

  return (
    <div className="relative flex size-full overflow-hidden bg-[#efebe3]">
      <div className="pointer-events-none absolute inset-0 opacity-90">
        <div className="absolute left-[-8%] top-[-12%] size-[28rem] rounded-full bg-[#c8d4e4]/30 blur-3xl" />
        <div className="absolute bottom-[-16%] right-[-10%] size-[32rem] rounded-full bg-[#d7e0ec]/60 blur-3xl" />
      </div>

      <div className="relative grid size-full lg:grid-cols-2">
        <section className="relative hidden overflow-hidden lg:flex">
          <img
            src={authIllustration}
            alt="OpenWaggle authentication illustration"
            className="absolute inset-0 size-full object-cover"
          />
          <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-r from-transparent via-[#efebe3]/60 to-[#efebe3]" />
        </section>

        <section className="relative flex min-h-0 items-center justify-center bg-[linear-gradient(180deg,rgba(239,235,227,0.88)_0%,rgba(239,235,227,0.98)_100%)] p-6 sm:p-8 lg:p-10 xl:p-14">
          <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-40 bg-gradient-to-r from-[#efebe3] via-[#efebe3]/90 to-transparent lg:block" />
          <div className="flex min-h-[540px] w-full max-w-[30rem] flex-col justify-center rounded-2xl border border-[color:color-mix(in_srgb,var(--theme-dark-accent)_16%,transparent)] bg-[var(--theme-dark-tint)] p-8 shadow-[0_30px_80px_rgba(46,31,28,0.28)] backdrop-blur-md sm:p-10">
            <div className="mb-10 space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-secondary px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
                <Sparkles className="size-3.5 text-info" />
                Welcome Back
              </div>
              <div>
                <h2 className="text-3xl font-semibold tracking-[-0.03em] text-text-primary">
                  {isLoginView ? (
                    <>
                      Sign in to{' '}
                      <span className="bg-[linear-gradient(135deg,var(--color-info),color-mix(in_srgb,var(--color-accent)_72%,var(--color-info)))] bg-clip-text font-['Poppins'] text-4xl font-bold lowercase tracking-[-0.05em] text-transparent">
                        turing
                      </span>
                    </>
                  ) : (
                    <>
                      Create your{' '}
                      <span className="bg-[linear-gradient(135deg,var(--color-info),color-mix(in_srgb,var(--color-accent)_72%,var(--color-info)))] bg-clip-text font-['Poppins'] text-4xl font-bold lowercase tracking-[-0.05em] text-transparent">
                        turing
                      </span>{' '}
                      account
                    </>
                  )}
                </h2>
              </div>
            </div>

            <div className="mb-8 grid grid-cols-2 rounded-2xl border border-border bg-bg-secondary p-1">
              <button
                type="button"
                onClick={() => switchView('login')}
                className={cn(
                  'rounded-xl px-4 py-2.5 text-sm font-medium transition-colors',
                  isLoginView ? 'bg-info text-white shadow-sm' : 'text-text-secondary hover:text-text-primary',
                )}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => switchView('signup')}
                className={cn(
                  'rounded-xl px-4 py-2.5 text-sm font-medium transition-colors',
                  !isLoginView ? 'bg-info text-white shadow-sm' : 'text-text-secondary hover:text-text-primary',
                )}
              >
                Sign Up
              </button>
            </div>

            {visibleError ? (
              <div className="mb-5 rounded-2xl border border-error/25 bg-error/10 px-4 py-3 text-[13px] text-error">
                {visibleError}
              </div>
            ) : null}

            {isLoginView ? (
              <form
                className="space-y-5"
                onSubmit={(event) => {
                  event.preventDefault()
                  void handleLoginSubmit()
                }}
              >
                <label className="block space-y-2">
                  <span className="text-[12px] font-medium text-text-secondary">Email address</span>
                  <TextInput
                    type="email"
                    autoComplete="email"
                    placeholder="name@company.com"
                    value={loginForm.email}
                    onChange={(event) => setLoginForm((state) => ({ ...state, email: event.target.value }))}
                    disabled={isSubmitting}
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-[12px] font-medium text-text-secondary">Password</span>
                  <TextInput
                    type="password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={loginForm.password}
                    onChange={(event) =>
                      setLoginForm((state) => ({ ...state, password: event.target.value }))
                    }
                    disabled={isSubmitting}
                  />
                </label>
                <Button
                  variant="primary"
                  size="lg"
                  radius="lg"
                  fullWidth
                  type="submit"
                  disabled={isSubmitting}
                  className="mt-6"
                >
                  {isSubmitting ? 'Signing In...' : 'Sign In'}
                </Button>
              </form>
            ) : (
              <form
                className="space-y-5"
                onSubmit={(event) => {
                  event.preventDefault()
                  void handleSignupSubmit()
                }}
              >
                <label className="block space-y-2">
                  <span className="text-[12px] font-medium text-text-secondary">Full name</span>
                  <TextInput
                    autoComplete="name"
                    placeholder="Alex Johnson"
                    value={signupForm.name}
                    onChange={(event) => setSignupForm((state) => ({ ...state, name: event.target.value }))}
                    disabled={isSubmitting}
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-[12px] font-medium text-text-secondary">Email address</span>
                  <TextInput
                    type="email"
                    autoComplete="email"
                    placeholder="name@company.com"
                    value={signupForm.email}
                    onChange={(event) =>
                      setSignupForm((state) => ({ ...state, email: event.target.value }))
                    }
                    disabled={isSubmitting}
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-[12px] font-medium text-text-secondary">Password</span>
                    <TextInput
                      type="password"
                      autoComplete="new-password"
                      placeholder="Create password"
                      value={signupForm.password}
                      onChange={(event) =>
                        setSignupForm((state) => ({ ...state, password: event.target.value }))
                      }
                      disabled={isSubmitting}
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-[12px] font-medium text-text-secondary">Confirm password</span>
                    <TextInput
                      type="password"
                      autoComplete="new-password"
                      placeholder="Repeat password"
                      value={signupForm.confirmPassword}
                      onChange={(event) =>
                        setSignupForm((state) => ({
                          ...state,
                          confirmPassword: event.target.value,
                        }))
                      }
                      disabled={isSubmitting}
                    />
                  </label>
                </div>
                <Button
                  variant="primary"
                  size="lg"
                  radius="lg"
                  fullWidth
                  type="submit"
                  disabled={isSubmitting}
                  leftIcon={<UserPlus className="size-4" />}
                  className="mt-6"
                >
                  {isSubmitting ? 'Creating Account...' : 'Create Account'}
                </Button>
              </form>
            )}

          </div>
        </section>
      </div>
    </div>
  )
}
