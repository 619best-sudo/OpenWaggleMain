import { describe, expect, it } from 'vitest'
import {
  hasConcreteToolOutput,
  isToolPermissionRequestPayload,
  normalizeToolResultPayload,
} from '../tool-result-state'

describe('tool-result-state', () => {
  it('normalizes structured JSON tool payloads', () => {
    expect(
      normalizeToolResultPayload(
        '{"kind":"json","data":{"message":"File written","path":"out.ts"}}',
      ),
    ).toEqual({
      message: 'File written',
      path: 'out.ts',
    })
  })

  it('treats undefined as the only missing tool output state', () => {
    expect(hasConcreteToolOutput(undefined)).toBe(false)
    expect(hasConcreteToolOutput('')).toBe(true)
    expect(hasConcreteToolOutput({ kind: 'json', data: null })).toBe(true)
  })

  it('treats arbitrary strings as concrete tool output', () => {
    expect(hasConcreteToolOutput('not-json')).toBe(true)
  })

  it('treats permission request envelopes as non-concrete tool output', () => {
    const payload = {
      content: [{ type: 'text', text: 'Permission required before running bash: ls -la' }],
      details: {
        kind: 'tool_permission_request',
        toolName: 'bash',
        input: { command: 'ls -la' },
      },
    }

    expect(isToolPermissionRequestPayload(payload)).toBe(true)
    expect(hasConcreteToolOutput(payload)).toBe(false)
  })
})
