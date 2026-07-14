import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SidebarPrimaryActions } from '../SidebarNavigation'

describe('SidebarPrimaryActions', () => {
  it('hides Team and still opens Council of Experts', () => {
    const onOpenWaggle = vi.fn()

    render(
      <SidebarPrimaryActions
        activeView="chat"
        onNewSession={vi.fn()}
        onOpenMcp={vi.fn()}
        onOpenSkills={vi.fn()}
        onOpenWaggle={onOpenWaggle}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Team' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Council of Experts' }))

    expect(onOpenWaggle).toHaveBeenCalledOnce()
  })
})
