import type { ContextUsageSnapshot } from '@shared/types/context-usage'
import type { ProviderInfo, SupportedModelId } from '@shared/types/llm'
import { formatTokens } from '@/shared/lib/format-tokens'
import { CONTEXT_METER } from '../constants'

interface UsageTitleInput {
  readonly tokens: number | null
  readonly contextWindow: number | null
  readonly percent: number | null
  readonly failed: boolean
  /** What the kernel's snapshot measures (e.g. 'Next request'). */
  readonly label?: string
}

interface ContextMeterValueInput {
  readonly snapshot: ContextUsageSnapshot | null
  readonly fallbackContextWindow: number | null
  readonly hasActiveSession: boolean
  readonly failed: boolean
}

export function buildContextUsageRequestKey(
  sessionId: string | null,
  model: SupportedModelId,
  sessionVersion: string,
) {
  return sessionId ? `${sessionId}:${model}:${sessionVersion}` : ''
}

export function findContextWindow(
  providerModels: readonly ProviderInfo[],
  modelRef: SupportedModelId,
) {
  for (const group of providerModels) {
    const contextWindow = group.models.find((model) => model.id === modelRef)?.contextWindow
    if (contextWindow) return contextWindow
  }
  return null
}

export function buildContextMeterValue({
  snapshot,
  fallbackContextWindow,
  hasActiveSession,
  failed,
}: ContextMeterValueInput) {
  const contextWindow = snapshot?.contextWindow ?? fallbackContextWindow
  const percent = resolveUsageValue(snapshot?.percent, fallbackContextWindow, hasActiveSession)
  const tokens = resolveUsageValue(snapshot?.tokens, fallbackContextWindow, hasActiveSession)

  return {
    contextWindow,
    // Both halves of the reading, the way Claude Code shows it: the absolute
    // token count against the window, and the percent that count works out to.
    // The count alone means nothing without the window; the percent alone hides
    // how much room a 1M-window model actually has left.
    displayTokens: formatTokens(tokens ?? 0),
    displayPercent: formatPercent(clampContextPercent(percent)),
    strokeColor: getContextStrokeColor(percent, contextWindow !== null),
    title: formatUsageTitle({ tokens, contextWindow, percent, failed, label: snapshot?.label }),
  }
}

function resolveUsageValue(
  snapshotValue: number | null | undefined,
  fallbackContextWindow: number | null,
  hasActiveSession: boolean,
) {
  if (snapshotValue !== undefined) return snapshotValue
  return hasActiveSession || !fallbackContextWindow ? null : 0
}

function getContextStrokeColor(percent: number | null, hasContextWindow: boolean) {
  if (!hasContextWindow || percent === null) return 'var(--color-text-muted)'
  if (percent >= CONTEXT_METER.THRESHOLDS.ERROR_PERCENT) return 'var(--color-error)'
  if (percent >= CONTEXT_METER.THRESHOLDS.WARNING_PERCENT) return 'var(--color-warning)'
  return 'var(--color-success)'
}

function clampContextPercent(percent: number | null) {
  if (percent === null) return 0
  return Math.max(0, Math.min(CONTEXT_METER.THRESHOLDS.PERCENT_MAX, percent))
}

/**
 * Whole percent, except in the first one — where rounding would print a flat
 * `0%` for every reading between "nothing at all" and "a fifth of a percent".
 * That distinction is the whole meter under the turing kernel, whose bounded
 * context is genuinely a fraction of a percent of a 262k window; a Pi
 * transcript sits far above the decimal band and reads as whole numbers.
 */
function formatPercent(percent: number) {
  if (percent === 0 || percent >= 1) return String(Math.round(percent))
  return percent.toFixed(1)
}

function formatUsageTitle({ tokens, contextWindow, percent, failed, label }: UsageTitleInput) {
  // The kernel labels its own numerator: Pi measures the live transcript, the
  // turing kernel measures the context the NEXT run will carry. Without the
  // label, a turing thread's small number would read as a nearly-empty Pi
  // transcript rather than as the bounded thing it is.
  const prefix = label ?? 'Context'
  if (failed && contextWindow) {
    return `${prefix}: 0 / ${formatTokens(contextWindow)} tokens (usage unavailable)`
  }
  if (failed) return `${prefix} usage unavailable`
  if (!contextWindow) return `${prefix} usage`
  if (tokens === null || percent === null) {
    return `${prefix}: 0 / ${formatTokens(contextWindow)} tokens (0.0%)`
  }
  return `${prefix}: ${formatTokens(tokens)} / ${formatTokens(contextWindow)} tokens (${percent.toFixed(1)}%)`
}
