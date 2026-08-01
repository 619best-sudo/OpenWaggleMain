import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import * as Effect from 'effect/Effect'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Mock the IPC plumbing so importing the handler doesn't drag in the full
// main runtime graph (which transitively reaches a workspace-linked
// turing-harness build). We only exercise the pure resolver here.
vi.mock('../typed-ipc', () => ({ typedHandle: vi.fn() }))
vi.mock('../../logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { mimeTypeForMediaPath, resolveMediaFileEffect } from '../tool-media-handler'

describe('tool-media-handler', () => {
  let workspace: string

  beforeAll(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'tool-media-'))
    // A real 1x1 PNG.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
      'base64',
    )
    await fs.writeFile(path.join(workspace, 'pixel.png'), png)
    await fs.writeFile(path.join(workspace, 'page.html'), '<p>hi</p>')
    await fs.mkdir(path.join(workspace, 'sub'))
    // A "too large" file (> 8 MB) to exercise the size cap.
    const big = Buffer.alloc(8 * 1024 * 1024 + 1, 65) // 'A' bytes
    await fs.writeFile(path.join(workspace, 'sub', 'big.png'), big)
  })

  afterAll(async () => {
    await fs.rm(workspace, { recursive: true, force: true })
  })

  it('mimeTypeForMediaPath maps known extensions', () => {
    expect(mimeTypeForMediaPath('x.png')).toBe('image/png')
    expect(mimeTypeForMediaPath('x.MP4')).toBe('video/mp4')
    expect(mimeTypeForMediaPath('x.unknown')).toBe('application/octet-stream')
  })

  it('resolves a small image inside the workspace to a data url', async () => {
    const result = await Effect.runPromise(resolveMediaFileEffect(workspace, 'pixel.png'))
    expect(result.dataUrl.startsWith('data:image/png;base64,')).toBe(true)
    expect(result.mimeType).toBe('image/png')
  })

  it('resolves an absolute path inside the workspace', async () => {
    const abs = path.join(workspace, 'pixel.png')
    const result = await Effect.runPromise(resolveMediaFileEffect(workspace, abs))
    expect(result.dataUrl.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('resolves a nested relative path', async () => {
    const result = await Effect.runPromise(
      resolveMediaFileEffect(workspace, path.join('sub', '..', 'pixel.png')),
    )
    expect(result.dataUrl.startsWith('data:image/png')).toBe(true)
  })

  it('rejects a path that escapes the workspace via ..', async () => {
    const result = await Effect.runPromise(
      Effect.either(resolveMediaFileEffect(workspace, path.join('..', 'pixel.png'))),
    )
    expect(result._tag).toBe('Left')
  })

  it('rejects an oversized file', async () => {
    const result = await Effect.runPromise(
      Effect.either(resolveMediaFileEffect(workspace, path.join('sub', 'big.png'))),
    )
    expect(result._tag).toBe('Left')
  })

  it('rejects a missing file', async () => {
    const result = await Effect.runPromise(
      Effect.either(resolveMediaFileEffect(workspace, 'nope.png')),
    )
    expect(result._tag).toBe('Left')
  })

  it('rejects an unsupported extension', async () => {
    const result = await Effect.runPromise(
      Effect.either(resolveMediaFileEffect(workspace, 'README.md')),
    )
    expect(result._tag).toBe('Left')
  })

  it('rejects when no project path is open', async () => {
    const result = await Effect.runPromise(Effect.either(resolveMediaFileEffect(null, 'pixel.png')))
    expect(result._tag).toBe('Left')
  })
})
