import { describe, expect, it } from 'vitest'
import { buildPhaseTranscriptNode } from '../turing-classic-run'

describe('buildPhaseTranscriptNode', () => {
  it('persists clarification phases even when display metadata is missing', () => {
    const node = buildPhaseTranscriptNode(
      {
        prepare: {
          phase: 'prepare',
          summary:
            'To change the header name, please provide the file path and the current header name you want to change.',
          pendingUserQuestion: {
            phase: 'prepare',
            question:
              'To change the header name, please provide the file path and the current header name you want to change.',
            kind: 'clarification',
          },
          complexity: 0,
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          messages: [],
        } as never,
      } as never,
      [],
      123,
    )

    expect(node).toBeDefined()
    expect(node?.contentJson).toContain('openwaggle.phase-transcript')
    expect(node?.contentJson).toContain('"pendingUserQuestion"')
    expect(node?.contentJson).toContain('please provide the file path')
  })
})
