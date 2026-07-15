import { afterEach, describe, expect, it } from 'vitest'
import {
  clearEarlyToolAuthoringBridge,
  registerEarlyToolAuthoringBridge,
} from '../early-tool-authoring-bridge'

function resolver() {
  return globalThis.__openwaggleEarlyToolAuthoring
}

describe('early-tool-authoring bridge', () => {
  afterEach(() => {
    clearEarlyToolAuthoringBridge()
  })

  it('registers a resolver that returns a plan for author tools and null otherwise', () => {
    expect(resolver()).toBeUndefined()

    registerEarlyToolAuthoringBridge()
    const fn = resolver()
    expect(typeof fn).toBe('function')
    expect(fn?.('write')).toEqual(
      expect.objectContaining({
        targetKeys: expect.arrayContaining(['path']),
        payloadKeys: expect.arrayContaining(['content', 'edits']),
      }),
    )
    expect(fn?.('read')).toBeNull()
    expect(fn?.('bash')).toBeNull()
  })

  it('clears the resolver', () => {
    registerEarlyToolAuthoringBridge()
    expect(resolver()).toBeDefined()
    clearEarlyToolAuthoringBridge()
    expect(resolver()).toBeUndefined()
  })
})
