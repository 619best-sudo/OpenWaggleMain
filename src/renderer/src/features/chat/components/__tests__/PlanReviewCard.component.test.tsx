import type { PendingPlanReviewRequest } from '@shared/types/plan-review'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlanReviewCard } from '../PlanReviewCard'

const prepareAttachments = vi.fn()

beforeEach(() => {
  prepareAttachments.mockReset()
  vi.stubGlobal('window', Object.assign(window, { api: { prepareAttachments } }))
})

function request(over: Partial<PendingPlanReviewRequest> = {}): PendingPlanReviewRequest {
  return {
    planReviewId: 'review-1',
    revision: 1,
    task: 'add a header',
    revisionsRemaining: 3,
    planSet: {
      plans: [
        {
          id: 'plan-1',
          title: 'Ship it',
          summary: '',
          tasks: [
            {
              id: 't1',
              order: 1,
              title: 'Add the header',
              summary: 'new component',
              files: ['src/Header.tsx'],
              fileMutations: { 'src/Header.tsx': 'write' },
              complexity: 'medium',
              verification: 'renders at 375px',
            },
            {
              id: 't2',
              order: 2,
              title: 'Wire it in',
              summary: 'import + mount',
              files: ['src/Page.tsx'],
              fileMutations: { 'src/Page.tsx': 'edit' },
              complexity: 'low',
            },
          ],
        },
      ],
      executionOrder: ['plan-1'],
    },
    ...over,
  }
}

function renderCard(over: Partial<PendingPlanReviewRequest> = {}, onResolve = vi.fn()) {
  render(
    <PlanReviewCard request={request(over)} onResolve={onResolve} projectPath="/tmp/project" />,
  )
  return onResolve
}

/**
 * The "Add instructions or files" toggle for a given step (1-based).
 *
 * Every step's toggle shares the same accessible name, so it has to be picked
 * positionally — and a missing one is a real test failure, not something to
 * paper over with a non-null assertion.
 */
function stepToggle(stepNumber: number) {
  const toggles = screen.getAllByRole('button', { name: /Add instructions or files/ })
  const toggle = toggles[stepNumber - 1]
  if (!toggle) throw new Error(`no step-${stepNumber} toggle (found ${toggles.length})`)
  return toggle
}

