import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SidebarPrimaryActions } from '../SidebarNavigation'

describe('SidebarPrimaryActions Team', () => {
  it('renders Team above Panel and opens the teammate route', () => {
    const onOpenTeammates = vi.fn()
    const onOpenWaggle = vi.fn()

    render(
      <SidebarPrimaryActions
        activeView="chat"
        onNewSession={vi.fn()}
        onOpenMcp={vi.fn()}
        onOpenSkills={vi.fn()}
        onOpenTeammates={onOpenTeammates}
        onOpenWaggle={onOpenWaggle}
      />,
    )

    const buttons = screen.getAllByRole('button')
    const teamNewButton = screen.getByRole('button', { name: 'Team' })
    const teamButton = screen.getByRole('button', { name: 'Panel' })

    expect(buttons.indexOf(teamNewButton)).toBeLessThan(buttons.indexOf(teamButton))

    fireEvent.click(teamNewButton)
    fireEvent.click(teamButton)

    expect(onOpenTeammates).toHaveBeenCalledOnce()
    expect(onOpenWaggle).toHaveBeenCalledOnce()
  })
})
