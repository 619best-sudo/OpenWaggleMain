import authIllustration from '../../../../../assets/authIllustration.png'
import appLogo from '../../../../../assets/new-logo.png'
import { ArrowRight, UserPlus } from 'lucide-react'
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
    <div className="relative flex size-full overflow-hidden bg-[#dcdcdc] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-10%] top-[-16%] size-[26rem] rounded-full bg-white/12 blur-3xl" />
        <div className="absolute bottom-[-20%] right-[-8%] size-[24rem] rounded-full bg-black/25 blur-3xl" />
      </div>

      <div className="relative size-full">
        <div className="grid size-full overflow-hidden bg-[#050608] lg:grid-cols-[1.08fr_0.92fr]">
          <section className="relative hidden min-h-0 overflow-hidden lg:flex">
            <img
              src={authIllustration}
              alt="OpenWaggle authentication illustration"
              className="absolute inset-0 size-full object-cover opacity-30 mix-blend-screen"
            />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_38%),linear-gradient(180deg,rgba(7,8,12,0.5)_0%,rgba(5,6,8,0.88)_55%,rgba(5,6,8,0.98)_100%)]" />
            <div className="relative flex size-full items-center px-10 py-10 xl:px-12 xl:py-12">
              <div className="flex w-full max-w-[32rem] min-h-[31rem] flex-col justify-end">
                <div className="space-y-5">
                  <div className="flex items-center gap-3">
                    <div className="flex size-12 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black">
                      <img src={appLogo} alt="Turing Machine logo" className="size-9 object-contain" />
                    </div>
                    <div>
                      <p className="text-[18px] font-semibold tracking-[-0.02em] text-white sm:text-[20px]">
                        Turing Machine
                      </p>
                    </div>
                  </div>

                  <div className="max-w-md space-y-3">
                    <h1 className="text-4xl font-semibold tracking-[-0.04em] text-white xl:text-[2.75rem]">
                      Build with a calmer, more secure workspace.
                    </h1>
                    <p className="text-[14px] leading-6 text-white/64 xl:text-[15px]">
                      Sign in to sync your provider token, keep project sessions attached, and jump back into
                      the same focused environment across runs.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="relative flex min-h-0 items-center justify-center bg-[linear-gradient(180deg,rgba(8,9,11,0.95)_0%,rgba(5,6,8,1)_100%)] px-5 py-8 sm:px-8 lg:px-10 xl:px-12">
            <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-24 bg-gradient-to-r from-white/4 to-transparent lg:block" />

            <div className="w-full max-w-[27rem]">
              <div className="mb-8 flex items-center gap-3 lg:hidden">
                <div className="flex size-11 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/6">
                  <img src={appLogo} alt="Turing Machine logo" className="size-8 object-contain" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Turing Machine</p>
                  <p className="text-[12px] text-white/48">Desktop collaboration workspace</p>
                </div>
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-white/[0.025] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.28)] backdrop-blur-sm sm:p-8">
                <div className="mb-8 space-y-4">
                  <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1">
                    <button
                      type="button"
                      onClick={() => switchView('login')}
                      className={cn(
                        'rounded-full px-4 py-2 text-[13px] font-medium transition-colors',
                        isLoginView ? 'bg-white text-black' : 'text-white/56 hover:text-white',
                      )}
                    >
                      Login
                    </button>
                    <button
                      type="button"
                      onClick={() => switchView('signup')}
                      className={cn(
                        'rounded-full px-4 py-2 text-[13px] font-medium transition-colors',
                        !isLoginView ? 'bg-white text-black' : 'text-white/56 hover:text-white',
                      )}
                    >
                      Register
                    </button>
                  </div>

                  <div>
                    <h2 className="text-[2rem] font-semibold tracking-[-0.04em] text-white">
                      {isLoginView ? 'Register or login' : 'Create your account'}
                    </h2>
                    <p className="mt-3 max-w-sm text-[14px] leading-6 text-white/56">
                      {isLoginView
                        ? 'Continue with the email and password linked to your Turing Machine workspace.'
                        : 'Set up your account once, then use it to keep project sessions and provider access in sync.'}
                    </p>
                  </div>
                </div>

                {visibleError ? (
                  <div
                    role="alert"
                    className="mb-5 rounded-2xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-[13px] text-red-100"
                  >
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
                      <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-white/44">
                        Email
                      </span>
                      <TextInput
                        type="email"
                        autoComplete="email"
                        placeholder="name@company.com"
                        value={loginForm.email}
                        onChange={(event) => setLoginForm((state) => ({ ...state, email: event.target.value }))}
                        disabled={isSubmitting}
                        className="rounded-2xl border-white/10 bg-white/5 px-4 py-3 text-[14px] text-white placeholder:text-white/28 focus:border-white/30"
                      />
                    </label>
                    <label className="block space-y-2">
                      <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-white/44">
                        Password
                      </span>
                      <TextInput
                        type="password"
                        autoComplete="current-password"
                        placeholder="Enter your password"
                        value={loginForm.password}
                        onChange={(event) =>
                          setLoginForm((state) => ({ ...state, password: event.target.value }))
                        }
                        disabled={isSubmitting}
                        className="rounded-2xl border-white/10 bg-white/5 px-4 py-3 text-[14px] text-white placeholder:text-white/28 focus:border-white/30"
                      />
                    </label>

                    <div className="flex items-center justify-between gap-4 text-[12px] text-white/44">
                      <span>Your provider token syncs after sign-in.</span>
                      <span>Min. 6 characters</span>
                    </div>

                    <Button
                      variant="unstyled"
                      fullWidth
                      type="submit"
                      disabled={isSubmitting}
                      className="mt-2 flex h-12 items-center justify-center rounded-2xl bg-white text-[14px] font-semibold text-black transition-transform duration-200 hover:scale-[0.99] disabled:opacity-50"
                    >
                      {isSubmitting ? 'Signing In...' : 'Sign In'}
                    </Button>

                    <p className="text-[13px] text-white/42">
                      Need an account?{' '}
                      <button
                        type="button"
                        onClick={() => switchView('signup')}
                        className="font-medium text-white transition-colors hover:text-white/80"
                      >
                        Register now
                      </button>
                    </p>
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
                      <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-white/44">
                        Full name
                      </span>
                      <TextInput
                        autoComplete="name"
                        placeholder="Alex Johnson"
                        value={signupForm.name}
                        onChange={(event) => setSignupForm((state) => ({ ...state, name: event.target.value }))}
                        disabled={isSubmitting}
                        className="rounded-2xl border-white/10 bg-white/5 px-4 py-3 text-[14px] text-white placeholder:text-white/28 focus:border-white/30"
                      />
                    </label>
                    <label className="block space-y-2">
                      <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-white/44">
                        Email
                      </span>
                      <TextInput
                        type="email"
                        autoComplete="email"
                        placeholder="name@company.com"
                        value={signupForm.email}
                        onChange={(event) =>
                          setSignupForm((state) => ({ ...state, email: event.target.value }))
                        }
                        disabled={isSubmitting}
                        className="rounded-2xl border-white/10 bg-white/5 px-4 py-3 text-[14px] text-white placeholder:text-white/28 focus:border-white/30"
                      />
                    </label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block space-y-2">
                        <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-white/44">
                          Password
                        </span>
                        <TextInput
                          type="password"
                          autoComplete="new-password"
                          placeholder="Create password"
                          value={signupForm.password}
                          onChange={(event) =>
                            setSignupForm((state) => ({ ...state, password: event.target.value }))
                          }
                          disabled={isSubmitting}
                          className="rounded-2xl border-white/10 bg-white/5 px-4 py-3 text-[14px] text-white placeholder:text-white/28 focus:border-white/30"
                        />
                      </label>
                      <label className="block space-y-2">
                        <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-white/44">
                          Confirm
                        </span>
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
                          className="rounded-2xl border-white/10 bg-white/5 px-4 py-3 text-[14px] text-white placeholder:text-white/28 focus:border-white/30"
                        />
                      </label>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[12px] leading-5 text-white/46">
                      Create your account once and the app keeps future sessions tied to the same workspace.
                    </div>

                    <Button
                      variant="unstyled"
                      fullWidth
                      type="submit"
                      disabled={isSubmitting}
                      className="mt-2 flex h-12 items-center justify-center gap-2 rounded-2xl bg-white text-[14px] font-semibold text-black transition-transform duration-200 hover:scale-[0.99] disabled:opacity-50"
                    >
                      <UserPlus className="size-4" />
                      {isSubmitting ? 'Creating Account...' : 'Create Account'}
                    </Button>

                    <p className="flex items-center gap-1 text-[13px] text-white/42">
                      Already registered?
                      <button
                        type="button"
                        onClick={() => switchView('login')}
                        className="inline-flex items-center gap-1 font-medium text-white transition-colors hover:text-white/80"
                      >
                        Sign in
                        <ArrowRight className="size-3.5" />
                      </button>
                    </p>
                  </form>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
