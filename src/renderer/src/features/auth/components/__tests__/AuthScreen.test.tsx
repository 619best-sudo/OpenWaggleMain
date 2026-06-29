// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { useAppAuthMock } = vi.hoisted(() => ({
  useAppAuthMock: vi.fn(),
}))

vi.mock('@/features/auth/state/app-auth-store', () => ({
  useAppAuth: () => useAppAuthMock(),
}))

import { AuthScreen } from '../AuthScreen'

describe('AuthScreen', () => {
  beforeEach(() => {
    useAppAuthMock.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the login view by default', () => {
    useAppAuthMock.mockReturnValue({
      view: 'login',
      status: 'signed_out',
      error: null,
      setView: vi.fn(),
      clearError: vi.fn(),
      signIn: vi.fn(),
      signUp: vi.fn(),
    })

    render(<AuthScreen />)

    expect(screen.getByRole('heading', { name: 'Register or login' })).toBeTruthy()
    expect(screen.getByLabelText('Email')).toBeTruthy()
    expect(screen.getByLabelText('Password')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeTruthy()
  })

  it('shows validation feedback instead of submitting an invalid login form', async () => {
    const signIn = vi.fn()
    const clearError = vi.fn()

    useAppAuthMock.mockReturnValue({
      view: 'login',
      status: 'signed_out',
      error: null,
      setView: vi.fn(),
      clearError,
      signIn,
      signUp: vi.fn(),
    })

    render(<AuthScreen />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'bad-email' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: '123456' } })
    const form = screen.getByRole('button', { name: 'Sign In' }).closest('form')
    expect(form).toBeTruthy()
    fireEvent.submit(form as HTMLFormElement)

    await waitFor(() => {
      expect(clearError).toHaveBeenCalled()
      expect(signIn).not.toHaveBeenCalled()
    })
  })

  it('submits the trimmed signup payload from the register view', async () => {
    const signUp = vi.fn().mockResolvedValue(undefined)

    useAppAuthMock.mockReturnValue({
      view: 'signup',
      status: 'signed_out',
      error: null,
      setView: vi.fn(),
      clearError: vi.fn(),
      signIn: vi.fn(),
      signUp,
    })

    render(<AuthScreen />)

    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: '  Alex Johnson  ' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: '  alex@example.com  ' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText('Confirm'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }))

    await waitFor(() => {
      expect(signUp).toHaveBeenCalledWith({
        name: 'Alex Johnson',
        email: 'alex@example.com',
        password: 'password123',
      })
    })
  })
})
