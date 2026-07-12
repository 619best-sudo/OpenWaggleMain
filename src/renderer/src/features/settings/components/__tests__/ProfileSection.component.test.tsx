import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createBillingCheckoutSessionMock,
  createBillingPortalSessionMock,
  fetchBillingTierCatalogMock,
  mockEnv,
  openBillingOverlayMock,
  openExternalMock,
  reconcileBillingCheckoutSessionMock,
  refreshUsageSnapshotsMock,
  useAppAuthMock,
} = vi.hoisted(() => ({
  createBillingCheckoutSessionMock: vi.fn(),
  createBillingPortalSessionMock: vi.fn(),
  fetchBillingTierCatalogMock: vi.fn(),
  mockEnv: {
    appAuthBaseUrl: 'http://127.0.0.1:3001',
    accountWebsiteUrl: 'https://account.turing.app',
    isDevelopment: true,
    isElectron: true,
    logLevel: 'info',
  },
  openBillingOverlayMock: vi.fn(),
  openExternalMock: vi.fn(),
  reconcileBillingCheckoutSessionMock: vi.fn(),
  refreshUsageSnapshotsMock: vi.fn(),
  useAppAuthMock: vi.fn(),
}))

vi.mock('@/env', () => ({
  env: mockEnv,
}))

vi.mock('@/features/auth/state/app-auth-store', () => ({
  useAppAuth: () => useAppAuthMock(),
  refreshUsageSnapshotsForAuthenticatedUser: refreshUsageSnapshotsMock,
  useAppAuthStore: {
    getState: () => ({
      user: useAppAuthMock()?.user ?? null,
      subscriptionSnapshot: useAppAuthMock()?.subscriptionSnapshot ?? null,
    }),
  },
}))

vi.mock('@/features/auth/lib/subscription-client', () => ({
  createBillingCheckoutSession: createBillingCheckoutSessionMock,
  createBillingPortalSession: createBillingPortalSessionMock,
  fetchBillingTierCatalog: fetchBillingTierCatalogMock,
  reconcileBillingCheckoutSession: reconcileBillingCheckoutSessionMock,
}))

vi.mock('@/shared/lib/ipc', () => ({
  api: {
    openBillingOverlay: openBillingOverlayMock,
    openExternal: openExternalMock,
  },
}))

import { ProfileSection } from '../sections/ProfileSection'

