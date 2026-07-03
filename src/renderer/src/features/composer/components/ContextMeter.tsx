import {
  buildSubscriptionUsageSummary,
  formatUsdDisplay,
} from '@/features/auth/lib/subscription-plan'
import { useAppAuthStore } from '@/features/auth/state/app-auth-store'
import { useChatStore } from '@/features/chat/state'
import { useProviderStore } from '@/features/providers/state'
import { usePreferencesStore } from '@/features/settings/state'
import { formatContextWindow } from '@/shared/lib/format-tokens'
import { CONTEXT_METER } from '../constants/context-meter'
import { useContextUsageSnapshot } from '../hooks/useContextUsageSnapshot'
import {
  buildContextMeterValue,
  buildContextUsageRequestKey,
  findContextWindow,
} from '../lib/context-meter-view'

function getMonthlyQuotaTone(percent: number) {
  if (percent >= CONTEXT_METER.THRESHOLDS.ERROR_PERCENT) return 'var(--color-error)'
  if (percent >= CONTEXT_METER.THRESHOLDS.WARNING_PERCENT) return 'var(--color-warning)'
  return 'var(--color-success)'
}

function MonthlyQuotaStrip() {
  const subscriptionSnapshot = useAppAuthStore((state) => state.subscriptionSnapshot)
  const usage = buildSubscriptionUsageSummary(subscriptionSnapshot)
  const percent = usage.consumedPercent
  const tone = getMonthlyQuotaTone(percent)
  const roundedPercent = Math.round(percent)

  return (
    <div
      className="flex hidden h-6 min-w-0 shrink-0 items-center gap-1.5 rounded-[5px] bg-bg-secondary/40 px-2 text-[12px] text-text-secondary sm:flex"
      title={`Turing Machine quota: ${String(roundedPercent)}% used ($${formatUsdDisplay(usage.consumed)} of $${formatUsdDisplay(usage.totalBudget)})`}
    >
      <span className="text-[10px] font-medium text-text-tertiary">Quota</span>
      <div className="h-1 w-10 overflow-hidden rounded-full bg-bg-tertiary">
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-out"
          style={{ width: `${String(percent)}%`, backgroundColor: tone }}
        />
      </div>
      <span className="font-mono text-[10px] font-semibold leading-none text-text-secondary tabular-nums">
        ${formatUsdDisplay(usage.totalBudget)}
      </span>
      <span className="font-mono text-[10px] font-semibold leading-none text-text-secondary tabular-nums">
        {roundedPercent}%
      </span>
    </div>
  )
}

export function ContextMeter() {
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const activeSession = useChatStore((s) => s.activeSession)
  const selectedModel = usePreferencesStore((s) => s.settings.selectedModel)
  const providerModels = useProviderStore((s) => s.providerModels)
  const fallbackContextWindow = findContextWindow(providerModels, selectedModel)
  const requestKey = buildContextUsageRequestKey(
    activeSessionId ? String(activeSessionId) : null,
    selectedModel,
    activeSession
      ? `${String(activeSession.updatedAt)}:${String(activeSession.messages.length)}`
      : '',
  )
  const usage = useContextUsageSnapshot({ activeSessionId, selectedModel, requestKey })
  const meter = buildContextMeterValue({
    snapshot: usage.snapshot,
    fallbackContextWindow,
    hasActiveSession: Boolean(activeSessionId),
    failed: usage.failed,
  })

  return (
    <div className="flex items-center gap-1.5" title={meter.title}>
      <MonthlyQuotaStrip />
      <div className="flex h-6 min-w-0 shrink-0 items-center gap-1.5 rounded-[5px] bg-bg-secondary/40 px-2 text-[12px] text-text-secondary">
        <span
          className="font-mono text-[10px] font-semibold leading-none tabular-nums"
          style={{ color: meter.strokeColor }}
        >
          {meter.displayValue}
        </span>
        {meter.contextWindow ? (
          <span className="font-mono text-[10px] font-semibold leading-none text-text-secondary tabular-nums">
            / {formatContextWindow(meter.contextWindow)}
          </span>
        ) : null}
      </div>
    </div>
  )
}
