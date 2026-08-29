import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SidebarBrandArea } from '../SidebarNavigation'

describe('SidebarBrandArea', () => {
  it('collapses the sidebar from its own header control', () => {
    const onCollapse = vi.fn()

    render(<SidebarBrandArea isFullscreen={false} onCollapse={onCollapse} />)

    // Collapsing used to be reachable only through Mod+B, while re-opening had
    // a button in the header — the control existed in one direction only.
    fireEvent.click(screen.getByRole('button', { name: 'Hide sidebar' }))

    expect(onCollapse).toHaveBeenCalledOnce()
  })
})
