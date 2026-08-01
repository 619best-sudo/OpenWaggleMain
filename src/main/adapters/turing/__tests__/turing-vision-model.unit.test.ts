import { describe, expect, it, vi } from 'vitest'

const envMock: { OPENWAGGLE_VISION_MODEL?: string } = {}

vi.mock('../../../env', () => ({
  env: envMock,
  logLevel: 'error',
}))

const { DEFAULT_VISION_MODEL, resolveVisionModel } = await import('../turing-vision-model')

describe('resolveVisionModel', () => {
  it('defaults to a multimodal slug, never the text-only run model', () => {
    envMock.OPENWAGGLE_VISION_MODEL = undefined
    expect(resolveVisionModel()).toBe(DEFAULT_VISION_MODEL)
    expect(resolveVisionModel()).not.toContain('laguna')
  })

  it('honours the env override', () => {
    envMock.OPENWAGGLE_VISION_MODEL = 'anthropic/claude-sonnet-4.5'
    expect(resolveVisionModel()).toBe('anthropic/claude-sonnet-4.5')
  })

  it('treats a blank override as unset', () => {
    envMock.OPENWAGGLE_VISION_MODEL = '   '
    expect(resolveVisionModel()).toBe(DEFAULT_VISION_MODEL)
  })
})
