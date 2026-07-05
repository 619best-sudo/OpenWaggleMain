import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { useAppAuthMock } = vi.hoisted(() => ({
  useAppAuthMock: vi.fn(),
}))

vi.mock('@/features/auth/state/app-auth-store', () => ({
  useAppAuth: () => useAppAuthMock(),
}))

import { ProfileSection } from '../sections/ProfileSection'

describe('ProfileSection', () => {
  beforeEach(() => {
    useAppAuthMock.mockReset()
    useAppAuthMock.mockReturnValue({
      user: {
        id: 'user-1',
        name: '619best',
        email: '619best@gmail.com',
        isSubscribed: true,
        subscriptionTier: 'pro',
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

  it('shows backend-backed cycle, price, and quota summary cards', () => {
    render(<ProfileSection />)

    expect(screen.getAllByText('Pro').length).toBeGreaterThan(0)
    expect(screen.getByText('Cycle')).toBeInTheDocument()
    expect(screen.getByText('Price')).toBeInTheDocument()
    expect(screen.getByText('$50')).toBeInTheDocument()
    expect(screen.getByText('Turing Quota')).toBeInTheDocument()
    expect(screen.getByText('$30')).toBeInTheDocument()
    expect(screen.getByText('Tokens Used')).toBeInTheDocument()
    expect(screen.getByText('2.2k')).toBeInTheDocument()
    expect(screen.getByText('650 in / 280 out')).toBeInTheDocument()
    expect(screen.getAllByText('Renews Jul 1, 2026').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Leaderboard').length).toBeGreaterThan(0)
    expect(screen.getByText('Overall Activity')).toBeInTheDocument()
    expect(screen.getByText('Tokens Consumed')).toBeInTheDocument()
    expect(screen.getByText('Contribution')).toBeInTheDocument()
    expect(screen.getByText('$0.0017')).toBeInTheDocument()
    expect(screen.getByText('<0.01% used')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Thu, Jun 18 used $0.0017 across 1 requests' }),
    ).toBeInTheDocument()
  })

  it('does not invent plan details when the backend snapshot is unavailable', () => {
    useAppAuthMock.mockReturnValue({
      user: {
        id: 'user-1',
        name: '619best',
        email: '619best@gmail.com',
        isSubscribed: true,
        subscriptionTier: 'free',
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
