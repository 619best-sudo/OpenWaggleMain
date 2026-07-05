import type { AppSubscriptionSnapshot } from './subscription-client'

export const DEFAULT_SUBSCRIPTION_PLAN_TIER = 'pro'
const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

export interface SubscriptionPlanDetails {
  readonly tier: string
  readonly planName: string
  readonly description: string
  readonly billingLabel: string
  readonly renewalLabel: string
  readonly planPriceUsd: number
  readonly turingMachineQuotaUsd: number
}

function titleCaseTier(tier: string) {
  return tier
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

export function normalizeSubscriptionTier(tier: string | null | undefined) {
  const normalizedTier = tier
    ?.trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
  return normalizedTier && normalizedTier.length > 0
    ? normalizedTier
    : DEFAULT_SUBSCRIPTION_PLAN_TIER
}

function normalizeMarkdownText(value: string | null | undefined) {
  return value?.replace(/\s+/g, ' ').trim() || ''
}

function usdCentsToUsd(usdCents: number) {
  return Math.max(0, usdCents) / 100
}

function normalizeUsdValue(value: number | undefined, fallbackUsdCents: number) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value
  }

  return usdCentsToUsd(fallbackUsdCents)
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

function resolveConsumedPercent(snapshot: AppSubscriptionSnapshot) {
  const quotaUsd = normalizeUsdValue(
    snapshot.turingMachine.quotaUsd,
    snapshot.turingMachine.quotaUsdCents,
  )
  const consumedUsd = normalizeUsdValue(
    snapshot.turingMachine.consumedUsd,
    snapshot.turingMachine.consumedUsdCents,
  )
  const remainingUsd = normalizeUsdValue(
    snapshot.turingMachine.remainingUsd,
    snapshot.turingMachine.remainingUsdCents,
  )

  if (quotaUsd <= 0) {
    return 0
  }

  if (remainingUsd <= 0) {
    return 100
  }

  const reportedPercent = clampPercent(snapshot.turingMachine.percentUsed)
  if (reportedPercent > 0) {
    return reportedPercent
  }

  return clampPercent((consumedUsd / quotaUsd) * 100)
}

function formatPeriodLabel(subscription: AppSubscriptionSnapshot['subscription']) {
  return subscription.billingCycle === 'yearly' ? 'Current yearly cycle' : 'Current monthly cycle'
}

function formatWindowLabel(subscription: AppSubscriptionSnapshot['subscription']) {
  const periodEnd = new Date(subscription.currentPeriodEnd)
  if (Number.isNaN(periodEnd.getTime())) {
    return 'Current billing cycle'
  }

  if (subscription.cancelAtPeriodEnd) {
    return `Access ends ${DATE_FORMATTER.format(periodEnd)}`
  }

  return `Renews ${DATE_FORMATTER.format(periodEnd)}`
}

export function formatUsdDisplay(value: number) {
  const normalized = Number.isFinite(value) ? value : 0
  if (normalized > 0 && normalized < 0.01) {
    return normalized.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
  }
  return Number(normalized.toFixed(2)).toString()
}

export function resolveSubscriptionPlan(input?: {
  readonly tier?: string | null
  readonly isSubscribed?: boolean | null
  readonly snapshot?: AppSubscriptionSnapshot | null
}): SubscriptionPlanDetails {
  if (input?.snapshot) {
    const snapshot = input.snapshot
    const description =
      normalizeMarkdownText(snapshot.tier.descriptionMarkdown) ||
      `Subscription-backed access for the ${snapshot.tier.name} plan.`

    return {
      tier: normalizeSubscriptionTier(snapshot.tier.key),
      planName: snapshot.tier.name.trim() || titleCaseTier(snapshot.tier.key),
      description,
      billingLabel:
        snapshot.pricing.finalCents > 0
          ? snapshot.subscription.billingCycle === 'yearly'
            ? 'Yearly billing'
            : 'Monthly billing'
          : 'Free access',
      renewalLabel: formatWindowLabel(snapshot.subscription),
      planPriceUsd: usdCentsToUsd(snapshot.pricing.finalCents),
      turingMachineQuotaUsd: normalizeUsdValue(
        snapshot.turingMachine.quotaUsd,
        snapshot.turingMachine.quotaUsdCents,
      ),
    }
  }

  const normalizedTier =
    input?.tier && input.tier.trim().length > 0
      ? normalizeSubscriptionTier(input.tier)
      : 'subscription'
  return {
    tier: normalizedTier,
    planName: 'Subscription',
    description: 'Subscription details are loading from the backend.',
    billingLabel: 'Awaiting backend data',
    renewalLabel: 'Subscription snapshot unavailable',
    planPriceUsd: 0,
    turingMachineQuotaUsd: 0,
  }
}

export function buildSubscriptionUsageSummary(snapshot?: AppSubscriptionSnapshot | null) {
  if (snapshot) {
    return {
      totalBudget: normalizeUsdValue(
        snapshot.turingMachine.quotaUsd,
        snapshot.turingMachine.quotaUsdCents,
      ),
      consumed: normalizeUsdValue(
        snapshot.turingMachine.consumedUsd,
        snapshot.turingMachine.consumedUsdCents,
      ),
      left: normalizeUsdValue(
        snapshot.turingMachine.remainingUsd,
        snapshot.turingMachine.remainingUsdCents,
      ),
      consumedPercent: resolveConsumedPercent(snapshot),
      inputTokens: Math.max(0, Math.trunc(snapshot.turingMachine.inputTokens ?? 0)),
      outputTokens: Math.max(0, Math.trunc(snapshot.turingMachine.outputTokens ?? 0)),
      totalTokens: Math.max(
        0,
        Math.trunc(snapshot.turingMachine.inputTokens ?? 0) +
          Math.trunc(snapshot.turingMachine.outputTokens ?? 0),
      ),
      periodLabel: formatPeriodLabel(snapshot.subscription),
      windowLabel: formatWindowLabel(snapshot.subscription),
    }
  }

  return {
    totalBudget: 0,
    consumed: 0,
    left: 0,
    consumedPercent: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    periodLabel: 'Current Turing Machine usage',
    windowLabel: 'No billing data yet',
  }
}
