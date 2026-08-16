import { Activity, CreditCard, ExternalLink, Gauge, LogOut, RotateCw, Trophy } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { env } from '@/env'
import {
  type AppPublicSubscriptionTier,
  type AppSubscriptionSnapshot,
  createBillingCheckoutSession,
  createBillingPortalSession,
  fetchBillingTierCatalog,
  reconcileBillingCheckoutSession,
} from '@/features/auth/lib/subscription-client'
import {
  buildSubscriptionUsageSummary,
  formatUsdDisplay,
  resolveSubscriptionPlan,
} from '@/features/auth/lib/subscription-plan'
import {
  refreshUsageSnapshotsForAuthenticatedUser,
  useAppAuth,
  useAppAuthStore,
} from '@/features/auth/state/app-auth-store'
import { cn } from '@/shared/lib/cn'
import { api } from '@/shared/lib/ipc'
import { Button } from '@/shared/ui/Button'
import { useUIStore } from '@/shell/ui-store'

const MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })
const DAY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})
const BILLING_SYNC_MAX_ATTEMPTS = 6
const BILLING_SYNC_POLL_INTERVAL_MS = 3000
const BILLING_SYNC_RETURN_TIMEOUT_MS = 30_000

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
      return 'border-[color-mix(in_srgb,#059669_34%,var(--color-border))] bg-[color-mix(in_srgb,#10b981_18%,var(--color-bg))]'
    case 2:
      return 'border-[color-mix(in_srgb,#059669_50%,var(--color-border))] bg-[color-mix(in_srgb,#10b981_30%,var(--color-bg))]'
    case 3:
      return 'border-[color-mix(in_srgb,#059669_68%,var(--color-border))] bg-[color-mix(in_srgb,#10b981_46%,var(--color-bg))]'
    case 4:
      return 'border-[color-mix(in_srgb,#059669_82%,var(--color-border))] bg-[color-mix(in_srgb,#10b981_78%,var(--color-bg))]'
    default:
      return 'border-[var(--theme-border-overlay-subtle)] bg-[var(--theme-surface-overlay-subtle)]'
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
        ? (usageMap.get(key) ?? {
            usdCents: 0,
            usd: 0,
            requestCount: 0,
            inputTokens: 0,
            outputTokens: 0,
          })
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

function parsePlanDescription(descriptionMarkdown: string | null | undefined) {
  const normalizedDescription = String(descriptionMarkdown ?? '')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, ' ')

  const lines = normalizedDescription
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return {
      summary: 'Premium features for your workspace.',
      bullets: [] as string[],
    }
  }

  const [summary, ...rest] = lines
  const bullets = rest.map((line) => line.replace(/^[-*]\s*/, '')).filter(Boolean)
  return { summary, bullets }
}

type BillingSyncPhase = 'idle' | 'waiting_for_return' | 'polling'
type BillingSyncSource = 'checkout' | 'portal'
type OpeningExternalTarget = 'account' | 'checkout' | 'portal' | 'refresh'

function buildBillingSyncSignature(snapshot: AppSubscriptionSnapshot | null) {
  if (!snapshot) return 'snapshot:none'

  return JSON.stringify({
    tierKey: snapshot.tier.key,
    status: snapshot.subscription.status,
    billingCycle: snapshot.subscription.billingCycle,
    currentPeriodStart: snapshot.subscription.currentPeriodStart,
    currentPeriodEnd: snapshot.subscription.currentPeriodEnd,
    cancelAtPeriodEnd: snapshot.subscription.cancelAtPeriodEnd,
    quotaUsdCents: snapshot.turingMachine.quotaUsdCents,
  })
}

function getBillingSyncSuccessMessage(source: BillingSyncSource) {
  return source === 'checkout'
    ? 'Billing synced. Your new plan details are now in the app.'
    : 'Billing changes synced from Dodo Payments.'
}

function getBillingSyncRetryMessage(source: BillingSyncSource) {
  return source === 'checkout'
    ? 'No billing change showed up yet. If payment just completed, try Refresh status in a moment.'
    : 'No billing change showed up yet. If you just updated billing, try Refresh status again in a moment.'
}

function getBillingReturnMessage(source: BillingSyncSource) {
  return source === 'checkout'
    ? 'Checkout opened in your browser. Return to Turing Machine when payment completes and billing will sync automatically.'
    : 'Billing portal opened in your browser. Return to Turing Machine to sync any changes automatically.'
}

