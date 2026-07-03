import {
  Activity,
  ExternalLink,
  Gauge,
  LogOut,
  Trophy,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  buildSubscriptionUsageSummary,
  formatUsdDisplay,
  resolveSubscriptionPlan,
} from '@/features/auth/lib/subscription-plan'
import { useAppAuth } from '@/features/auth/state/app-auth-store'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'

const ACCOUNT_WEBSITE_URL = 'https://account.turing.app'
const MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })
const DAY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

interface ActivityHeatmapCell {
  readonly key: string
  readonly usdCents: number
  readonly usd: number
  readonly requestCount: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly date: Date
  readonly label: string
  readonly isInRange: boolean
}

interface ActivityHeatmapWeek {
  readonly key: string
  readonly monthLabel: string | null
  readonly cells: readonly ActivityHeatmapCell[]
}

interface LeaderboardEntryView {
  readonly userId: string
  readonly name: string
  readonly score: number
  readonly rank: number
  readonly breakdown?: Readonly<Record<string, number>>
}

interface LeaderboardListView {
  readonly top: readonly LeaderboardEntryView[]
  readonly user: LeaderboardEntryView | null
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

function parseActivityDate(input: string | undefined, fallback: Date) {
  if (!input) return fallback
  const parsed = new Date(`${input}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

function heatmapLevel(usd: number, maxUsd: number) {
  if (usd <= 0 || maxUsd <= 0) return 0
  const ratio = usd / maxUsd
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
  usageMap: ReadonlyMap<
    string,
    {
      readonly usdCents: number
      readonly usd: number
      readonly requestCount: number
      readonly inputTokens: number
      readonly outputTokens: number
    }
  >,
): readonly ActivityHeatmapWeek[] {
  const firstWeekStart = startOfUtcWeek(start)
  const lastWeekEnd = endOfUtcWeek(end)
  const weeks: ActivityHeatmapWeek[] = []
  let previousMonth: number | null = null

  for (
    let weekStart = firstWeekStart;
    weekStart.getTime() <= lastWeekEnd.getTime();
    weekStart = addUtcDays(weekStart, 7)
  ) {
    const cells: ActivityHeatmapCell[] = Array.from({ length: 7 }, (_, dayOffset) => {
      const date = addUtcDays(weekStart, dayOffset)
      const key = toUtcDateKey(date)
      const isInRange = date.getTime() >= start.getTime() && date.getTime() <= end.getTime()
      const usage = isInRange
        ? (usageMap.get(key) ?? { usdCents: 0, usd: 0, requestCount: 0, inputTokens: 0, outputTokens: 0 })
        : { usdCents: 0, usd: 0, requestCount: 0, inputTokens: 0, outputTokens: 0 }

      return {
        key,
        usdCents: usage.usdCents,
        usd: usage.usd,
        requestCount: usage.requestCount,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
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
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)

  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || 'TU'
}

function formatCompactNumber(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(value)
}

function formatUsagePercentLabel(percent: number, hasUsage: boolean) {
  if (!hasUsage || percent <= 0) return '0% used'
  if (percent < 0.01) return '<0.01% used'
  if (percent < 1) return `${percent.toFixed(2)}% used`
  return `${Math.round(percent * 100) / 100}% used`
}

function resolveUsageBarWidth(percent: number, hasUsage: boolean) {
  if (!hasUsage || percent <= 0) return '0%'
  if (percent < 0.01) return 'max(0.01%, 2px)'
  return `${String(percent)}%`
}

function LeaderboardList({
  title,
  list,
  formatter,
}: {
  title: string
  list?: LeaderboardListView
  formatter: (score: number) => string
}) {
  const getMedal = (rank: number) => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return <span className="text-[11px] font-bold text-text-muted px-1">{rank}</span>
  }

  return (
    <div className="min-w-[180px] flex-1 overflow-hidden rounded-xl border border-border bg-bg">
      <div className="border-b border-border/70 bg-bg-secondary/50 px-3 py-2">
        <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">
          {title}
        </h4>
      </div>

      <div className="divide-y divide-border/50">
        {list?.top.map((entry) => (
          <div
            key={entry.userId}
            className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-2 px-3 py-1.5 text-[12px]"
          >
            <span className="w-5 shrink-0 text-center font-mono text-[11px] text-text-muted">
              {getMedal(entry.rank)}
            </span>
            <span className="truncate font-medium text-text-primary">{entry.name}</span>
            <span className="shrink-0 font-mono font-semibold tabular-nums text-text-secondary">
              {formatter(entry.score)}
            </span>
          </div>
        ))}
        {(!list?.top || list.top.length === 0) && (
          <p className="px-3 py-2 text-[11px] text-text-tertiary">No data yet.</p>
        )}
      </div>

      {list?.user &&
        (list.top.length === 0 || !list.top.some((t) => t.userId === list.user?.userId)) && (
          <>
            {list.top.length > 0 && (
              <div className="border-t border-border/50 px-3 py-1 text-center font-mono text-[11px] tracking-[0.08em] text-text-muted">
                ...
              </div>
            )}
            <div className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-2 border-t border-border/70 bg-bg-secondary/30 px-3 py-1.5 text-[12px]">
              <span className="w-5 shrink-0 text-center font-mono text-[11px] font-bold text-text-muted">
                {list.user.rank}
              </span>
              <span className="truncate font-bold text-text-primary">{list.user.name} (You)</span>
              <span className="shrink-0 font-mono font-bold tabular-nums text-text-primary">
                {formatter(list.user.score)}
              </span>
            </div>
          </>
        )}
    </div>
  )
}

export function ProfileSection() {
  const {
    user,
    subscriptionSnapshot,
    turingMachineActivity,
    leaderboardSnapshot,
    signOut,
  } = useAppAuth()
  const [hoveredUsageKey, setHoveredUsageKey] = useState<string | null>(null)
  const subscriptionPlan = useMemo(
    () =>
      resolveSubscriptionPlan({
        tier: user?.subscriptionTier,
        isSubscribed: user?.isSubscribed,
        snapshot: subscriptionSnapshot,
      }),
    [subscriptionSnapshot, user?.isSubscribed, user?.subscriptionTier],
  )

  const profile = useMemo(() => {
    return {
      name: user?.name?.trim() || 'Turing User',
      email: user?.email?.trim() || 'you@example.com',
      initials: initialsFromName(user?.name ?? ''),
    }
  }, [user])

  const usage = useMemo(() => {
    return buildSubscriptionUsageSummary(subscriptionSnapshot)
  }, [subscriptionSnapshot])
  const leaderboardTokenTotal = leaderboardSnapshot?.tokens.user?.score ?? null
  const usageTokenDisplayTotal = leaderboardTokenTotal ?? usage.totalTokens

  const activity = useMemo(() => {
    const now = new Date()
    const fallbackEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    )
    const fallbackStart = new Date(
      Date.UTC(fallbackEnd.getUTCFullYear(), fallbackEnd.getUTCMonth() - 3, 1),
    )
    const rangeStart = parseActivityDate(turingMachineActivity?.startDate, fallbackStart)
    const rangeEnd = parseActivityDate(turingMachineActivity?.endDate, fallbackEnd)
    const days = turingMachineActivity?.days ?? []
    const usageMap = new Map(
      days.map((day) => [
        day.date,
        {
          usdCents: day.usdCents,
          usd: day.usd ?? day.usdCents / 100,
          requestCount: day.requestCount,
          inputTokens: day.inputTokens,
          outputTokens: day.outputTokens,
        },
      ]),
    )
    const activeDays = days.filter((day) => day.requestCount > 0 || (day.usd ?? day.usdCents / 100) > 0)
    const maxDay = activeDays.reduce<(typeof activeDays)[number] | null>((best, day) => {
      if (!best) return day
      const dayUsd = day.usd ?? day.usdCents / 100
      const bestUsd = best.usd ?? best.usdCents / 100
      if (dayUsd !== bestUsd) return dayUsd > bestUsd ? day : best
      return day.requestCount > best.requestCount ? day : best
    }, null)
    const hoveredDay =
      hoveredUsageKey === null
        ? maxDay
        : (days.find((day) => day.date === hoveredUsageKey) ?? maxDay)

    return {
      heatmap: buildUsageHeatmap(rangeStart, rangeEnd, usageMap),
      maxUsd: Math.max(0, ...days.map((day) => day.usd ?? day.usdCents / 100)),
      activeDays: activeDays.length,
      totalRequests: days.reduce((sum, day) => sum + day.requestCount, 0),
      totalInputTokens: days.reduce((sum, day) => sum + day.inputTokens, 0),
      totalOutputTokens: days.reduce((sum, day) => sum + day.outputTokens, 0),
      months: turingMachineActivity?.months ?? 4,
      maxDay,
      hoveredDay,
    }
  }, [hoveredUsageKey, turingMachineActivity])
  const usagePercentLabel = formatUsagePercentLabel(usage.consumedPercent, usage.consumed > 0)
  const usageBarWidth = resolveUsageBarWidth(usage.consumedPercent, usage.consumed > 0)

  return (
    <div className="w-full space-y-4">
      <div className="space-y-1">
        <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-text-primary">Profile</h2>
        <p className="max-w-[760px] text-[12px] leading-5 text-text-tertiary">
          Review your account details, usage, leaderboard, and quick access to your account
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
                  <span className="rounded-full border border-info/25 bg-info/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-info">
                    {subscriptionPlan.planName}
                  </span>
                </div>
                <p className="text-[12px] text-text-secondary">{profile.email}</p>
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
                My account
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
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/12 text-amber-500">
              <Trophy className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="space-y-1">
                <h3 className="text-[15px] font-semibold text-text-primary">Leaderboard</h3>
                <p className="text-[12px] text-text-tertiary">
                  Compete with other 10x engineers. Rankings are updated in real-time.
                </p>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <LeaderboardList
                  title="Overall Activity"
                  list={leaderboardSnapshot?.overall}
                  formatter={(score) => `${String(score)} pts`}
                />
                <LeaderboardList
                  title="Tokens Consumed"
                  list={leaderboardSnapshot?.tokens}
                  formatter={formatCompactNumber}
                />
                <LeaderboardList
                  title="Contribution"
                  list={leaderboardSnapshot?.contribution}
                  formatter={(score) => `${String(score)} pts`}
                />
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
                <p className="text-[12px] text-text-tertiary">{usage.periodLabel}</p>
              </div>

              <div className="mt-4">
                <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
                      Consumed
                    </p>
                    <div className="flex items-end gap-2">
                      <span className="text-[24px] font-semibold tracking-[-0.04em] text-text-primary">
                        ${formatUsdDisplay(usage.consumed)}
                      </span>
                      <span className="pb-0.5 text-[11px] text-text-muted">
                        of ${formatUsdDisplay(usage.totalBudget)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1 text-left sm:text-right">
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
                      Left
                    </p>
                    <p className="text-[20px] font-semibold tracking-[-0.03em] text-text-primary">
                      ${formatUsdDisplay(usage.left)}
                    </p>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex items-center justify-between text-[11px] text-text-muted">
                    <span>{usage.windowLabel}</span>
                    <span>{usagePercentLabel}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg-tertiary">
                    <div
                      className="h-full rounded-full bg-info transition-[width]"
                      style={{ width: usageBarWidth }}
                    />
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-border bg-bg px-3 py-3">
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
                      Plan
                    </p>
                    <p className="mt-1 text-[14px] font-semibold text-text-primary">
                      {subscriptionPlan.planName}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-bg px-3 py-3">
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
                      Price
                    </p>
                    <p className="mt-1 text-[14px] font-semibold text-text-primary">
                      ${formatUsdDisplay(subscriptionPlan.planPriceUsd)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-bg px-3 py-3">
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
                      Turing Quota
                    </p>
                    <p className="mt-1 text-[14px] font-semibold text-text-primary">
                      ${formatUsdDisplay(subscriptionPlan.turingMachineQuotaUsd)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-bg px-3 py-3">
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
                      Tokens Used
                    </p>
                    <p className="mt-1 text-[14px] font-semibold text-text-primary">
                      {formatCompactNumber(usageTokenDisplayTotal)}
                    </p>
                    <p className="mt-1 text-[11px] text-text-muted">
                      {formatCompactNumber(usage.inputTokens)} in / {formatCompactNumber(usage.outputTokens)} out
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-bg px-3 py-3">
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
                      Cycle
                    </p>
                    <p className="mt-1 text-[14px] font-semibold text-text-primary">
                      {usage.windowLabel}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-bg-secondary px-4 py-4 sm:px-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/12 text-emerald-500">
              <Activity className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="space-y-1">
                <h3 className="text-[15px] font-semibold text-text-primary">Activity</h3>
                <p className="text-[12px] text-text-tertiary">
                  {activity.hoveredDay
                    ? `${DAY_FORMATTER.format(new Date(`${activity.hoveredDay.date}T00:00:00Z`))} used $${formatUsdDisplay(activity.hoveredDay.usd ?? activity.hoveredDay.usdCents / 100)} across ${String(activity.hoveredDay.requestCount)} request${activity.hoveredDay.requestCount === 1 ? '' : 's'}`
                    : activity.activeDays === 0
                      ? `0 active days in the last ${String(activity.months)} months. Time to start building and light up this board!`
                      : `${String(activity.activeDays)} active days in the last ${String(activity.months)} months. Keep the streak alive!`}
                </p>
              </div>

              <div className="mt-4 max-w-fit overflow-x-auto pb-1">
                <div className="inline-flex min-w-full flex-col gap-1.5">
                  <div className="ml-6 flex gap-0.5">
                    {activity.heatmap.map((week) => (
                      <div
                        key={`${week.key}-label`}
                        className="flex w-3 items-start justify-start text-[10px] text-text-muted"
                      >
                        {week.monthLabel ?? ''}
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-1.5">
                    <div className="flex flex-col gap-0.5 text-[10px] text-text-muted">
                      {['', 'M', '', 'W', '', 'F', ''].map((label, index) => (
                        <span
                          key={`${label}-${String(index)}`}
                          className="flex h-3 w-3 items-center justify-start"
                        >
                          {label}
                        </span>
                      ))}
                    </div>

                    <div className="flex gap-0.5">
                      {activity.heatmap.map((week) => (
                        <div key={week.key} className="flex flex-col gap-0.5">
                          {week.cells.map((cell) => {
                            if (!cell.isInRange) {
                              return (
                                <span key={cell.key} className="size-3 rounded-[3px] opacity-0" />
                              )
                            }

                            const level = heatmapLevel(cell.usd, activity.maxUsd)
                            const isActive = cell.requestCount > 0 || cell.usd > 0
                            const isHovered = hoveredUsageKey === cell.key

                            return (
                              <button
                                key={cell.key}
                                type="button"
                                aria-label={`${cell.label} used $${formatUsdDisplay(cell.usd)} across ${String(cell.requestCount)} requests`}
                                title={`${cell.label}: $${formatUsdDisplay(cell.usd)} used, ${String(cell.requestCount)} requests, ${String(cell.inputTokens)} input tokens, ${String(cell.outputTokens)} output tokens`}
                                onMouseEnter={() => setHoveredUsageKey(cell.key)}
                                onMouseLeave={() => setHoveredUsageKey(null)}
                                onFocus={() => setHoveredUsageKey(cell.key)}
                                onBlur={() => setHoveredUsageKey(null)}
                                className={cn(
                                  'size-3 rounded-[3px] border transition-[transform,background-color,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35',
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

              <div className="mt-3 flex items-center gap-2 text-[10px] text-text-muted">
                <span>Less</span>
                {[0, 1, 2, 3, 4].map((level) => (
                  <span
                    key={`legend-${String(level)}`}
                    aria-hidden="true"
                    className={cn('size-3 rounded-[3px] border', heatmapLevelClass(level))}
                  />
                ))}
                <span>More</span>
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}
