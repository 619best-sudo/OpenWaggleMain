import { describe, expect, it } from 'vitest'
import { resolveSnapshotActiveNodeId } from '../turing-classic-run'

describe('resolveSnapshotActiveNodeId', () => {
  it('keeps the base active node when there are no appended transcript nodes', () => {
    expect(resolveSnapshotActiveNodeId('assistant-1', [])).toBe('assistant-1')
  })

  it('advances the active node to the last appended transcript node', () => {
    expect(
      resolveSnapshotActiveNodeId('bridge-node', [
        {
          id: 'phase-transcript-node',
          parentId: 'bridge-node',
          piEntryType: 'custom',
          kind: 'custom',
          role: null,
          timestampMs: 1,
          contentJson: '{}',
          metadataJson: '{}',
          pathDepth: 3,
          createdOrder: 3,
        },
        {
          id: 'thread-snapshot-node',
          parentId: 'phase-transcript-node',
          piEntryType: 'custom',
          kind: 'custom',
          role: null,
          timestampMs: 2,
          contentJson: '{}',
          metadataJson: '{}',
          pathDepth: 4,
          createdOrder: 4,
        },
      ]),
    ).toBe('thread-snapshot-node')
  })
})
