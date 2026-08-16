/**
 * A question can carry files in both directions.
 *
 * Some questions are not answerable in prose. "Send me the mockup" answered with
 * a paragraph describing the mockup is a worse outcome than not asking — and
 * before this, the card had no way for the user to send anything back, so that
 * paragraph was the only possible answer.
 *
 * The other direction matters as much: a question about something visual ("is
 * this the misalignment you meant?") is cheap to answer with the screenshot on
 * screen and near-impossible from a file path.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PendingUserQuestionRequest } from '@shared/types/user-question'
import { UserQuestionCard } from '../UserQuestionCard'

const PROJECT = '/tmp/project'

const prepareAttachments = vi.fn()

beforeEach(() => {
  prepareAttachments.mockReset()
  // The staging round trip the composer and plan-review card also use: picked
  // files are copied into the project's store and come back with stable paths.
  Object.defineProperty(window, 'api', {
    value: { prepareAttachments },
    configurable: true,
    writable: true,
  })
})

const askForFile: PendingUserQuestionRequest = {
  phase: 'perform',
  question: 'Send me the hero mockup',
  requestAttachments: { mode: 'required', hint: 'the Figma export of the hero' },
}

function pickFile(name = 'hero.png', type = 'image/png') {
  const input = screen.getByTestId('user-question-file-input')
  fireEvent.change(input, { target: { files: [new File(['x'], name, { type })] } })
}

describe('UserQuestionCard attachments', () => {
  it('shows the agent&apos;s own attachments as images, not paths', () => {
    render(
      <UserQuestionCard
        request={{
          phase: 'perfect',
          question: 'Is this the misalignment you meant?',
          attachments: [
            { path: '/abs/shot.png', mimeType: 'image/png', note: 'what I captured' },
          ],
        }}
        onSubmit={vi.fn()}
      />,
    )
    const image = screen.getByRole('img', { name: 'what I captured' })
    expect(image).toHaveAttribute('src', 'file:///abs/shot.png')
    expect(screen.getByText('what I captured')).toBeInTheDocument()
  })

  it('falls back to a named chip for a non-image attachment', () => {
    render(
      <UserQuestionCard
        request={{
          phase: 'perform',
          question: 'Does this export look right?',
          attachments: [{ path: '/abs/rows.csv', mimeType: 'text/csv' }],
        }}
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.getByText('rows.csv')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('renders the picker with the agent&apos;s own wording for what it wants', () => {
    render(<UserQuestionCard request={askForFile} onSubmit={vi.fn()} projectPath={PROJECT} />)
    expect(screen.getByText(/the Figma export of the hero/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /attach file/i })).toBeEnabled()
  })

  it('shows no picker when the agent did not ask for a file', () => {
    render(
      <UserQuestionCard
        request={{ phase: 'plan', question: 'Postgres or SQLite?' }}
        onSubmit={vi.fn()}
        projectPath={PROJECT}
      />,
    )
    expect(screen.queryByTestId('user-question-file-input')).not.toBeInTheDocument()
  })

  it('cannot attach without a project — there is nowhere to stage the file', () => {
    render(<UserQuestionCard request={askForFile} onSubmit={vi.fn()} />)
    expect(screen.getByRole('button', { name: /attach file/i })).toBeDisabled()
  })

  it('a required file blocks submission until one is attached', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<UserQuestionCard request={askForFile} onSubmit={onSubmit} projectPath={PROJECT} />)

    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    await waitFor(() =>
      expect(screen.getByText(/Attach the Figma export of the hero to continue\./)).toBeInTheDocument(),
    )
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('stages a picked file and submits it alongside the answer', async () => {
    prepareAttachments.mockResolvedValue([
      { path: '/tmp/project/.attachments/hero.png', mimeType: 'image/png' },
    ])
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<UserQuestionCard request={askForFile} onSubmit={onSubmit} projectPath={PROJECT} />)

    pickFile()
    await waitFor(() => expect(screen.getByText('hero.png')).toBeInTheDocument())
    expect(prepareAttachments).toHaveBeenCalledWith(PROJECT, expect.any(Array))

    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith('', [
        { path: '/tmp/project/.attachments/hero.png', mimeType: 'image/png' },
      ]),
    )
  })

  it('files alone are a valid answer — empty text is not an error', async () => {
    // "Send me the mockup" is answered by the file. Demanding prose alongside it
    // would be pedantry, and the read-back has to name what was actually sent.
    prepareAttachments.mockResolvedValue([{ path: '/tmp/p/.a/hero.png', mimeType: 'image/png' }])
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<UserQuestionCard request={askForFile} onSubmit={onSubmit} projectPath={PROJECT} />)

    pickFile()
    await waitFor(() => expect(screen.getByText('hero.png')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => expect(screen.getByText('Your answer')).toBeInTheDocument())
    expect(screen.getByText('hero.png')).toBeInTheDocument()
    expect(onSubmit).toHaveBeenCalledWith('', expect.any(Array))
  })

  it('the answer REPLACES the inputs — never both on screen at once', async () => {
    // The previous card kept the disabled picker, the typed value and a boxed
    // copy of the same answer visible together: the answer said three times, in
    // a panel inside a panel inside the card's own frame.
    prepareAttachments.mockResolvedValue([{ path: '/tmp/p/.a/hero.png', mimeType: 'image/png' }])
    render(<UserQuestionCard request={askForFile} onSubmit={vi.fn()} projectPath={PROJECT} />)

    pickFile()
    await waitFor(() => expect(screen.getByText('hero.png')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => expect(screen.getByText('Your answer')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /attach file/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /continue/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('user-question-file-input')).not.toBeInTheDocument()
  })

  it('an optional file lets a plain text answer through', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <UserQuestionCard
        request={{
          phase: 'perform',
          question: 'Which colour scheme?',
          requestAttachments: { mode: 'optional' },
        }}
        onSubmit={onSubmit}
        projectPath={PROJECT}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Type your answer'), {
      target: { value: 'the dark one' },
    })
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('the dark one', []))
  })

  it('a staged file can be removed before submitting', async () => {
    prepareAttachments.mockResolvedValue([{ path: '/tmp/p/.a/hero.png', mimeType: 'image/png' }])
    render(<UserQuestionCard request={askForFile} onSubmit={vi.fn()} projectPath={PROJECT} />)

    pickFile()
    await waitFor(() => expect(screen.getByText('hero.png')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Remove \/tmp\/p\/\.a\/hero\.png/ }))
    await waitFor(() => expect(screen.queryByText('hero.png')).not.toBeInTheDocument())
  })

  it('a staging failure is surfaced rather than silently dropping the file', async () => {
    prepareAttachments.mockRejectedValue(new Error('disk is full'))
    render(<UserQuestionCard request={askForFile} onSubmit={vi.fn()} projectPath={PROJECT} />)
    pickFile()
    await waitFor(() => expect(screen.getByText('disk is full')).toBeInTheDocument())
  })
})
