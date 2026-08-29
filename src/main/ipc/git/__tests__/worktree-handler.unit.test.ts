import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../typed-ipc', () => ({
  typedHandle: vi.fn(),
}))

const { isGitRepositoryMock, runGitMock } = vi.hoisted(() => ({
  isGitRepositoryMock: vi.fn(async () => true),
  runGitMock: vi.fn(async () => ({ code: 0, stdout: '', stderr: '' })),
}))

vi.mock('../shared', () => ({
  isGitRepository: isGitRepositoryMock,
  runGit: runGitMock,
  projectPathSchema: {},
}))

const { registerGitWorktreeHandlers, revertAllChanges, stageAllChanges } = await import(
  '../worktree-handler'
)

function gitResult(code: number, stdout = '', stderr = '') {
  return { code, stdout, stderr }
}

describe('git worktree mutations', () => {
  beforeEach(() => {
    isGitRepositoryMock.mockReset()
    isGitRepositoryMock.mockResolvedValue(true)
    runGitMock.mockReset()
    runGitMock.mockResolvedValue(gitResult(0))
  })

  it('rejects revert outside git repositories before running any command', async () => {
    isGitRepositoryMock.mockResolvedValue(false)

    await expect(revertAllChanges('/repo')).resolves.toEqual({
      ok: false,
      code: 'not-git-repo',
      message: 'Selected folder is not a Git repository.',
    })
    expect(runGitMock).not.toHaveBeenCalled()
  })

  it('refuses to revert before the first commit without running reset', async () => {
    runGitMock.mockResolvedValueOnce(gitResult(128, '', 'fatal: ambiguous argument'))

    await expect(revertAllChanges('/repo')).resolves.toEqual({
      ok: false,
      code: 'no-commits',
      message: 'Nothing to revert: this repository has no commits yet.',
    })
    expect(runGitMock).toHaveBeenCalledTimes(1)
    expect(runGitMock).toHaveBeenNthCalledWith(1, '/repo', ['rev-parse', '--verify', 'HEAD'])
  })

  it('resets tracked changes to HEAD and reports success', async () => {
    await expect(revertAllChanges('/repo')).resolves.toEqual({
      ok: true,
      summary: 'Reverted all changes',
    })

    expect(runGitMock).toHaveBeenNthCalledWith(2, '/repo', ['reset', '--hard', 'HEAD'])
  })

  it('maps reset failures to command-failed with git output', async () => {
    runGitMock
      .mockResolvedValueOnce(gitResult(0))
      .mockResolvedValueOnce(gitResult(128, '', 'fatal: Unable to create index.lock'))

    await expect(revertAllChanges('/repo')).resolves.toMatchObject({
      ok: false,
      code: 'command-failed',
      message: expect.stringContaining('index.lock'),
    })
  })

  it('stages every change with git add --all', async () => {
    await expect(stageAllChanges('/repo')).resolves.toEqual({
      ok: true,
      summary: 'Staged all changes',
    })

    expect(runGitMock).toHaveBeenCalledTimes(1)
    expect(runGitMock).toHaveBeenCalledWith('/repo', ['add', '--all'])
  })

  it('rejects staging outside git repositories', async () => {
    isGitRepositoryMock.mockResolvedValue(false)

    await expect(stageAllChanges('/repo')).resolves.toMatchObject({
      ok: false,
      code: 'not-git-repo',
    })
    expect(runGitMock).not.toHaveBeenCalled()
  })

  it('registers both worktree channels', async () => {
    const { typedHandle } = await import('../../typed-ipc')

    registerGitWorktreeHandlers()

    expect(vi.mocked(typedHandle)).toHaveBeenCalledWith('git:revert-all', expect.any(Function))
    expect(vi.mocked(typedHandle)).toHaveBeenCalledWith('git:stage-all', expect.any(Function))
  })
})
