import type { GitFileDiff } from '@shared/types/git'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDiffViewTargetStore } from '@/features/diff-panel/state'
import { api } from '@/shared/lib/ipc'
import { DiffPanel } from '../DiffPanel'

vi.mock('@/shared/lib/ipc', () => ({
  api: {
    getGitDiff: vi.fn(),
    getGitStatus: vi.fn(async () => null),
    showConfirm: vi.fn(),
    revertAllGitChanges: vi.fn(),
    stageAllGitChanges: vi.fn(),
  },
}))

const SAMPLE_DIFF = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,2 +1,2 @@
-old line
+new line`

function fileDiff(): GitFileDiff {
  return { path: 'src/app.ts', diff: SAMPLE_DIFF, additions: 1, deletions: 1 }
}

// jsdom does not implement scrollIntoView — assign a mock onto the prototype.
const scrollSpy = vi.fn()
Element.prototype.scrollIntoView = scrollSpy

describe('DiffPanel view-file target', () => {
  beforeEach(() => {
    vi.mocked(api.getGitDiff).mockReset().mockResolvedValue([fileDiff()])
    useDiffViewTargetStore.setState({ target: null })
    scrollSpy.mockClear()
  })

  it('holds the target while hidden instead of consuming it invisibly', async () => {
    // The bug this guards: the sidebar keeps the panel mounted at 0 width,
    // so an ungated effect would scroll (invisibly) and CLEAR the target —
    // the click would do nothing even after the panel later opens.
    useDiffViewTargetStore.getState().requestViewFile('src/app.ts')

    render(<DiffPanel projectPath="/repo" onSendMessage={vi.fn()} visible={false} />)
    await waitFor(() => {
      expect(document.getElementById('diff-file-src/app.ts')).not.toBeNull()
    })

    expect(scrollSpy).not.toHaveBeenCalled()
    expect(useDiffViewTargetStore.getState().target?.path).toBe('src/app.ts')
  })

  it('scrolls to the file section and consumes the target once visible', async () => {
    useDiffViewTargetStore.getState().requestViewFile('src/app.ts')

    const { rerender } = render(
      <DiffPanel projectPath="/repo" onSendMessage={vi.fn()} visible={false} />,
    )
    rerender(<DiffPanel projectPath="/repo" onSendMessage={vi.fn()} visible />)

    await waitFor(() => {
      expect(useDiffViewTargetStore.getState().target).toBeNull()
    })
    expect(scrollSpy).toHaveBeenCalled()
  })

  it('consumes a target for a file with no uncommitted change (no stale scroll)', async () => {
    useDiffViewTargetStore.getState().requestViewFile('src/untouched.ts')

    render(<DiffPanel projectPath="/repo" onSendMessage={vi.fn()} visible />)

    await waitFor(() => {
      expect(useDiffViewTargetStore.getState().target).toBeNull()
    })
    expect(scrollSpy).not.toHaveBeenCalled()
  })
})