function resolveInitialBillingTierKey(
  currentSelection: string | null,
  paidTiers: readonly AppPublicSubscriptionTier[],
  currentUserTier: string | null | undefined,
) {
  if (currentSelection && paidTiers.some((tier) => tier.key === currentSelection)) {
    return currentSelection
  }

  const preferredTierKey = currentUserTier && currentUserTier !== 'free' ? currentUserTier : null
  const upgradeTiers = paidTiers.filter((tier) => tier.key !== preferredTierKey)

  return upgradeTiers[0]?.key ?? paidTiers[0]?.key ?? null
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
  const { user, subscriptionSnapshot, turingMachineActivity, leaderboardSnapshot, signOut } =
    useAppAuth()
  const showToast = useUIStore((state) => state.showToast)
  const billingSyncDelayTimerRef = useRef<number | null>(null)
  const billingSyncReturnTimerRef = useRef<number | null>(null)
  const billingSyncFocusCleanupRef = useRef<(() => void) | null>(null)
  const billingSyncRunIdRef = useRef(0)
  const pendingCheckoutSessionIdRef = useRef<string | null>(null)
  const [hoveredUsageKey, setHoveredUsageKey] = useState<string | null>(null)
  const [billingSyncPhase, setBillingSyncPhase] = useState<BillingSyncPhase>('idle')
  const [billingCatalogState, setBillingCatalogState] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  )
  const [billingCatalogError, setBillingCatalogError] = useState<string | null>(null)
  const [billingTiers, setBillingTiers] = useState<readonly AppPublicSubscriptionTier[]>([])
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<'monthly' | 'yearly'>(
    subscriptionSnapshot?.subscription.billingCycle ?? 'monthly',
  )
  const [selectedBillingTierKey, setSelectedBillingTierKey] = useState<string | null>(null)
  const [openingExternalTarget, setOpeningExternalTarget] = useState<OpeningExternalTarget | null>(
    null,
  )
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
    const activeDays = days.filter(
      (day) => day.requestCount > 0 || (day.usd ?? day.usdCents / 100) > 0,
    )
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
  const paidBillingTiers = useMemo(
    () => billingTiers.filter((tier) => tier.key !== 'free'),
    [billingTiers],
  )
  const currentBillingTierKey = subscriptionSnapshot?.tier.key ?? user?.subscriptionTier ?? null
  const upgradeBillingTiers = useMemo(() => {
    if (!currentBillingTierKey || currentBillingTierKey === 'free') {
      return paidBillingTiers
    }

    const nextTiers = paidBillingTiers.filter((tier) => tier.key !== currentBillingTierKey)
    return nextTiers.length > 0 ? nextTiers : paidBillingTiers
  }, [currentBillingTierKey, paidBillingTiers])
  const visibleBillingTiers = paidBillingTiers
  const selectedBillingTier = useMemo(
    () => upgradeBillingTiers.find((tier) => tier.key === selectedBillingTierKey) ?? null,
    [selectedBillingTierKey, upgradeBillingTiers],
  )
  const checkoutActionDisabled =
    openingExternalTarget !== null ||
    billingSyncPhase === 'polling' ||
    billingCatalogState !== 'ready' ||
    selectedBillingTier === null
  const portalActionDisabled = openingExternalTarget !== null || billingSyncPhase === 'polling'

  useEffect(() => {
    if (!user?.isSubscribed || !subscriptionSnapshot?.subscription.billingCycle) return
    setSelectedBillingCycle(subscriptionSnapshot.subscription.billingCycle)
  }, [subscriptionSnapshot?.subscription.billingCycle, user?.isSubscribed])

  useEffect(() => {
    let cancelled = false

    setBillingCatalogState('loading')
    setBillingCatalogError(null)

    void fetchBillingTierCatalog()
      .then((tiers) => {
        if (cancelled) return

        const paidTiers = tiers.filter((tier) => tier.key !== 'free')
        setBillingTiers(tiers)
        setBillingCatalogState('ready')
        setSelectedBillingTierKey((current) => {
          return resolveInitialBillingTierKey(current, paidTiers, user?.subscriptionTier)
        })
      })
      .catch((error) => {
        if (cancelled) return

        setBillingCatalogState('error')
        setBillingCatalogError(
          error instanceof Error ? error.message : 'Failed to load billing plans.',
        )
      })

    return () => {
      cancelled = true
    }
  }, [user?.subscriptionTier])

  useEffect(() => {
    return () => {
      billingSyncRunIdRef.current += 1
      if (billingSyncDelayTimerRef.current !== null) {
        window.clearTimeout(billingSyncDelayTimerRef.current)
      }
      if (billingSyncReturnTimerRef.current !== null) {
        window.clearTimeout(billingSyncReturnTimerRef.current)
      }
      billingSyncFocusCleanupRef.current?.()
    }
  }, [])

  async function runOpeningAction<T>(
    target: OpeningExternalTarget,
    operation: () => Promise<T>,
  ): Promise<T> {
    setOpeningExternalTarget(target)
    try {
      return await operation()
    } finally {
      setOpeningExternalTarget((current) => (current === target ? null : current))
    }
  }

  async function openExternalUrl(
    url: string,
    target: Extract<OpeningExternalTarget, 'account' | 'checkout' | 'portal'>,
    fallbackMessage: string,
  ) {
    try {
      await runOpeningAction(target, () => api.openExternal(url))
    } catch (error) {
      showToast(error instanceof Error ? error.message : fallbackMessage, 'error')
    }
  }

  function clearPendingBillingSync() {
    billingSyncRunIdRef.current += 1
    if (billingSyncDelayTimerRef.current !== null) {
      window.clearTimeout(billingSyncDelayTimerRef.current)
      billingSyncDelayTimerRef.current = null
    }
    if (billingSyncReturnTimerRef.current !== null) {
      window.clearTimeout(billingSyncReturnTimerRef.current)
      billingSyncReturnTimerRef.current = null
    }
    billingSyncFocusCleanupRef.current?.()
    billingSyncFocusCleanupRef.current = null
    setBillingSyncPhase('idle')
  }

  function startBillingSyncNow(source: BillingSyncSource, baselineSignature: string) {
    clearPendingBillingSync()
    billingSyncRunIdRef.current += 1
    void pollForBillingSync(source, baselineSignature)
  }

  async function reconcilePendingBillingCheckout() {
    const checkoutSessionId = pendingCheckoutSessionIdRef.current
    if (!checkoutSessionId) return

    const accessToken = useAppAuthStore.getState().user?.accessToken ?? user?.accessToken
    if (!accessToken) return

    const result = await reconcileBillingCheckoutSession(accessToken, checkoutSessionId)
    if (result.synced) {
      pendingCheckoutSessionIdRef.current = null
    }
  }

  async function refreshBillingSnapshots(includeCheckoutReconcile: boolean) {
    if (includeCheckoutReconcile) {
      await reconcilePendingBillingCheckout()
    }
    await refreshUsageSnapshotsForAuthenticatedUser({ includeLeaderboard: true })
  }

  async function launchBillingFlow(
    source: BillingSyncSource,
    url: string,
    baselineSignature: string,
    options?: { preferOverlay?: boolean },
  ) {
    if (options?.preferOverlay && env.isElectron) {
      await api.openBillingOverlay(url)
      startBillingSyncNow(source, baselineSignature)
      return
    }

    await api.openExternal(url)
    scheduleBillingSyncOnReturn(source, baselineSignature)
  }

  async function pollForBillingSync(source: BillingSyncSource, baselineSignature: string) {
    const runId = billingSyncRunIdRef.current
    setBillingSyncPhase('polling')

    for (let attempt = 0; attempt < BILLING_SYNC_MAX_ATTEMPTS; attempt += 1) {
      try {
        await refreshBillingSnapshots(source === 'checkout')
      } catch {
        // Retry on the next poll tick to tolerate brief backend delays after checkout.
      }

      if (billingSyncRunIdRef.current !== runId) return

      const currentSignature = buildBillingSyncSignature(
        useAppAuthStore.getState().subscriptionSnapshot,
      )
      if (currentSignature !== baselineSignature) {
        setBillingSyncPhase('idle')
        showToast(getBillingSyncSuccessMessage(source), 'success')
        return
      }

      if (attempt === BILLING_SYNC_MAX_ATTEMPTS - 1) break

      await new Promise<void>((resolve) => {
        billingSyncDelayTimerRef.current = window.setTimeout(resolve, BILLING_SYNC_POLL_INTERVAL_MS)
      })
      billingSyncDelayTimerRef.current = null

      if (billingSyncRunIdRef.current !== runId) return
    }

    setBillingSyncPhase('idle')
    showToast(getBillingSyncRetryMessage(source), 'neutral')
  }

  function scheduleBillingSyncOnReturn(source: BillingSyncSource, baselineSignature: string) {
    clearPendingBillingSync()

    const startPolling = () => {
      billingSyncFocusCleanupRef.current?.()
      billingSyncFocusCleanupRef.current = null
      if (billingSyncReturnTimerRef.current !== null) {
        window.clearTimeout(billingSyncReturnTimerRef.current)
        billingSyncReturnTimerRef.current = null
      }
      startBillingSyncNow(source, baselineSignature)
    }

    if (typeof window === 'undefined') {
      startPolling()
      return
    }

    setBillingSyncPhase('waiting_for_return')
    const handleFocus = () => {
      startPolling()
    }
    window.addEventListener('focus', handleFocus, { once: true })
    billingSyncFocusCleanupRef.current = () => {
      window.removeEventListener('focus', handleFocus)
    }
    billingSyncReturnTimerRef.current = window.setTimeout(
      startPolling,
      BILLING_SYNC_RETURN_TIMEOUT_MS,
    )

    showToast(getBillingReturnMessage(source), 'neutral')
  }

  async function refreshBillingStatus() {
    try {
      await runOpeningAction('refresh', () => refreshBillingSnapshots(true))
      showToast('Billing status refreshed.', 'success')
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Failed to refresh billing status.',
        'error',
      )
    }
  }

  async function startBillingCheckout() {
    const accessToken = user?.accessToken
    if (!accessToken) {
      showToast('Sign in again to start checkout.', 'error')
      return
    }
    if (!selectedBillingTier) {
      showToast('Select a billing plan before starting checkout.', 'error')
      return
    }

    try {
      await runOpeningAction('checkout', async () => {
        const baselineSignature = buildBillingSyncSignature(subscriptionSnapshot)
        const session = await createBillingCheckoutSession(accessToken, {
          tierKey: selectedBillingTier.key,
          billingCycle: selectedBillingCycle,
        })
        pendingCheckoutSessionIdRef.current = session.sessionId ?? null
        await launchBillingFlow('checkout', session.url, baselineSignature, { preferOverlay: true })
      })
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Failed to open the Dodo checkout.',
        'error',
      )
    }
  }

  async function openBillingPortal() {
    const accessToken = user?.accessToken
    if (!accessToken) {
      showToast('Sign in again to manage billing.', 'error')
      return
    }

    try {
      await runOpeningAction('portal', async () => {
        const baselineSignature = buildBillingSyncSignature(subscriptionSnapshot)
        const session = await createBillingPortalSession(accessToken)
        await launchBillingFlow('portal', session.url, baselineSignature)
      })
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Failed to open the Dodo customer portal.',
        'error',
      )
    }
  }

  return (
    <div className="w-full space-y-4">
      <div className="space-y-1">
        <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-text-primary">Profile</h2>
        <p className="max-w-[760px] text-[12px] leading-5 text-text-tertiary">
          Review your account details, usage, leaderboard, and quick access to your account website.
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
                onClick={() =>
                  openExternalUrl(
                    env.accountWebsiteUrl,
                    'account',
                    'Failed to open your account website.',
                  )
                }
                disabled={openingExternalTarget !== null}
                className="h-8 bg-bg-tertiary px-2.5 text-[12px] text-text-secondary hover:bg-bg-hover"
              >
                <ExternalLink className="size-3.5" />
                {openingExternalTarget === 'account' ? 'Opening...' : 'My account'}
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
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-bg text-text-secondary">
              <CreditCard className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[15px] font-semibold text-text-primary">Billing</h3>
                    <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                      Current Plan: {subscriptionPlan.planName}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={portalActionDisabled}
                    onClick={() => {
                      void refreshBillingStatus()
                    }}
                    aria-label="Refresh status"
                    title={
                      openingExternalTarget === 'refresh'
                        ? 'Refreshing...'
                        : billingSyncPhase === 'polling'
                          ? 'Syncing...'
                          : billingSyncPhase === 'waiting_for_return'
                            ? 'Waiting for return...'
                            : 'Refresh status'
                    }
                    className="h-8 w-8 bg-bg-tertiary px-0 text-text-secondary hover:bg-bg-hover"
                  >
                    <RotateCw
                      className={cn(
                        'size-3.5',
                        (openingExternalTarget === 'refresh' || billingSyncPhase === 'polling') &&
                          'animate-spin',
                      )}
                    />
                  </Button>
                  {user?.isSubscribed && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={portalActionDisabled}
                      onClick={() => {
                        void openBillingPortal()
                      }}
                      className="h-8 bg-bg-tertiary px-2.5 text-[12px] text-text-secondary hover:bg-bg-hover"
                    >
                      <ExternalLink className="size-3.5" />
                      {openingExternalTarget === 'portal' ? 'Opening...' : 'Manage billing'}
                    </Button>
                  )}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
                      Upgrade Plan
                    </p>

                    <div className="inline-flex items-center rounded-lg border border-border/50 bg-bg-tertiary/70 p-1">
                      {(['monthly', 'yearly'] as const).map((billingCycle) => (
                        <button
                          key={billingCycle}
                          onClick={() => setSelectedBillingCycle(billingCycle)}
                          className={cn(
                            'relative rounded-md px-3 py-1.5 text-[11px] font-medium capitalize transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                            billingCycle === selectedBillingCycle
                              ? 'bg-bg text-text-primary ring-1 ring-border/40'
                              : 'text-text-secondary hover:text-text-primary',
                          )}
                        >
                          {billingCycle}
                        </button>
                      ))}
                    </div>
                  </div>

                  {billingCatalogState === 'loading' && (
                    <p className="text-[12px] text-text-muted">Loading plans from the backend...</p>
                  )}

                  {billingCatalogState === 'error' && (
                    <p className="text-[12px] text-error">
                      {billingCatalogError ?? 'Failed to load billing plans.'}
                    </p>
                  )}

                  {billingCatalogState === 'ready' && visibleBillingTiers.length > 0 && (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {visibleBillingTiers.map((tier, index) => {
                        const pricing = tier.pricing[selectedBillingCycle]
                        const description = parsePlanDescription(tier.descriptionMarkdown)
                        const isCurrentPlan = tier.key === currentBillingTierKey
                        const isSelectable = !isCurrentPlan
                        const isSelected = tier.key === selectedBillingTierKey
                        const isFeatured = index === 0
                        const isPremium = index === visibleBillingTiers.length - 1

                        return (
                          <button
                            key={tier.key}
                            type="button"
                            onClick={() => {
                              if (!isSelectable) return
                              setSelectedBillingTierKey(tier.key)
                            }}
                            disabled={!isSelectable}
                            aria-pressed={isSelectable ? isSelected : undefined}
                            className={cn(
                              'group relative flex min-h-[220px] flex-col overflow-hidden rounded-2xl border bg-bg text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                              isCurrentPlan
                                ? 'cursor-default border-border/50 bg-bg-secondary/35'
                                : isSelected
                                  ? 'border-accent/35 bg-accent/[0.025] ring-1 ring-accent/20'
                                  : 'border-border/45 hover:border-border/65 hover:bg-bg-secondary/60',
                            )}
                          >
                            <div className="flex h-full flex-col p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h4 className="text-[15px] font-semibold tracking-[-0.02em] text-text-primary">
                                      {tier.name}
                                    </h4>
                                    {isCurrentPlan && (
                                      <span className="rounded-full border border-border/45 bg-bg-secondary/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                                        Current
                                      </span>
                                    )}
                                    {isFeatured && (
                                      <span className="rounded-full border border-accent/15 bg-bg-secondary/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-accent">
                                        Recommended
                                      </span>
                                    )}
                                    {!isFeatured && isPremium && (
                                      <span className="rounded-full border border-border/45 bg-bg-secondary/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                                        Power
                                      </span>
                                    )}
                                  </div>
                                  <div className="max-w-[32ch] space-y-2 text-[12px] leading-5 text-text-tertiary">
                                    <p>{description.summary}</p>
                                    {description.bullets.length > 0 && (
                                      <ul className="space-y-1">
                                        {description.bullets.map((bullet) => (
                                          <li key={bullet} className="flex gap-2">
                                            <span className="pt-[2px] text-text-muted">&bull;</span>
                                            <span>{bullet}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                </div>
                                <div
                                  className={cn(
                                    'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                                    isCurrentPlan
                                      ? 'border-border/45 bg-bg-secondary/70 text-transparent'
                                      : isSelected
                                        ? 'border-accent bg-accent text-bg'
                                        : 'border-border/45 bg-bg-secondary/70 text-transparent group-hover:border-accent/25',
                                  )}
                                >
                                  <div className="size-2 rounded-full bg-current" />
                                </div>
                              </div>

                              <div className="mt-6 flex items-end gap-2">
                                <span className="text-[30px] font-semibold tracking-[-0.05em] text-text-primary">
                                  ${formatUsdDisplay(pricing.finalCents / 100)}
                                </span>
                                <span className="pb-1 text-[12px] text-text-muted">
                                  / {selectedBillingCycle === 'monthly' ? 'month' : 'year'}
                                </span>
                              </div>

                              <div className="mt-4 flex flex-wrap gap-2">
                                <span className="rounded-full border border-border/40 bg-bg-secondary/70 px-2.5 py-1 text-[11px] font-medium text-text-secondary">
                                  ${formatUsdDisplay(tier.limits.turingMachineQuotaUsdCents / 100)}{' '}
                                  TM quota
                                </span>
                                {pricing.discountPercent > 0 && (
                                  <span className="rounded-full border border-emerald-500/10 bg-emerald-500/8 px-2.5 py-1 text-[11px] font-medium text-emerald-400">
                                    Save {pricing.discountPercent}%
                                  </span>
                                )}
                              </div>

                              <div className="mt-auto pt-6">
                                <div
                                  className={cn(
                                    'flex items-center justify-between rounded-xl border px-3 py-2 text-[11px]',
                                    isCurrentPlan
                                      ? 'border-border/35 bg-bg-secondary/70 text-text-secondary'
                                      : isSelected
                                        ? 'border-accent/15 bg-bg-secondary/70 text-text-primary'
                                        : 'border-border/35 bg-bg-secondary/70 text-text-secondary',
                                  )}
                                >
                                  <span>
                                    {isCurrentPlan
                                      ? 'Current plan'
                                      : isSelected
                                        ? 'Selected for checkout'
                                        : 'Select this plan'}
                                  </span>
                                  <span className="font-medium">
                                    {isCurrentPlan
                                      ? 'Already active'
                                      : isFeatured
                                        ? 'Best value'
                                        : 'More capacity'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {billingCatalogState === 'ready' && visibleBillingTiers.length === 0 && (
                    <div className="mt-4 rounded-2xl border border-border bg-bg px-4 py-4 text-[12px] text-text-tertiary">
                      No higher plans are available for this account right now.
                    </div>
                  )}
                </div>

                <div className="flex pt-2">
                  <Button
                    variant="accent"
                    size="md"
                    disabled={checkoutActionDisabled}
                    onClick={() => {
                      void startBillingCheckout()
                    }}
                    className="mt-2 h-10 w-full font-semibold text-[13px]"
                  >
                    {openingExternalTarget === 'checkout'
                      ? 'Opening checkout...'
                      : billingCatalogState === 'loading'
                        ? 'Loading plans...'
                        : selectedBillingTier
                          ? `Upgrade to ${selectedBillingTier.name} • $${formatUsdDisplay(selectedBillingTier.pricing[selectedBillingCycle].finalCents / 100)}/${selectedBillingCycle === 'monthly' ? 'mo' : 'yr'}`
                          : 'Select a plan to upgrade'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-bg-secondary px-4 py-4 sm:px-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-bg text-text-secondary">
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
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-bg text-text-secondary">
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
                      {formatCompactNumber(usage.inputTokens)} in /{' '}
                      {formatCompactNumber(usage.outputTokens)} out
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
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-bg text-text-secondary">
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
                        className="flex w-3 items-start justify-start text-[10px] text-text-secondary"
                      >
                        {week.monthLabel ?? ''}
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-1.5">
                    <div className="flex flex-col gap-0.5 text-[10px] text-text-secondary">
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
                                  isHovered && 'scale-110 border-accent/60',
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

              <div className="mt-3 flex items-center gap-2 text-[10px] text-text-secondary">
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
