import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatErrorDisplay } from '../ChatErrorDisplay'

describe('ChatErrorDisplay', () => {
  it('renders a dismiss-only error card with suggestion text', () => {
    render(
      <ChatErrorDisplay
        error={new Error('Something went wrong')}
        dismissedError={null}
        sessionId={null}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dismiss error notice' })).toBeInTheDocument()
    expect(screen.queryByText(/show details/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /copy/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /report/i })).not.toBeInTheDocument()
  })

  it('dismisses the error notice from the close button', () => {
    const onDismiss = vi.fn()

    render(
      <ChatErrorDisplay
        error={new Error('Something went wrong')}
        dismissedError={null}
        sessionId={null}
        onDismiss={onDismiss}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss error notice' }))

    expect(onDismiss).toHaveBeenCalledWith('Something went wrong')
  })
})
