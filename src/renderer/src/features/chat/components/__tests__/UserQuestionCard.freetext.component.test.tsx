/**
 * A picker must never be a cage.
 *
 * The agent enumerates the paths it can see. The answer the user wants is
 * frequently the one it could not see ("neither — reuse the existing queue").
 * This card rendered a text input ONLY in `text` mode, so a user facing a
 * single- or multi-select had exactly two moves: pick something wrong, or kill
 * the run. Either way the agent never learns what they actually meant.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UserQuestionCard } from '../UserQuestionCard'
import type { PendingUserQuestionRequest } from '@shared/types/user-question'

const base: PendingUserQuestionRequest = {
  phase: 'plan',
  question: 'Which datastore should the API use?',
  answerMode: 'single-select',
  options: ['Postgres', 'SQLite'],
  allowFreeText: true,
}

describe('UserQuestionCard free text', () => {
  it('offers a text box alongside a single-select picker', () => {
    render(<UserQuestionCard request={base} onSubmit={vi.fn()} />)
    expect(screen.getByPlaceholderText('Type a different answer')).toBeInTheDocument()
    expect(screen.getByText(/None of these\?/)).toBeInTheDocument()
  })

  it('offers it alongside a multi-select too', () => {
    render(
      <UserQuestionCard request={{ ...base, answerMode: 'multi-select' }} onSubmit={vi.fn()} />,
    )
    expect(screen.getByPlaceholderText('Type a different answer')).toBeInTheDocument()
  })

  it('a typed answer WINS over the pre-selected option', async () => {
    // The whole point: if the user bothered to write something the agent did not
    // offer, sending the radio instead silently discards it.
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<UserQuestionCard request={base} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByPlaceholderText('Type a different answer'), {
      target: { value: 'neither - reuse the existing queue' },
    })
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith('neither - reuse the existing queue', []),
    )
  })

  it('still submits the selection when nothing was typed', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<UserQuestionCard request={base} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Postgres', []))
  })

  it('defaults ON when the flag is absent — a missing flag must not re-cage the picker', () => {
    // Older transcripts and any host building the request itself predate the flag.
    const { allowFreeText: _drop, ...withoutFlag } = base
    render(<UserQuestionCard request={withoutFlag} onSubmit={vi.fn()} />)
    expect(screen.getByPlaceholderText('Type a different answer')).toBeInTheDocument()
  })

  it('is suppressed only when the harness explicitly says so', () => {
    render(<UserQuestionCard request={{ ...base, allowFreeText: false }} onSubmit={vi.fn()} />)
    expect(screen.queryByPlaceholderText('Type a different answer')).not.toBeInTheDocument()
  })

  it('a pure text question is unchanged — one box, no picker prose', () => {
    render(
      <UserQuestionCard
        request={{ phase: 'plan', question: 'Name the service?' }}
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.queryByText(/None of these\?/)).not.toBeInTheDocument()
  })
})
