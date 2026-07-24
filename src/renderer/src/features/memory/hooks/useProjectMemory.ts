import { useEffect, useMemo } from 'react'
import { createBillingCheckoutSession } from '@/features/auth/lib/subscription-client'
import { DEFAULT_SUBSCRIPTION_PLAN_TIER } from '@/features/auth/lib/subscription-plan'
import { useAppAuth } from '@/features/auth/state/app-auth-store'
import { useChat } from '@/features/chat/hooks'
import { useProject } from '@/features/sessions/hooks'
import { usePreferencesStore } from '@/features/settings/state'
import { api } from '@/shared/lib/ipc'
import { createRendererLogger } from '@/shared/lib/logger'
import { useUIStore } from '@/shell/ui-store'
import { useProjectMemoryStore } from '../state/project-memory-store'

const logger = createRendererLogger('project-memory')
const ACTIVE_POLL_INTERVAL_MS = 1_000

function formatLastSyncLabel(timestamp?: number) {
  if (!timestamp) return 'Not synced yet'
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return 'Not synced yet'
  return date.toLocaleString()
}

export function useProjectMemory() {
  const { activeSession } = useChat()
  const { user, subscriptionSnapshot } = useAppAuth()
  const { projectPath } = useProject()
  const selectedModel = usePreferencesStore((state) => state.settings.selectedModel)
  const showToast = useUIStore((state) => state.showToast)
  const status = useProjectMemoryStore((state) => state.status)
  const isLoading = useProjectMemoryStore((state) => state.isLoading)
  const error = useProjectMemoryStore((state) => state.error)
  const refreshStatus = useProjectMemoryStore((state) => state.refreshStatus)
  const refreshMemory = useProjectMemoryStore((state) => state.refreshMemory)
  const clear = useProjectMemoryStore((state) => state.clear)

  const isEligible = useMemo(() => {
    if (subscriptionSnapshot) return subscriptionSnapshot.tier.key !== 'free'
    return Boolean(user?.isSubscribed)
  }, [subscriptionSnapshot, user?.isSubscribed])

  const isRefreshing = isLoading || Boolean(status?.isRefreshing)
  const isLocked = Boolean(projectPath) && !isEligible
  const lastSyncLabel = formatLastSyncLabel(status?.lastFullSyncCompletedAt)

  useEffect(() => {
    if (!projectPath) {
      clear()
      return
    }
    void refreshStatus(projectPath, selectedModel)
  }, [clear, projectPath, refreshStatus, selectedModel])

  useEffect(() => {
    if (!projectPath || !status?.isRefreshing) {
      return
    }
    const timer = window.setInterval(() => {
      void refreshStatus(projectPath, selectedModel, { silent: true })
    }, ACTIVE_POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [projectPath, refreshStatus, selectedModel, status?.isRefreshing])

  useEffect(() => {
    if (!error) return
    logger.warn('Failed to update project memory status', { error })
  }, [error])

  async function openUpgradeFlow() {
    const accessToken = user?.accessToken
    if (!accessToken) {
      showToast('Sign in again to start checkout.', 'error')
      return
    }
    try {
      const session = await createBillingCheckoutSession(accessToken, {
        tierKey: DEFAULT_SUBSCRIPTION_PLAN_TIER,
        billingCycle: 'monthly',
      })
      await api.openBillingOverlay(session.url)
    } catch (upgradeError) {
      showToast(
        upgradeError instanceof Error
          ? upgradeError.message
          : 'Failed to open the billing overlay.',
        'error',
      )
    }
  }

  async function handleRefresh() {
    if (!projectPath) return
    if (!isEligible) {
      await openUpgradeFlow()
      return
    }
    try {
      await refreshMemory(projectPath, selectedModel, activeSession?.piSessionId)
      showToast('Memory refreshed.', 'success')
    } catch (refreshError) {
      showToast(
        refreshError instanceof Error ? refreshError.message : 'Failed to refresh project memory.',
        'error',
      )
    }
  }

  return {
    hasProject: Boolean(projectPath),
    isEligible,
    isLocked,
    isRefreshing,
    isEnabled: Boolean(status?.isEnabled),
    lastSyncLabel,
    onRefresh: handleRefresh,
  }
}
