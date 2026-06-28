import { CreditCard, ExternalLink, Gauge, LogOut } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { useAppAuth } from '@/features/auth/state/app-auth-store'
import { Button } from '@/shared/ui/Button'

const ACCOUNT_WEBSITE_URL = 'https://account.turing.app'

const PLACEHOLDER_SUBSCRIPTION = {
  plan: 'Pro',
  cycle: 'Monthly billing',
  renewalLabel: 'Renews on 1 Jul 2026',
}

const PLACEHOLDER_USAGE = {
  totalBudget: 120,
  periodLabel: 'Current monthly usage',
  joinedLabel: 'Since joining',
  daily: [
    { date: '2026-06-02', amount: 3 },
    { date: '2026-06-03', amount: 4 },
    { date: '2026-06-04', amount: 2 },
    { date: '2026-06-05', amount: 5 },
    { date: '2026-06-06', amount: 4 },
    { date: '2026-06-09', amount: 3 },
    { date: '2026-06-10', amount: 5 },
    { date: '2026-06-11', amount: 2 },
    { date: '2026-06-12', amount: 6 },
    { date: '2026-06-13', amount: 4 },
    { date: '2026-06-16', amount: 5 },
    { date: '2026-06-17', amount: 6 },
    { date: '2026-06-18', amount: 3 },
    { date: '2026-06-19', amount: 7 },
    { date: '2026-06-20', amount: 4 },
    { date: '2026-06-23', amount: 3 },
    { date: '2026-06-24', amount: 2 },
    { date: '2026-06-25', amount: 4 },
  ],
} as const

const HEATMAP_START = new Date(Date.UTC(2025, 6, 1))
const HEATMAP_END = new Date(Date.UTC(2026, 5, 28))
const MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })
const DAY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

interface UsageHeatmapCell {
  readonly key: string
  readonly amount: number
  readonly date: Date
  readonly label: string
  readonly isInRange: boolean
}

interface UsageHeatmapWeek {
  readonly key: string
  readonly monthLabel: string | null
  readonly cells: readonly UsageHeatmapCell[]
}

function toUtcDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addUtcDays(date: Date, days: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days))
}

function startOfUtcWeek(date: Date) {
  return addUtcDays(date, -date.getUTCDay())
}

function endOfUtcWeek(date: Date) {
  return addUtcDays(date, 6 - date.getUTCDay())
}

function heatmapLevel(amount: number, maxAmount: number) {
  if (amount <= 0) return 0
  const ratio = amount / maxAmount
  if (ratio <= 0.25) return 1
  if (ratio <= 0.5) return 2
  if (ratio <= 0.75) return 3
  return 4
}

function heatmapLevelClass(level: number) {
  switch (level) {
    case 1:
      return 'border-emerald-950/80 bg-emerald-950/70'
    case 2:
      return 'border-emerald-900/80 bg-emerald-900/85'
    case 3:
      return 'border-emerald-700/80 bg-emerald-600/75'
    case 4:
      return 'border-emerald-400/80 bg-emerald-400'
    default:
      return 'border-white/5 bg-white/[0.04]'
  }
}