describe('PlanReviewCard', () => {
  it('renders every step in execution order with its files', () => {
    renderCard()
    expect(screen.getByText('Add the header')).toBeInTheDocument()
    expect(screen.getByText('Wire it in')).toBeInTheDocument()
    // '+' marks a new file, '~' an edit — so the user can see what gets created.
    expect(screen.getByTitle('src/Header.tsx (write)')).toHaveTextContent('+ src/Header.tsx')
    expect(screen.getByTitle('src/Page.tsx (edit)')).toHaveTextContent('~ src/Page.tsx')
    expect(screen.getByText(/renders at 375px/)).toBeInTheDocument()
  })

  it('approves with no edits as a plain approval', async () => {
    const onResolve = renderCard()
    fireEvent.click(screen.getByRole('button', { name: /Approve & run/ }))
    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(1))
    expect(onResolve).toHaveBeenCalledWith({ planReviewId: 'review-1', decision: 'approved' })
  })

  it('refuses to send the plan back with no comment', async () => {
    const onResolve = renderCard()
    fireEvent.click(screen.getByRole('button', { name: /Send back/ }))
    expect(await screen.findByText(/Say what should change/)).toBeInTheDocument()
    expect(onResolve).not.toHaveBeenCalled()
  })

  it('sends comments back for a re-plan', async () => {
    const onResolve = renderCard()
    fireEvent.change(screen.getByLabelText('Plan revision comments'), {
      target: { value: 'Split the header in two.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Send back/ }))
    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(1))
    expect(onResolve).toHaveBeenCalledWith({
      planReviewId: 'review-1',
      decision: 'revise',
      comments: 'Split the header in two.',
    })
  })

  it('carries per-step notes through on APPROVAL, not just on revise', async () => {
    // Attaching guidance to a step must not force a wasted re-planning round.
    const onResolve = renderCard()
    fireEvent.click(stepToggle(1))
    fireEvent.change(screen.getByLabelText('Instructions for step 1'), {
      target: { value: 'Use the brand blue.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Approve & run/ }))

    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(1))
    expect(onResolve).toHaveBeenCalledWith({
      planReviewId: 'review-1',
      decision: 'approved',
      stepEdits: [{ taskId: 't1', notes: 'Use the brand blue.' }],
    })
  })

  it('stages attachments through prepareAttachments and scopes them to one step', async () => {
    prepareAttachments.mockResolvedValue([
      {
        id: 'a1',
        kind: 'image',
        name: 'm.png',
        path: '/tmp/project/.att/m.png',
        mimeType: 'image/png',
        sizeBytes: 1,
        extractedText: '',
      },
    ])
    const onResolve = renderCard()

    fireEvent.click(stepToggle(2))
    // Clicking "Attach files" is what binds the picker to THIS step; without it
    // a picked file has no step to attach to.
    fireEvent.click(screen.getByRole('button', { name: /Attach files/ }))
    const input = screen.getByTestId('plan-review-file-input')
    const file = new File(['x'], 'm.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })

    // The staged path (not the raw picked file) is what the agent will read.
    await waitFor(() => expect(prepareAttachments).toHaveBeenCalledWith('/tmp/project', [file]))
    await screen.findByText('m.png')

    fireEvent.click(screen.getByRole('button', { name: /Approve & run/ }))
    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(1))
    expect(onResolve).toHaveBeenCalledWith({
      planReviewId: 'review-1',
      decision: 'approved',
      stepEdits: [
        {
          taskId: 't2',
          attachments: [{ path: '/tmp/project/.att/m.png', mimeType: 'image/png' }],
        },
      ],
    })
  })

  it('disables attaching with no open project', () => {
    render(<PlanReviewCard request={request()} onResolve={vi.fn()} projectPath={null} />)
    fireEvent.click(stepToggle(1))
    expect(screen.getByRole('button', { name: /Attach files/ })).toBeDisabled()
  })

  it('shows the prior comment and blocks another revise at the budget', () => {
    renderCard({ revision: 3, revisionsRemaining: 0, priorComments: 'make it smaller' })
    expect(screen.getByText(/make it smaller/)).toBeInTheDocument()
    expect(screen.getByText('Draft 3 · 2 steps')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Send back/ })).toBeDisabled()
    // Approve and cancel stay available so the user is never stuck.
    expect(screen.getByRole('button', { name: /Approve & run/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Cancel/ })).toBeEnabled()
  })

  it('stays on screen as a read-only record once answered', async () => {
    // Approving used to make the card vanish, taking the approved plan with it —
    // even though that plan is exactly what the rest of the run is doing.
    render(
      <PlanReviewCard
        request={request()}
        onResolve={vi.fn()}
        projectPath="/tmp/project"
        decision="approved"
      />,
    )

    expect(screen.getByTestId('plan-review-card')).toBeInTheDocument()
    expect(screen.getByText('Approved')).toBeInTheDocument()
    // The plan itself is still fully readable.
    expect(screen.getByText('Add the header')).toBeInTheDocument()
    expect(screen.getByText('Wire it in')).toBeInTheDocument()
    // But nothing can be submitted a second time.
    expect(screen.queryByRole('button', { name: /Approve & run/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Send back/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cancel/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Plan revision comments')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Add instructions or files/ }),
    ).not.toBeInTheDocument()
  })

  it('keeps the per-step notes visible, read-only, after approval', async () => {
    const req = request()
    const { rerender } = render(
      <PlanReviewCard request={req} onResolve={vi.fn()} projectPath="/tmp/project" />,
    )
    fireEvent.click(stepToggle(1))
    fireEvent.change(screen.getByLabelText('Instructions for step 1'), {
      target: { value: 'Use the brand blue.' },
    })

    // Same card instance, now answered — the note must survive as a record, since
    // it is what that step was actually told to do.
    rerender(
      <PlanReviewCard
        request={req}
        onResolve={vi.fn()}
        projectPath="/tmp/project"
        decision="approved"
      />,
    )

    expect(screen.getByText(/Use the brand blue\./)).toBeInTheDocument()
    expect(screen.queryByLabelText('Instructions for step 1')).not.toBeInTheDocument()
  })

  it('labels a cancelled review as cancelled, not approved', () => {
    render(
      <PlanReviewCard
        request={request()}
        onResolve={vi.fn()}
        projectPath="/tmp/project"
        decision="cancelled"
      />,
    )
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    expect(screen.queryByText('Approved')).not.toBeInTheDocument()
  })

  it('cancels without comments', async () => {
    const onResolve = renderCard()
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }))
    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(1))
    expect(onResolve).toHaveBeenCalledWith({ planReviewId: 'review-1', decision: 'cancelled' })
  })
})
