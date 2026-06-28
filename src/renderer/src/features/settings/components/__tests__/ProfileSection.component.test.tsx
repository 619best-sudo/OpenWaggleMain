import { fireEvent, render, screen } from '@testing-library/react'
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
      },
      signOut: vi.fn(),
    })
  })

  it('renders the minimal subscription summary', () => {
    render(<ProfileSection />)

    expect(screen.getByText('Subscription')).toBeInTheDocument()
    expect(screen.getByText('Pro')).toBeInTheDocument()
    expect(screen.getByText('Monthly billing')).toBeInTheDocument()
    expect(screen.getByText('Renews on 1 Jul 2026')).toBeInTheDocument()
    expect(screen.queryByText(/seats/i)).not.toBeInTheDocument()
  })

  it('updates the daily usage detail when a heatmap cell is hovered', () => {
    render(<ProfileSection />)

    expect(screen.getByText('Most active: Fri, Jun 19 consumed $7')).toBeInTheDocument()

    const cell = screen.getByRole('button', { name: 'Thu, Jun 18 consumed $3' })
    fireEvent.mouseEnter(cell)

    expect(screen.getByText('Thu, Jun 18 consumed $3')).toBeInTheDocument()

    fireEvent.mouseLeave(cell)

    expect(screen.getByText('Most active: Fri, Jun 19 consumed $7')).toBeInTheDocument()
  })
})