describe('ProfileSection', () => {
  beforeEach(() => {
    useAppAuthMock.mockReset()
    createBillingCheckoutSessionMock.mockReset()
    createBillingPortalSessionMock.mockReset()
    fetchBillingTierCatalogMock.mockReset()
    openBillingOverlayMock.mockReset()
    openExternalMock.mockReset()
    reconcileBillingCheckoutSessionMock.mockReset()
    refreshUsageSnapshotsMock.mockReset()
    createBillingCheckoutSessionMock.mockResolvedValue({
      url: 'https://checkout.dodopayments.com/session/cks_openwaggle',
      sessionId: 'cks_openwaggle',
    })
    createBillingPortalSessionMock.mockResolvedValue({
      url: 'https://customer.dodopayments.com/session/cps_openwaggle',
    })
    openBillingOverlayMock.mockResolvedValue({
      finalUrl: 'http://localhost:1420/settings/profile?status=active',
      matchedReturnUrl: true,
    })
    openExternalMock.mockResolvedValue(undefined)
    reconcileBillingCheckoutSessionMock.mockResolvedValue({
      synced: true,
      checkoutSessionId: 'cks_openwaggle',
    })
    refreshUsageSnapshotsMock.mockResolvedValue(undefined)
    fetchBillingTierCatalogMock.mockResolvedValue([
      {
        key: 'pro',
        name: 'Pro',
        descriptionMarkdown:
          'For serious daily usage with strong value on Turing Machine spend.\\n\\n- Pay $19.99 per month\\n- Receive $50 of monthly Turing Machine budget\\n- Best for focused solo builders and regular coding sessions',
        pricing: {
          monthly: {
            billingCycle: 'monthly',
            originalCents: 5000,
            discountedCents: null,
            finalCents: 5000,
            discountPercent: 0,
          },
          yearly: {
            billingCycle: 'yearly',
            originalCents: 50000,
            discountedCents: 45000,
            finalCents: 45000,
            discountPercent: 10,
          },
        },
        limits: {
          turingMachineQuotaUsdCents: 3000,
        },
      },
      {
        key: 'team',
        name: 'Team',
        descriptionMarkdown:
          'High-capacity plan for heavy usage and long-running workflows.\\n\\n- Pay $39.99 per month\\n- Receive $100 of monthly Turing Machine budget\\n- Best for power users, bigger runs, and always-on usage',
        pricing: {
          monthly: {
            billingCycle: 'monthly',
            originalCents: 12000,
            discountedCents: null,
            finalCents: 12000,
            discountPercent: 0,
          },
          yearly: {
            billingCycle: 'yearly',
            originalCents: 120000,
            discountedCents: 108000,
            finalCents: 108000,
            discountPercent: 10,
          },
        },
        limits: {
          turingMachineQuotaUsdCents: 10000,
        },
      },
    ])
    mockEnv.accountWebsiteUrl = 'https://account.turing.app'
    useAppAuthMock.mockReturnValue({
      user: {
        id: 'user-1',
        name: '619best',
        email: '619best@gmail.com',
        isSubscribed: true,
        subscriptionTier: 'pro',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
      subscriptionSnapshot: {
        tier: {
          key: 'pro',
          name: 'Pro',
          descriptionMarkdown:
            'Individual monthly plan with a dedicated Turing Machine spend allocation.',
          turingMachineQuotaUsdCents: 3000,
        },
        subscription: {
          status: 'active',
          billingCycle: 'monthly',
          currentPeriodStart: '2026-06-01T00:00:00.000Z',
          currentPeriodEnd: '2026-07-01T00:00:00.000Z',
          cancelAtPeriodEnd: false,
        },
        pricing: {
          billingCycle: 'monthly',
          originalCents: 5000,
          discountedCents: null,
          finalCents: 5000,
          discountPercent: 0,
        },
        turingMachine: {
          quotaUsdCents: 3000,
          quotaUsd: 30,
          consumedUsdCents: 0,
          consumedUsd: 0.0017,
          remainingUsdCents: 3000,
          remainingUsd: 29.9983,
          percentUsed: 40,
          inputTokens: 650,
          outputTokens: 280,
        },
      },
      turingMachineActivity: {
        months: 4,
        startDate: '2026-03-01',
        endDate: '2026-06-30',
        days: [
          {
            date: '2026-06-18',
            requestCount: 1,
            usdCents: 0,
            usd: 0.0017,
            inputTokens: 250,
            outputTokens: 100,
          },
          {
            date: '2026-06-19',
            requestCount: 2,
            usdCents: 0,
            usd: 0.0032,
            inputTokens: 400,
            outputTokens: 180,
          },
        ],
      },
      leaderboardSnapshot: {
        algorithm: {
          overall: {
            label: 'Overall ranking',
            formula: 'overall formula',
            maxScore: 8200,
            caps: { outputTokens: 3200, contribution: 2500, github: 2500 },
            notes: [],
          },
          metrics: {},
        },
        overall: {
          top: [],
          user: { userId: 'user-1', name: '619best', score: 220, rank: 12 },
        },
        tokens: {
          top: [],
          user: { userId: 'user-1', name: '619best', score: 2200, rank: 7 },
        },
        contribution: {
          top: [],
          user: { userId: 'user-1', name: '619best', score: 0, rank: 1 },
        },
        github: {
          top: [],
          user: {
            userId: 'user-1',
            name: '619best',
            score: 152,
            rank: 4,
            breakdown: {
              publicRepoCount: 8,
              totalStars: 21,
              totalForks: 5,
              activeRepoCount: 3,
            },
          },
        },
      },
      githubSyncStatus: {
        state: 'synced',
        message: 'GitHub repo stats are up to date.',
        syncedAt: '2026-06-30T10:30:00.000Z',
        username: '619best',
      },
      syncGithubStats: vi.fn(),
      signOut: vi.fn(),
    })
  })

  it('shows the plan badge in the account header', () => {
    render(<ProfileSection />)

    expect(screen.getAllByText('Pro').length).toBeGreaterThan(0)
    expect(screen.queryByText(/seats/i)).not.toBeInTheDocument()
  })

  it('shows backend-backed cycle, price, and quota summary cards', async () => {
    render(<ProfileSection />)

    await screen.findByText('Team')
    expect(screen.getAllByText('Pro').length).toBeGreaterThan(0)
    expect(screen.getByText('Current')).toBeInTheDocument()
    expect(screen.getByText('Current plan')).toBeInTheDocument()
    expect(screen.getByText('Receive $50 of monthly Turing Machine budget')).toBeInTheDocument()
    expect(screen.getByText('Receive $100 of monthly Turing Machine budget')).toBeInTheDocument()
    expect(screen.getByText('Upgrade Plan')).toBeInTheDocument()
    expect(screen.getAllByText('$50').length).toBeGreaterThan(0)
    expect(screen.getAllByText('$30').length).toBeGreaterThan(0)
    expect(screen.getByText('Tokens Used')).toBeInTheDocument()
    expect(screen.getAllByText('2.2k').length).toBeGreaterThan(0)
    expect(screen.getByText('650 in / 280 out')).toBeInTheDocument()
    expect(screen.getAllByText('Renews Jul 1, 2026').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Leaderboard').length).toBeGreaterThan(0)
    expect(screen.getByText('Overall Activity')).toBeInTheDocument()
    expect(screen.getByText('Tokens Consumed')).toBeInTheDocument()
    expect(screen.getByText('Contribution')).toBeInTheDocument()
    expect(screen.getByText('Billing')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'monthly' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'yearly' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Upgrade to/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Manage billing' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh status' })).toBeInTheDocument()
    expect(screen.getByText('$0.0017')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Thu, Jun 18 used $0.0017 across 1 requests' }),
    ).toBeInTheDocument()
  })

  it('opens account and backend-created Dodo portal links through the Electron IPC bridge', async () => {
    render(<ProfileSection />)

    fireEvent.click(screen.getByRole('button', { name: 'My account' }))
    await waitFor(() => expect(openExternalMock).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'Manage billing' }))
    await waitFor(() => expect(openExternalMock).toHaveBeenCalledTimes(2))

    expect(openExternalMock).toHaveBeenNthCalledWith(1, 'https://account.turing.app')
    expect(openExternalMock).toHaveBeenNthCalledWith(
      2,
      'https://customer.dodopayments.com/session/cps_openwaggle',
    )
    expect(createBillingPortalSessionMock).toHaveBeenCalledWith('access-token')
  })

  it('starts backend checkout for free users', async () => {
    useAppAuthMock.mockReturnValue({
      user: {
        id: 'user-1',
        name: '619best',
        email: '619best@gmail.com',
        isSubscribed: false,
        subscriptionTier: 'free',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
      subscriptionSnapshot: {
        tier: {
          key: 'free',
          name: 'Free',
          descriptionMarkdown: null,
          turingMachineQuotaUsdCents: 0,
        },
        subscription: {
          status: 'active',
          billingCycle: 'monthly',
          currentPeriodStart: '2026-06-01T00:00:00.000Z',
          currentPeriodEnd: '2026-07-01T00:00:00.000Z',
          cancelAtPeriodEnd: false,
        },
        pricing: {
          billingCycle: 'monthly',
          originalCents: 0,
          discountedCents: null,
          finalCents: 0,
          discountPercent: 0,
        },
        turingMachine: {
          quotaUsdCents: 0,
          consumedUsdCents: 0,
          remainingUsdCents: 0,
          percentUsed: 0,
        },
      },
      turingMachineActivity: null,
      leaderboardSnapshot: null,
      githubSyncStatus: {
        state: 'idle',
        message: 'Run a sync to pull GitHub repo stats into your profile.',
        syncedAt: null,
        username: null,
      },
      syncGithubStats: vi.fn(),
      signOut: vi.fn(),
    })

    render(<ProfileSection />)

    await screen.findByText('Team')
    fireEvent.click(screen.getByRole('button', { name: /Upgrade to/i }))

    await waitFor(() => expect(createBillingCheckoutSessionMock).toHaveBeenCalledTimes(1))
    expect(createBillingCheckoutSessionMock).toHaveBeenCalledWith('access-token', {
      tierKey: 'pro',
      billingCycle: 'monthly',
    })
    expect(openBillingOverlayMock).toHaveBeenCalledWith(
      'https://checkout.dodopayments.com/session/cks_openwaggle',
    )
    expect(openExternalMock).not.toHaveBeenCalled()
  })

  it('lets the user choose yearly billing and a different checkout tier', async () => {
    useAppAuthMock.mockReturnValue({
      user: {
        id: 'user-1',
        name: '619best',
        email: '619best@gmail.com',
        isSubscribed: false,
        subscriptionTier: 'free',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
      subscriptionSnapshot: null,
      turingMachineActivity: null,
      leaderboardSnapshot: null,
      githubSyncStatus: {
        state: 'idle',
        message: 'Run a sync to pull GitHub repo stats into your profile.',
        syncedAt: null,
        username: null,
      },
      syncGithubStats: vi.fn(),
      signOut: vi.fn(),
    })

    render(<ProfileSection />)

    await screen.findByText('Team')
    fireEvent.click(screen.getByRole('button', { name: 'yearly' }))
    fireEvent.click(screen.getByRole('button', { name: /Team/i }))
    fireEvent.click(screen.getByRole('button', { name: /Upgrade to/i }))

    await waitFor(() => expect(createBillingCheckoutSessionMock).toHaveBeenCalledTimes(1))
    expect(createBillingCheckoutSessionMock).toHaveBeenCalledWith('access-token', {
      tierKey: 'team',
      billingCycle: 'yearly',
    })
  })

  it('reconciles the pending checkout session when focus returns after browser checkout', async () => {
    render(<ProfileSection />)

    await screen.findByText('Team')
    fireEvent.click(screen.getByRole('button', { name: /Upgrade to/i }))

    await waitFor(() => expect(createBillingCheckoutSessionMock).toHaveBeenCalledTimes(1))
    window.dispatchEvent(new Event('focus'))

    await waitFor(() =>
      expect(reconcileBillingCheckoutSessionMock).toHaveBeenCalledWith(
        'access-token',
        'cks_openwaggle',
      ),
    )
  })

  it('refreshes the subscription snapshot on demand', async () => {
    render(<ProfileSection />)

    fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }))

    await waitFor(() => expect(refreshUsageSnapshotsMock).toHaveBeenCalledTimes(1))
    expect(refreshUsageSnapshotsMock).toHaveBeenCalledWith({ includeLeaderboard: true })
  })

  it('does not invent plan details when the backend snapshot is unavailable', () => {
    useAppAuthMock.mockReturnValue({
      user: {
        id: 'user-1',
        name: '619best',
        email: '619best@gmail.com',
        isSubscribed: true,
        subscriptionTier: 'free',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
      subscriptionSnapshot: null,
      turingMachineActivity: null,
      leaderboardSnapshot: null,
      githubSyncStatus: {
        state: 'idle',
        message: 'Run a sync to pull GitHub repo stats into your profile.',
        syncedAt: null,
        username: null,
      },
      syncGithubStats: vi.fn(),
      signOut: vi.fn(),
    })

    render(<ProfileSection />)

    expect(screen.getAllByText('Subscription').length).toBeGreaterThan(0)
    expect(screen.queryByText('Free')).not.toBeInTheDocument()
  })
})
