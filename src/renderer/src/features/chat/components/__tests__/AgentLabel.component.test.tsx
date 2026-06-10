import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AgentLabel } from '../AgentLabel'

describe('AgentLabel', () => {
  it('renders waggle label when waggle provided', () => {
    render(<AgentLabel waggle={{ agentLabel: 'Architect', agentColor: 'blue' }} />)
    const el = screen.getByText(/Architect/)
    expect(el).toBeInTheDocument()
  })

  it('renders nothing when waggle not provided', () => {
    const { container } = render(<AgentLabel />)
    expect(container.firstChild).toBeNull()
  })

  it('uses a neutral avatar container', () => {
    const { container } = render(
      <AgentLabel waggle={{ agentLabel: 'Reviewer', agentColor: 'amber' }} />,
    )
    const iconContainer = container.querySelector('[aria-hidden="true"]')
    expect(iconContainer?.className).toContain('bg-bg-tertiary/55')
  })
})
