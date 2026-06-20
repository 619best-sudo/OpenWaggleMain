import { CreditCard, ExternalLink, Gauge, LogOut } from 'lucide-react'
import { useMemo } from 'react'
import { useAppAuth } from '@/features/auth/state/app-auth-store'
import { Button } from '@/shared/ui/Button'

const ACCOUNT_WEBSITE_URL = 'https://account.turing.app'

const PLACEHOLDER_SUBSCRIPTION = {
  plan: 'Pro',
  cycle: 'Monthly billing',
  renewalLabel: 'Renews on 1 Jul 2026',
  seatsLabel: '1 of 3 seats used',
}

const PLACEHOLDER_USAGE = {
  totalBudget: '$120',
  consumed: '$72',
  left: '$48',
  periodLabel: 'Current monthly usage',
  consumedPercent: 60,
} as const

function initialsFromName(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)

  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || 'TU'
}

export function ProfileSection() {
  const { user, signOut } = useAppAuth()

  const profile = useMemo(() => {
    return {
      name: user?.name?.trim() || 'Turing User',
      email: user?.email?.trim() || 'you@example.com',
      initials: initialsFromName(user?.name ?? ''),
    }
  }, [user])

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-text-primary">Profile</h2>
        <p className="max-w-[720px] text-[13px] leading-6 text-text-tertiary">
          Review your account details, subscription, usage, and quick access to your account
          website.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <section className="space-y-6">
          <div className="rounded-2xl border border-border bg-bg-secondary p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-info/12 text-[20px] font-bold text-info">
                  {profile.initials}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[18px] font-semibold text-text-primary">{profile.name}</h3>
                    <span className="rounded-full border border-success/25 bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-success">
                      Active
                    </span>
                  </div>
                  <p className="text-[13px] text-text-secondary">{profile.email}</p>
                  <p className="text-[12px] text-text-muted">Signed in on this device</p>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => window.open(ACCOUNT_WEBSITE_URL, '_blank', 'noopener,noreferrer')}
                  className="h-9 bg-bg-tertiary text-text-secondary hover:bg-bg-hover"
                >
                  <ExternalLink className="size-3.5" />
                  My account website
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={signOut}
                  className="h-9"
                >
                  <LogOut className="size-3.5" />
                  Logout
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-bg-secondary p-6">
            <div className="mb-4 flex items-start gap-3">
              <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent">
                <CreditCard className="size-4.5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-[16px] font-semibold text-text-primary">Subscription</h3>
                <p className="text-[13px] text-text-tertiary">Your current plan and renewal cycle.</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-bg px-4 py-4">
                <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-text-muted">
                  Current plan
                </p>
                <p className="mt-2 text-[20px] font-semibold text-text-primary">
                  {PLACEHOLDER_SUBSCRIPTION.plan}
                </p>
                <p className="mt-1 text-[13px] text-text-secondary">
                  {PLACEHOLDER_SUBSCRIPTION.cycle}
                </p>
              </div>

              <div className="rounded-xl border border-border bg-bg px-4 py-4">
                <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-text-muted">
                  Renewal
                </p>
                <p className="mt-2 text-[15px] font-semibold text-text-primary">
                  {PLACEHOLDER_SUBSCRIPTION.renewalLabel}
                </p>
                <p className="mt-1 text-[13px] text-text-secondary">
                  {PLACEHOLDER_SUBSCRIPTION.seatsLabel}
                </p>
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-border bg-bg-secondary p-6">
            <div className="mb-4 flex items-start gap-3">
              <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-info/12 text-info">
                <Gauge className="size-4.5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-[16px] font-semibold text-text-primary">Usage</h3>
                <p className="text-[13px] text-text-tertiary">{PLACEHOLDER_USAGE.periodLabel}</p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-bg px-5 py-5">
              <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-text-muted">
                Total budget
              </p>
              <p className="mt-2 text-[28px] font-semibold tracking-[-0.03em] text-text-primary">
                {PLACEHOLDER_USAGE.totalBudget}
              </p>

              <div className="mt-5">
                <div className="flex items-center justify-between text-[12px] text-text-muted">
                  <span>Consumed</span>
                  <span>{PLACEHOLDER_USAGE.consumedPercent}% used</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg-tertiary">
                  <div
                    className="h-full rounded-full bg-info transition-[width]"
                    style={{ width: `${String(PLACEHOLDER_USAGE.consumedPercent)}%` }}
                  />
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-bg-secondary px-4 py-4">
                  <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-text-muted">
                    Consumed
                  </p>
                  <p className="mt-2 text-[22px] font-semibold text-text-primary">
                    {PLACEHOLDER_USAGE.consumed}
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-bg-secondary px-4 py-4">
                  <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-text-muted">
                    Left
                  </p>
                  <p className="mt-2 text-[22px] font-semibold text-text-primary">
                    {PLACEHOLDER_USAGE.left}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