function buildUsageHeatmap(
  start: Date,
  end: Date,
  usageMap: ReadonlyMap<string, number>,
): readonly UsageHeatmapWeek[] {
  const firstWeekStart = startOfUtcWeek(start)
  const lastWeekEnd = endOfUtcWeek(end)
  const weeks: UsageHeatmapWeek[] = []
  let previousMonth: number | null = null

  for (
    let weekStart = firstWeekStart;
    weekStart.getTime() <= lastWeekEnd.getTime();
    weekStart = addUtcDays(weekStart, 7)
  ) {
    const cells: UsageHeatmapCell[] = Array.from({ length: 7 }, (_, dayOffset) => {
      const date = addUtcDays(weekStart, dayOffset)
      const key = toUtcDateKey(date)
      const isInRange = date.getTime() >= start.getTime() && date.getTime() <= end.getTime()
      const amount = isInRange ? usageMap.get(key) ?? 0 : 0

      return {
        key,
        amount,
        date,
        label: DAY_FORMATTER.format(date),
        isInRange,
      }
    })

    const firstVisibleDay = cells.find((cell) => cell.isInRange)
    const nextMonth: number | null =
      firstVisibleDay === undefined ? previousMonth : firstVisibleDay.date.getUTCMonth()
    const monthLabel =
      firstVisibleDay !== undefined && nextMonth !== previousMonth
        ? MONTH_FORMATTER.format(firstVisibleDay.date)
        : null

    if (firstVisibleDay !== undefined) previousMonth = nextMonth

    weeks.push({
      key: toUtcDateKey(weekStart),
      monthLabel,
      cells,
    })
  }

  return weeks
}

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
  const [hoveredUsageKey, setHoveredUsageKey] = useState<string | null>(null)

  const profile = useMemo(() => {
    return {
      name: user?.name?.trim() || 'Turing User',
      email: user?.email?.trim() || 'you@example.com',
      initials: initialsFromName(user?.name ?? ''),
    }
  }, [user])

  const usage = useMemo(() => {
    const usageMap = new Map(PLACEHOLDER_USAGE.daily.map((day) => [day.date, day.amount]))
    const consumed = PLACEHOLDER_USAGE.daily.reduce((sum, day) => sum + day.amount, 0)
    const left = Math.max(PLACEHOLDER_USAGE.totalBudget - consumed, 0)
    const consumedPercent = Math.round((consumed / PLACEHOLDER_USAGE.totalBudget) * 100)
    const maxDay = PLACEHOLDER_USAGE.daily.reduce((best, day) =>
      day.amount > best.amount ? day : best,
    )
    const heatmap = buildUsageHeatmap(HEATMAP_START, HEATMAP_END, usageMap)
    const hoveredDay =
      hoveredUsageKey === null
        ? maxDay
        : PLACEHOLDER_USAGE.daily.find((day) => day.date === hoveredUsageKey) ?? maxDay

    return {
      usageMap,
      consumed,
      left,
      consumedPercent,
      maxDay,
      hoveredDay,
      maxAmount: Math.max(...PLACEHOLDER_USAGE.daily.map((day) => day.amount)),
      heatmap,
    }
  }, [hoveredUsageKey])

  return (
    <div className="w-full space-y-4">
      <div className="space-y-1">
        <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-text-primary">Profile</h2>
        <p className="max-w-[760px] text-[12px] leading-5 text-text-tertiary">
          Review your account details, subscription, usage, and quick access to your account
          website.
        </p>
      </div>

      <div className="space-y-3">
        <section className="rounded-xl border border-border bg-bg-secondary px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-info/12 text-[16px] font-bold text-info">
                {profile.initials}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-[16px] font-semibold text-text-primary">{profile.name}</h3>
                  <span className="rounded-full border border-success/25 bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-success">
                    Active
                  </span>
                </div>
                <p className="text-[12px] text-text-secondary">{profile.email}</p>
                <p className="text-[11px] text-text-muted">Signed in on this device</p>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.open(ACCOUNT_WEBSITE_URL, '_blank', 'noopener,noreferrer')}
                className="h-8 bg-bg-tertiary px-2.5 text-[12px] text-text-secondary hover:bg-bg-hover"
              >
                <ExternalLink className="size-3.5" />
                My account website
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={signOut}
                className="h-8 px-2.5 text-[12px]"
              >
                <LogOut className="size-3.5" />
                Logout
              </Button>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-bg-secondary px-4 py-4 sm:px-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent">
              <CreditCard className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="space-y-1.5">
                <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-text-muted">
                  Subscription
                </p>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 leading-none">
                  <h3 className="text-[22px] font-semibold tracking-[-0.03em] text-text-primary">
                    {PLACEHOLDER_SUBSCRIPTION.plan}
                  </h3>
                  <span className="translate-y-[-1px] text-[12px] text-text-secondary">
                    {PLACEHOLDER_SUBSCRIPTION.cycle}
                  </span>
                </div>
                <p className="text-[12px] text-text-tertiary">
                  {PLACEHOLDER_SUBSCRIPTION.renewalLabel}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-bg-secondary px-4 py-4 sm:px-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-info/12 text-info">
              <Gauge className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="space-y-1">
                <h3 className="text-[15px] font-semibold text-text-primary">Usage</h3>
                <p className="text-[12px] text-text-tertiary">{PLACEHOLDER_USAGE.periodLabel}</p>
              </div>

              <div className="mt-4 rounded-xl border border-border/80 bg-bg px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
                      Consumed
                    </p>
                    <div className="flex items-end gap-2">
                      <span className="text-[24px] font-semibold tracking-[-0.04em] text-text-primary">
                        ${String(usage.consumed)}
                      </span>
                      <span className="pb-0.5 text-[11px] text-text-muted">
                        of ${String(PLACEHOLDER_USAGE.totalBudget)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1 text-left sm:text-right">
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
                      Left
                    </p>
                    <p className="text-[20px] font-semibold tracking-[-0.03em] text-text-primary">
                      ${String(usage.left)}
                    </p>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex items-center justify-between text-[11px] text-text-muted">
                    <span>{PLACEHOLDER_USAGE.joinedLabel}</span>
                    <span>{String(usage.consumedPercent)}% used</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg-tertiary">
                    <div
                      className="h-full rounded-full bg-info transition-[width]"
                      style={{ width: `${String(usage.consumedPercent)}%` }}
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
                      Daily activity
                    </p>
                    <p className="mt-0.5 text-[11px] text-text-tertiary">
                      {hoveredUsageKey === null
                        ? `Most active: ${DAY_FORMATTER.format(new Date(`${usage.maxDay.date}T00:00:00Z`))} consumed $${String(usage.maxDay.amount)}`
                        : `${DAY_FORMATTER.format(new Date(`${usage.hoveredDay.date}T00:00:00Z`))} consumed $${String(usage.hoveredDay.amount)}`}
                    </p>
                  </div>
                  <p className="text-[11px] text-text-muted">Hover or focus a day for details</p>
                </div>

                <div className="mt-3 overflow-x-auto pb-1">
                  <div className="inline-flex min-w-full flex-col gap-2">
                    <div className="ml-8 flex gap-1">
                      {usage.heatmap.map((week) => (
                        <div
                          key={`${week.key}-label`}
                          className="flex w-4 items-start justify-start text-[10px] text-text-muted"
                        >
                          {week.monthLabel ?? ''}
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <div className="flex flex-col gap-1 text-[10px] text-text-muted">
                        {['', 'M', '', 'W', '', 'F', ''].map((label, index) => (
                          <span
                            key={`${label}-${String(index)}`}
                            className="flex h-4 w-4 items-center justify-start"
                          >
                            {label}
                          </span>
                        ))}
                      </div>

                      <div className="flex gap-1">
                        {usage.heatmap.map((week) => (
                          <div key={week.key} className="flex flex-col gap-1">
                            {week.cells.map((cell) => {
                              if (!cell.isInRange) {
                                return <span key={cell.key} className="size-4 rounded-[4px] opacity-0" />
                              }

                              const level = heatmapLevel(cell.amount, usage.maxAmount)
                              const isActive = cell.amount > 0
                              const isHovered = hoveredUsageKey === cell.key

                              return (
                                <button
                                  key={cell.key}
                                  type="button"
                                  aria-label={`${cell.label} consumed $${String(cell.amount)}`}
                                  title={`${cell.label}: $${String(cell.amount)} consumed`}
                                  onMouseEnter={() => setHoveredUsageKey(cell.key)}
                                  onMouseLeave={() => setHoveredUsageKey(null)}
                                  onFocus={() => setHoveredUsageKey(cell.key)}
                                  onBlur={() => setHoveredUsageKey(null)}
                                  className={cn(
                                    'size-4 rounded-[4px] border transition-[transform,background-color,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35',
                                    heatmapLevelClass(level),
                                    isActive && 'hover:-translate-y-px',
                                    isHovered && 'scale-110 border-white/70',
                                  )}
                                />
                              )
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-end gap-2 text-[10px] text-text-muted">
                  <span>Less</span>
                  {[0, 1, 2, 3, 4].map((level) => (
                    <span
                      key={`legend-${String(level)}`}
                      aria-hidden="true"
                      className={cn('size-4 rounded-[4px] border', heatmapLevelClass(level))}
                    />
                  ))}
                  <span>More</span>
                </div>
                <p className="mt-2 text-[10px] text-text-muted">
                  Activity is shown by day since joining. Darker cells mean lower usage, brighter
                  cells mean higher usage.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
