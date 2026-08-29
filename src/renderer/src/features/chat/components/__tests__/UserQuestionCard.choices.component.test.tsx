/**
 * The trade-offs the agent attached to each option have to survive all the way to
 * the screen. They used to be dropped at the IPC boundary — the harness sent
 * `choices` with a description and a recommendation, the shared type only carried
 * `options: string[]`, and the user was handed bare labels: exactly the "what
 * should I do?" the choices existed to prevent.
 */

import type { PendingUserQuestionRequest } from '@shared/types/user-question'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UserQuestionCard } from '../UserQuestionCard'

const request: PendingUserQuestionRequest = {
  phase: 'plan',
  question: 'Which datastore should the API use?',
  reason: 'It decides the migration story and cannot be cheaply undone later.',
  answerMode: 'single-select',
  options: ['Postgres', 'SQLite'],
  choices: [
    {
      label: 'Postgres',
      description: 'Migrations included; needs a running service',
      recommended: true,
    },
    { label: 'SQLite', description: 'Zero setup; painful once you need concurrency' },
  ],
}

describe('UserQuestionCard choices', () => {
  it('shows each option with its trade-off and marks the recommendation', () => {
    render(<UserQuestionCard request={request} onSubmit={vi.fn()} />)

    expect(screen.getByText('Postgres')).toBeInTheDocument()
    expect(screen.getByText('Migrations included; needs a running service')).toBeInTheDocument()
    expect(screen.getByText('Zero setup; painful once you need concurrency')).toBeInTheDocument()
    expect(screen.getByText('Recommended')).toBeInTheDocument()
  })

  it('renders labels that carry no trade-off, so an option is never dropped', () => {
    render(
      <UserQuestionCard
        request={{ ...request, choices: [{ label: 'Postgres', description: 'Needs a service' }] }}
        onSubmit={vi.fn()}
      />,
    )
    // SQLite has no `choices` entry; it must still be offered.
    expect(screen.getByText('SQLite')).toBeInTheDocument()
    expect(screen.queryByText('Recommended')).not.toBeInTheDocument()
  })

  it('still works for a host that only sends labels', () => {
    const { options, ...bare } = request
    render(
      <UserQuestionCard request={{ ...bare, options, choices: undefined }} onSubmit={vi.fn()} />,
    )
    expect(screen.getByText('Postgres')).toBeInTheDocument()
    expect(screen.getByText('SQLite')).toBeInTheDocument()
  })

  it('shows the trade-offs in multi-select too', () => {
    render(
      <UserQuestionCard request={{ ...request, answerMode: 'multi-select' }} onSubmit={vi.fn()} />,
    )
    expect(screen.getByText('Migrations included; needs a running service')).toBeInTheDocument()
    expect(screen.getByLabelText('Postgres · Recommended')).toBeInTheDocument()
  })
})
