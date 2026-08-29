import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDiffViewTargetStore } from '@/features/diff-panel/state'

const PROJECT_ROOT = '/Users/me/repo'
vi.mock('@/features/sessions/state', () => ({
  useSessionStore: (selector: (state: { activeWorkspace: unknown }) => unknown) =>
    selector({ activeWorkspace: { tree: { session: { projectPath: PROJECT_ROOT } } } }),
}))

import { ViewFileButton } from '../ViewFileButton'

describe('ViewFileButton', () => {
  beforeEach(() => {
    useDiffViewTargetStore.setState({ target: null })
  })

  it('publishes the repo-relative path on click', () => {
    render(<ViewFileButton path={`${PROJECT_ROOT}/src/app.ts`} />)

    fireEvent.click(screen.getByRole('button', { name: /View file/i }))

    const target = useDiffViewTargetStore.getState().target
    expect(target?.path).toBe('src/app.ts')
    expect(target?.requestId).toBe(1)
  })

  it('increments requestId for repeated clicks on the same file', () => {
    render(<ViewFileButton path="src/app.ts" />)
    const button = screen.getByRole('button', { name: /View file/i })

    fireEvent.click(button)
    fireEvent.click(button)

    const target = useDiffViewTargetStore.getState().target
    expect(target?.path).toBe('src/app.ts')
    expect(target?.requestId).toBe(2)
  })
})
