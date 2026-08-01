/**
 * The permission card asks ONE short question.
 *
 * It summarizes whatever arguments a tool happens to take, and some tools take
 * genuinely large ones — `create_plan` receives a `context` holding every
 * relevant file and prior finding. Without a recognized field to key on and a
 * hard length cap, that argument rendered as a wall of text where the question
 * should be.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PendingToolPermissionRequest } from '../../lib/tool-permission-request'
import { ToolPermissionInlineCard } from '../ToolPermissionInlineCard'

function request(over: Partial<PendingToolPermissionRequest> = {}): PendingToolPermissionRequest {
  return {
    toolCallId: 'call-1',
    toolName: 'bash',
    input: { command: 'ls -la' },
    messageId: 'live:call-1',
    summary: '',
    ...over,
  }
}

function renderCard(over: Partial<PendingToolPermissionRequest> = {}) {
  render(
    <ToolPermissionInlineCard
      request={request(over)}
      busy={false}
      error={null}
      onApprove={vi.fn()}
      onDeny={vi.fn()}
    />,
  )
}

describe('ToolPermissionInlineCard', () => {
  it('summarizes create_plan by its task, never by its context', () => {
    const context = `RELEVANT FILES:\n${Array.from(
      { length: 60 },
      (_, i) => `src/module-${i}/index.ts — some prior finding about this file`,
    ).join('\n')}`

    renderCard({
      toolName: 'create_plan',
      input: { task: 'Add a dark mode toggle to settings', context },
    })

    expect(screen.getByText(/Add a dark mode toggle to settings/)).toBeInTheDocument()
    // The context must not reach the card at all — it is what made this unreadable.
    expect(screen.queryByText(/some prior finding about this file/)).not.toBeInTheDocument()
    expect(screen.queryByText(/RELEVANT FILES/)).not.toBeInTheDocument()
  })

  it('caps a long argument and keeps the full value in the tooltip', () => {
    const task = `Refactor ${'the entire authentication subsystem '.repeat(20)}`
    renderCard({ toolName: 'create_plan', input: { task } })

    const chip = screen.getByTitle(`task: ${task.replace(/\s+/g, ' ').trim()}`)
    // Bounded, and the cut is visible rather than silent.
    expect(chip.textContent ?? '').toMatch(/…$/)
    expect((chip.textContent ?? '').length).toBeLessThanOrEqual(161)
  })

  it('leaves a short argument untruncated and without a tooltip', () => {
    renderCard({ toolName: 'create_plan', input: { task: 'Rename the button' } })
    const chip = screen.getByText('task: Rename the button')
    expect(chip).not.toHaveAttribute('title')
  })

  it('still reads naturally for shell commands and file paths', () => {
    renderCard({ toolName: 'bash', input: { command: 'ls -la' } })
    expect(screen.getByText('ls -la')).toBeInTheDocument()
    expect(screen.getByText(/to run/)).toBeInTheDocument()
  })

  it('summarizes a path-shaped input by its path', () => {
    renderCard({ toolName: 'write', input: { path: 'src/Header.tsx', content: 'x'.repeat(5000) } })
    expect(screen.getByText('src/Header.tsx')).toBeInTheDocument()
    // The file body is not the question being asked.
    expect(screen.queryByText(/xxxxxxxxxx/)).not.toBeInTheDocument()
  })

  it('falls back to a capped field list when nothing is recognizable', () => {
    renderCard({
      toolName: 'mystery_tool',
      input: { alpha: 'a'.repeat(500), beta: 'b'.repeat(500) },
    })
    // Bounded overall, and no single field is allowed to dominate.
    const prompt = screen.getByText(/Allow/).textContent ?? ''
    expect(prompt).not.toMatch(/a{200}/)
    expect(prompt.length).toBeLessThan(300)
  })
})
