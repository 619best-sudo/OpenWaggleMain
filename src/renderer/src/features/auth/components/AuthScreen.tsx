import { ArrowRight, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useAppAuth } from '@/features/auth/state/app-auth-store'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { TextInput } from '@/shared/ui/TextInput'
import authIllustration from '../../../../../assets/authIllustration.png'
import appLogo from '../../../../../assets/new-logo.png'

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
  const { view, status, error, setView, clearError, signIn, signInWithGoogle, signUp } =
    useAppAuth()
  const [loginForm, setLoginForm] = useState<LoginFormState>(DEFAULT_LOGIN_FORM)
  const [signupForm, setSignupForm] = useState<SignupFormState>(DEFAULT_SIGNUP_FORM)
  const [formError, setFormError] = useState<string | null>(null)

  const isSubmitting = status === 'submitting'
  const visibleError = formError ?? error
  const isLoginView = view === 'login'

  function GoogleGlyph() {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 shrink-0">
        <path
          fill="#EA4335"
          d="M12.24 10.285V14.4h5.88c-.258 1.324-1.547 3.882-5.88 3.882-3.54 0-6.425-2.93-6.425-6.542s2.885-6.542 6.425-6.542c2.015 0 3.366.86 4.14 1.598l2.82-2.734C17.388 2.373 15.072 1.4 12.24 1.4 6.766 1.4 2.33 5.836 2.33 11.31s4.436 9.91 9.91 9.91c5.72 0 9.514-4.02 9.514-9.682 0-.65-.071-1.149-.16-1.653H12.24Z"
        />
        <path
          fill="#34A853"
          d="M2.33 11.31c0 1.766.462 3.425 1.27 4.862l3.913-3.042a6.01 6.01 0 0 1 0-3.64L3.6 6.448A9.875 9.875 0 0 0 2.33 11.31Z"
        />
        <path
          fill="#FBBC05"
          d="M12.24 21.22c2.832 0 5.148-.93 6.864-2.528l-3.34-2.59c-.895.622-2.033.997-3.524.997-2.815 0-5.2-1.9-6.05-4.46L2.28 15.66c1.703 3.382 5.208 5.56 9.96 5.56Z"
        />
        <path
          fill="#4285F4"
          d="M19.104 18.692c1.924-1.774 3.03-4.386 3.03-7.154 0-.651-.071-1.15-.16-1.654H12.24V14.4h5.88c-.282 1.45-1.15 2.675-2.356 3.5l3.34 2.591Z"
        />
      </svg>
    )
  }

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
              alt="Turing Machine authentication illustration"
              className="absolute inset-0 size-full object-cover opacity-30 mix-blend-screen"
            />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_38%),linear-gradient(180deg,rgba(7,8,12,0.5)_0%,rgba(5,6,8,0.88)_55%,rgba(5,6,8,0.98)_100%)]" />
            <div className="relative flex size-full items-center px-10 py-10 xl:px-12 xl:py-12">
              <div className="flex w-full max-w-[32rem] min-h-[31rem] flex-col justify-end">
                <div className="space-y-5">
                  <div className="flex items-center gap-3">
                    <div className="flex size-12 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black">
                      <img
                        src={appLogo}
                        alt="Turing Machine logo"
                        className="size-9 object-contain"
                      />
                    </div>
                    <div>
                      <p className="text-[18px] font-semibold tracking-[-0.02em] text-white sm:text-[20px]">
                        Turing Machine
                      </p>
                    </div>
                  </div>

                  <div className="max-w-md space-y-3">
                    <h1 className="text-4xl font-semibold tracking-[-0.04em] text-white xl:text-[2.75rem]">
                      The universal machine for code.
                    </h1>
                    <p className="text-[14px] leading-6 text-white/64 xl:text-[15px]">
                      Dedicated to Alan Turing's legacy. A workspace designed for the logic and
                      computation of modern software.
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
                  <p className="text-[12px] text-white/48">Universal computation for code</p>
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
                      {isLoginView ? 'Welcome back' : 'Create account'}
                    </h2>
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

                <div className="mb-6 space-y-3">
                  <button
                    type="button"
                    onClick={() => {
                      setFormError(null)
                      clearError()
                      void signInWithGoogle()
                    }}
                    disabled={isSubmitting}
                    className={cn(
                      'relative flex h-12 w-full items-center justify-center rounded-2xl border border-white/12 bg-white/5 px-4 text-[14px] font-semibold tracking-[-0.01em] text-white transition-colors shadow-[0_10px_24px_rgba(0,0,0,0.16)]',
                      isSubmitting ? 'cursor-wait opacity-70' : 'hover:bg-white/[0.075]',
                    )}
                  >
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">
                      <GoogleGlyph />
                    </span>
                    <span>Continue with Google</span>
                  </button>

                  <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-white/28">
                    <div className="h-px flex-1 bg-white/10" />
                    <span>Or continue with email</span>
                    <div className="h-px flex-1 bg-white/10" />
                  </div>
                </div>

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
                        onChange={(event) =>
                          setLoginForm((state) => ({ ...state, email: event.target.value }))
                        }
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
                        onChange={(event) =>
                          setSignupForm((state) => ({ ...state, name: event.target.value }))
                        }
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
