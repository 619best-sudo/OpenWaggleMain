import { describe, expect, it } from 'vitest'
import { Schema } from 'effect'
import { agentSendPayloadSchema } from '../validation'

/**
 * `agentSendPayloadSchema` is the renderer→main IPC boundary for a chat send.
 *
 * Effect Schema STRIPS any property the struct does not declare, and it does so
 * silently — no error, no warning. So a flag added to `AgentSendPayload` but not
 * to this schema type-checks everywhere, ships, and then simply never arrives in
 * the main process. Machine mode would render as enabled and do nothing.
 *
 * These tests exist so that failure is caught here rather than in the app.
 */
const base = {
  text: 'build me a landing page',
  thinkingLevel: 'medium' as const,
  attachments: [],
}

describe('agentSendPayloadSchema', () => {
  it('carries planMode through the IPC boundary', () => {
    const decoded = Schema.decodeUnknownSync(agentSendPayloadSchema)({ ...base, planMode: true })
    expect(decoded.planMode).toBe(true)
  })

  it('treats planMode as optional, so a normal send is unchanged', () => {
    const decoded = Schema.decodeUnknownSync(agentSendPayloadSchema)(base)
    expect(decoded.planMode).toBeUndefined()
  })

  it('preserves an explicit false rather than collapsing it to absent', () => {
    const decoded = Schema.decodeUnknownSync(agentSendPayloadSchema)({ ...base, planMode: false })
    expect(decoded.planMode).toBe(false)
  })

  it('rejects a non-boolean planMode instead of coercing it', () => {
    // A truthy string would otherwise turn every send into a planning run.
    expect(() =>
      Schema.decodeUnknownSync(agentSendPayloadSchema)({ ...base, planMode: 'yes' }),
    ).toThrow()
  })
})
