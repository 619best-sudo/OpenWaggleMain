import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerminalPanel } from '../TerminalPanel'

const { terminalStatusMock, useTerminalSessionActivationMock } = vi.hoisted(() => ({
  terminalStatusMock: vi.fn(),
  useTerminalSessionActivationMock: vi.fn(),
}))

vi.mock('@/features/terminal/hooks/useTerminalSession', () => ({
  useTerminalSession: () => ({
    containerRef: { current: null },
    terminalStatus: terminalStatusMock(),
    terminalIdRef: { current: null },
    terminalRef: { current: null },
    fitAddonRef: { current: null },
  }),
  useTerminalSessionActivation: useTerminalSessionActivationMock,
}))

describe('TerminalPanel', () => {
  beforeEach(() => {
    terminalStatusMock.mockReturnValue({ isReady: false, errorMessage: null })
    useTerminalSessionActivationMock.mockReset()
  })

  it('renders a terminal tab bar and delegates panel close', () => {
    const onClose = vi.fn()

    render(<TerminalPanel projectPath="/repo" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close terminal panel' }))

    expect(screen.getByRole('tab', { name: 'Terminal 1' })).toBeInTheDocument()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders terminal errors', () => {
    terminalStatusMock.mockReturnValue({ isReady: false, errorMessage: 'pty unavailable' })

    render(<TerminalPanel projectPath="/repo" onClose={vi.fn()} />)

    expect(screen.getByText('pty unavailable')).toBeInTheDocument()
  })

  it('adds and switches terminal tabs', () => {
    render(<TerminalPanel projectPath="/repo" onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))

    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    expect(screen.getByRole('tab', { name: 'Terminal 2' })).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(screen.getByRole('tab', { name: 'Terminal 1' }))
    expect(screen.getByRole('tab', { name: 'Terminal 1' })).toHaveAttribute('aria-selected', 'true')
  })

  it('closes an individual terminal tab without closing the panel', () => {
    const onClose = vi.fn()
    render(<TerminalPanel projectPath="/repo" onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close Terminal 2' }))

    expect(screen.getAllByRole('tab')).toHaveLength(1)
    expect(onClose).not.toHaveBeenCalled()
  })
})
