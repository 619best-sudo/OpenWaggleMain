import type { UpdateStatus } from '@shared/types/updater'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getAppVersionMock,
  getUpdateStatusMock,
  onUpdateStatusMock,
  checkForUpdatesMock,
  installUpdateMock,
} = vi.hoisted(() => ({
  getAppVersionMock: vi.fn(),
  getUpdateStatusMock: vi.fn(),
  onUpdateStatusMock: vi.fn(),
  checkForUpdatesMock: vi.fn(),
  installUpdateMock: vi.fn(),
}))

vi.mock('@/shared/lib/ipc', () => ({
  api: {
    getAppVersion: getAppVersionMock,
    getUpdateStatus: getUpdateStatusMock,
    onUpdateStatus: onUpdateStatusMock,
    checkForUpdates: checkForUpdatesMock,
    installUpdate: installUpdateMock,
  },
}))

import { AboutUpdatesSection } from '../sections/AboutUpdatesSection'

describe('AboutUpdatesSection', () => {
  beforeEach(() => {
    getAppVersionMock.mockReset()
    getUpdateStatusMock.mockReset()
    onUpdateStatusMock.mockReset()
    checkForUpdatesMock.mockReset()
    installUpdateMock.mockReset()

    getAppVersionMock.mockResolvedValue('0.2.0')
    getUpdateStatusMock.mockResolvedValue({ type: 'idle' } satisfies UpdateStatus)
    onUpdateStatusMock.mockReturnValue(() => {})
    checkForUpdatesMock.mockResolvedValue(undefined)
    installUpdateMock.mockResolvedValue(undefined)
  })

  it('renders the app version after it resolves', async () => {
    render(<AboutUpdatesSection />)

    await waitFor(() => {
      expect(screen.getByText(/Turing Machine v0\.2\.0/)).toBeInTheDocument()
    })
  })

  it('renders the dedicated section heading', () => {
    render(<AboutUpdatesSection />)

    expect(screen.getByText('About & Updates')).toBeInTheDocument()
  })

  it('renders the "Check now" button when status is idle', () => {
    render(<AboutUpdatesSection />)

    expect(screen.getByRole('button', { name: /check now/i })).toBeInTheDocument()
  })

  it('calls api.checkForUpdates when "Check now" is clicked', async () => {
    render(<AboutUpdatesSection />)

    fireEvent.click(screen.getByRole('button', { name: /check now/i }))

    await waitFor(() => {
      expect(checkForUpdatesMock).toHaveBeenCalledOnce()
    })
  })

  it('shows "Restart to update" button when status is downloaded', async () => {
    getUpdateStatusMock.mockResolvedValue({
      type: 'downloaded',
      version: '0.3.0',
    } satisfies UpdateStatus)

    render(<AboutUpdatesSection />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /restart to update/i })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /check now/i })).not.toBeInTheDocument()
  })

  it('calls api.installUpdate when "Restart to update" is clicked', async () => {
    getUpdateStatusMock.mockResolvedValue({
      type: 'downloaded',
      version: '0.3.0',
    } satisfies UpdateStatus)

    render(<AboutUpdatesSection />)

    fireEvent.click(await screen.findByRole('button', { name: /restart to update/i }))

    await waitFor(() => {
      expect(installUpdateMock).toHaveBeenCalledOnce()
    })
  })

  it('shows "Check now" button when status is not-available', async () => {
    getUpdateStatusMock.mockResolvedValue({ type: 'not-available' } satisfies UpdateStatus)

    render(<AboutUpdatesSection />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /check now/i })).toBeInTheDocument()
    })
  })

  it('shows "Check now" button when status is error', async () => {
    getUpdateStatusMock.mockResolvedValue({
      type: 'error',
      message: 'network timeout',
    } satisfies UpdateStatus)

    render(<AboutUpdatesSection />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /check now/i })).toBeInTheDocument()
    })
  })

  it('hides action buttons while checking or downloading', async () => {
    getUpdateStatusMock.mockResolvedValue({ type: 'checking' } satisfies UpdateStatus)

    render(<AboutUpdatesSection />)

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /check now/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /restart to update/i })).not.toBeInTheDocument()
    })
  })

  it('renders the "Latest version" label in the status row', () => {
    render(<AboutUpdatesSection />)
    expect(screen.getByText('Latest version')).toBeInTheDocument()
  })

  it('subscribes to live update status events via onUpdateStatus', () => {
    render(<AboutUpdatesSection />)
    expect(onUpdateStatusMock).toHaveBeenCalledOnce()
  })

  it('calls the unsubscribe function returned by onUpdateStatus on unmount', () => {
    const unsubscribe = vi.fn()
    onUpdateStatusMock.mockReturnValue(unsubscribe)

    const { unmount } = render(<AboutUpdatesSection />)
    unmount()

    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
