import { createEditToolDefinition } from '@mariozechner/pi-coding-agent'
import { describe, expect, it } from 'vitest'

/**
 * Guards the vendored `pi-coding-agent` edit-tool patch (see
 * `patches/@mariozechner__pi-coding-agent@0.70.2.patch`). Routed/switched models
 * sometimes emit edit entries as stringified JSON; `prepareArguments` must coerce
 * them into real objects so validation does not fail with `edits.0: must be object`.
 * If a dependency bump drops the patch, these expectations fail loudly.
 */
describe('edit tool argument coercion (vendored patch)', () => {
  const tool = createEditToolDefinition(process.cwd(), {}) as {
    prepareArguments?: (input: unknown) => { edits?: unknown }
  }

  it('exposes prepareArguments', () => {
    expect(typeof tool.prepareArguments).toBe('function')
  })

  it('parses each edit entry emitted as a stringified object', () => {
    const out = tool.prepareArguments?.({
      path: '/tmp/x',
      edits: ['{"oldText":"a","newText":"b"}', { oldText: 'c', newText: 'd' }],
    })
    expect(out?.edits).toEqual([
      { oldText: 'a', newText: 'b' },
      { oldText: 'c', newText: 'd' },
    ])
  })

  it('parses the whole edits value when emitted as a JSON string', () => {
    const out = tool.prepareArguments?.({
      path: '/tmp/x',
      edits: '[{"oldText":"a","newText":"b"}]',
    })
    expect(out?.edits).toEqual([{ oldText: 'a', newText: 'b' }])
  })

  it('leaves an already-valid edits array untouched', () => {
    const edits = [{ oldText: 'a', newText: 'b' }]
    const out = tool.prepareArguments?.({ path: '/tmp/x', edits })
    expect(out?.edits).toEqual(edits)
  })
})
