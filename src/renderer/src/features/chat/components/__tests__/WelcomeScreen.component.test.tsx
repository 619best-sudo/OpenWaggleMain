import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WelcomeScreen } from '../WelcomeScreen'

describe('WelcomeScreen', () => {
  it('renders the redesigned empty state with a selected project', () => {
    const onRetry = vi.fn()

    render(
      <WelcomeScreen
        projectPath="/tmp/turing-test"
        hasProject={true}
        recentProjects={['/tmp/turing-test', '/tmp/other-repo']}
        onOpenProject={vi.fn()}
        onSelectProjectPath={vi.fn()}
        onRetry={onRetry}
      />,
    )

    expect(screen.getByText('What are we building?')).toBeInTheDocument()
    expect(screen.getByText('Start typing to build, refactor, or debug.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'turing-test' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /build a coding game in this repo/i }))
    expect(onRetry).toHaveBeenCalledWith('Build a coding game in this repo')
  })

  it('renders the fallback project picker when no project is selected', () => {
    render(
      <WelcomeScreen
        projectPath={null}
        hasProject={false}
        recentProjects={[]}
        onOpenProject={vi.fn()}
      />,
    )

    expect(screen.getByText('Select a project folder to get started')).toBeInTheDocument()
  })
})
