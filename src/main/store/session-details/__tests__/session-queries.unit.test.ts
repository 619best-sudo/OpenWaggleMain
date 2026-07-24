import { describe, expect, it } from 'vitest'
import { PERSISTED_PHASE_TRANSCRIPT_CUSTOM_TYPE } from '@shared/types/phase'
import {
  TURING_BRIDGE_STATUS_CUSTOM_TYPE,
  TURING_THREAD_SNAPSHOT_CUSTOM_TYPE,
} from '@shared/types/structural-nodes'
import type { SessionNodeRow, SessionRow } from '../types'
import { buildSessionDetailNodeRows } from '../session-queries'
import { deriveBranchHints, deriveSessionBranchesForSnapshot } from '../branch-derivation'

function sessionRow(): SessionRow {
  return {
    id: 'session-1',
    pi_session_id: 'pi-session-1',
    pi_session_file: '/tmp/pi-session-1.jsonl',
    project_path: '/tmp/project',
    title: 'Session',
    archived: 0,
    waggle_config_json: null,
    created_at: 1,
    updated_at: 3,
    last_active_node_id: 'assistant-1',
    last_active_branch_id: 'session-1:main',
  }
}

function userRow(): SessionNodeRow {
  return {
    id: 'user-1',
    session_id: 'session-1',
    parent_id: null,
    pi_entry_type: 'message',
    kind: 'user_message',
    role: 'user',
    timestamp_ms: 1,
    content_json: JSON.stringify({ parts: [{ type: 'text', text: 'change header name' }], model: null }),
    metadata_json: '{}',
    branch_hint_id: 'session-1:main',
    path_depth: 0,
    created_order: 0,
  }
}

function assistantRow(): SessionNodeRow {
  return {
    id: 'assistant-1',
    session_id: 'session-1',
    parent_id: 'user-1',
    pi_entry_type: 'message',
    kind: 'assistant_message',
    role: 'assistant',
    timestamp_ms: 2,
    content_json: JSON.stringify({
      parts: [{ type: 'text', text: 'Need clarification before changing the title.' }],
      model: 'openai/gpt-5.4',
    }),
    metadata_json: '{}',
    branch_hint_id: 'session-1:main',
    path_depth: 1,
    created_order: 1,
  }
}

function phaseTranscriptRow(id: string, createdOrder: number, branchId = 'session-1:main'): SessionNodeRow {
  return {
    id,
    session_id: 'session-1',
    parent_id: 'assistant-1',
    pi_entry_type: 'custom',
    kind: 'custom',
    role: null,
    timestamp_ms: createdOrder + 1,
    content_json: JSON.stringify({
      customType: PERSISTED_PHASE_TRANSCRIPT_CUSTOM_TYPE,
      data: {
        version: 1,
        phases: [
          {
            id: 'prepare',
            label: 'Understood! Let me understand the codebase for implementation',
            activityText: 'Finding relevant files and context',
            status: 'completed',
            elapsedMs: 1000,
            summary: 'Located the relevant HTML file and confirmed clarification is needed.',
            tools: [],
          },
        ],
      },
    }),
    metadata_json: '{}',
    branch_hint_id: branchId,
    path_depth: 2,
    created_order: createdOrder,
  }
}

describe('buildSessionDetailNodeRows', () => {
  it('appends the latest persisted phase transcript row for the active branch when it sits outside the active path', () => {
    const rows = buildSessionDetailNodeRows(sessionRow(), [
      userRow(),
      assistantRow(),
      phaseTranscriptRow('phase-transcript-old', 2),
      phaseTranscriptRow('phase-transcript-latest', 3),
    ])

    expect(rows.map((row) => row.id)).toEqual([
      'user-1',
      'assistant-1',
      'phase-transcript-latest',
    ])
  })

  it('does not append a phase transcript row from another branch', () => {
    const rows = buildSessionDetailNodeRows(sessionRow(), [
      userRow(),
      assistantRow(),
      phaseTranscriptRow('phase-transcript-other-branch', 3, 'session-1:feature'),
    ])

    expect(rows.map((row) => row.id)).toEqual(['user-1', 'assistant-1'])
  })
})

describe('deriveSessionBranchesForSnapshot', () => {
  it('ignores persisted phase transcript custom nodes when deriving branches', () => {
    const derived = deriveSessionBranchesForSnapshot({
      sessionId: 'session-1',
      activeNodeId: 'assistant-1',
      existingBranches: [],
      nodes: [
        {
          id: 'user-1',
          parentId: null,
          piEntryType: 'message',
          kind: 'user_message',
          role: 'user',
          timestampMs: 1,
          contentJson: JSON.stringify({ parts: [{ type: 'text', text: 'change header name' }], model: null }),
          metadataJson: '{}',
          pathDepth: 0,
          createdOrder: 0,
        },
        {
          id: 'assistant-1',
          parentId: 'user-1',
          piEntryType: 'message',
          kind: 'assistant_message',
          role: 'assistant',
          timestampMs: 2,
          contentJson: JSON.stringify({
            parts: [{ type: 'text', text: 'Need clarification before changing the title.' }],
            model: 'openai/gpt-5.4',
          }),
          metadataJson: '{}',
          pathDepth: 1,
          createdOrder: 1,
        },
        {
          id: 'phase-transcript-1',
          parentId: 'assistant-1',
          piEntryType: 'custom',
          kind: 'custom',
          role: null,
          timestampMs: 3,
          contentJson: JSON.stringify({
            customType: PERSISTED_PHASE_TRANSCRIPT_CUSTOM_TYPE,
            data: {
              version: 1,
              phases: [],
            },
          }),
          metadataJson: '{}',
          pathDepth: 2,
          createdOrder: 2,
        },
      ],
    })

    expect(derived.branches).toHaveLength(1)
    expect(derived.branches[0]).toMatchObject({
      id: 'session-1:main',
      name: 'main',
      headNodeId: 'assistant-1',
      isMain: true,
    })
  })

  it('does not derive a phantom branch from trailing thread-snapshot / bridge nodes', () => {
    // Mirrors what a turing run persists: the active assistant message followed
    // by a linear chain of non-conversational artifact nodes (bridge status →
    // phase transcript → thread snapshot). None of these should read as a second
    // branchable leaf, so the tree must stay a single "main" branch.
    const derived = deriveSessionBranchesForSnapshot({
      sessionId: 'session-1',
      activeNodeId: 'assistant-1',
      existingBranches: [],
      nodes: [
        {
          id: 'user-1',
          parentId: null,
          piEntryType: 'message',
          kind: 'user_message',
          role: 'user',
          timestampMs: 1,
          contentJson: JSON.stringify({ parts: [{ type: 'text', text: 'change header name' }], model: null }),
          metadataJson: '{}',
          pathDepth: 0,
          createdOrder: 0,
        },
        {
          id: 'assistant-1',
          parentId: 'user-1',
          piEntryType: 'message',
          kind: 'assistant_message',
          role: 'assistant',
          timestampMs: 2,
          contentJson: JSON.stringify({
            parts: [{ type: 'text', text: 'Renamed the header.' }],
            model: 'openai/gpt-5.4',
          }),
          metadataJson: '{}',
          pathDepth: 1,
          createdOrder: 1,
        },
        {
          id: 'bridge-1',
          parentId: 'assistant-1',
          piEntryType: 'custom',
          kind: 'custom',
          role: null,
          timestampMs: 3,
          contentJson: JSON.stringify({ customType: TURING_BRIDGE_STATUS_CUSTOM_TYPE, data: {} }),
          metadataJson: '{}',
          pathDepth: 2,
          createdOrder: 2,
        },
        {
          id: 'phase-transcript-1',
          parentId: 'bridge-1',
          piEntryType: 'custom',
          kind: 'custom',
          role: null,
          timestampMs: 4,
          contentJson: JSON.stringify({
            customType: PERSISTED_PHASE_TRANSCRIPT_CUSTOM_TYPE,
            data: { version: 1, phases: [] },
          }),
          metadataJson: '{}',
          pathDepth: 3,
          createdOrder: 3,
        },
        {
          id: 'thread-snapshot-1',
          parentId: 'phase-transcript-1',
          piEntryType: 'custom',
          kind: 'custom',
          role: null,
          timestampMs: 5,
          contentJson: JSON.stringify({ customType: TURING_THREAD_SNAPSHOT_CUSTOM_TYPE, data: {} }),
          metadataJson: '{}',
          pathDepth: 4,
          createdOrder: 4,
        },
      ],
    })

    expect(derived.branches).toHaveLength(1)
    expect(derived.branches[0]).toMatchObject({
      id: 'session-1:main',
      name: 'main',
      headNodeId: 'assistant-1',
      isMain: true,
    })
  })

  it('preserves a structural active node and inherits branch hints for transcript artifacts', () => {
    const nodes = [
      {
        id: 'user-1',
        parentId: null,
        piEntryType: 'message',
        kind: 'user_message',
        role: 'user',
        timestampMs: 1,
        contentJson: JSON.stringify({ parts: [{ type: 'text', text: 'change header name' }], model: null }),
        metadataJson: '{}',
        pathDepth: 0,
        createdOrder: 0,
      },
      {
        id: 'assistant-1',
        parentId: 'user-1',
        piEntryType: 'message',
        kind: 'assistant_message',
        role: 'assistant',
        timestampMs: 2,
        contentJson: JSON.stringify({
          parts: [{ type: 'text', text: 'Need clarification before changing the title.' }],
          model: 'openai/gpt-5.4',
        }),
        metadataJson: '{}',
        pathDepth: 1,
        createdOrder: 1,
      },
      {
        id: 'bridge-1',
        parentId: 'assistant-1',
        piEntryType: 'custom',
        kind: 'custom',
        role: null,
        timestampMs: 3,
        contentJson: JSON.stringify({ customType: TURING_BRIDGE_STATUS_CUSTOM_TYPE, data: {} }),
        metadataJson: '{}',
        pathDepth: 2,
        createdOrder: 2,
      },
      {
        id: 'phase-transcript-1',
        parentId: 'bridge-1',
        piEntryType: 'custom',
        kind: 'custom',
        role: null,
        timestampMs: 4,
        contentJson: JSON.stringify({
          customType: PERSISTED_PHASE_TRANSCRIPT_CUSTOM_TYPE,
          data: { version: 1, phases: [] },
        }),
        metadataJson: '{}',
        pathDepth: 3,
        createdOrder: 3,
      },
      {
        id: 'thread-snapshot-1',
        parentId: 'phase-transcript-1',
        piEntryType: 'custom',
        kind: 'custom',
        role: null,
        timestampMs: 5,
        contentJson: JSON.stringify({ customType: TURING_THREAD_SNAPSHOT_CUSTOM_TYPE, data: {} }),
        metadataJson: '{}',
        pathDepth: 4,
        createdOrder: 4,
      },
    ] satisfies Parameters<typeof deriveSessionBranchesForSnapshot>[0]['nodes']

    const derived = deriveSessionBranchesForSnapshot({
      sessionId: 'session-1',
      activeNodeId: 'thread-snapshot-1',
      existingBranches: [],
      nodes,
    })

    expect(derived.activeBranchId).toBe('session-1:main')
    expect(derived.activeNodeId).toBe('thread-snapshot-1')
    expect(derived.branches).toHaveLength(1)
    expect(derived.branches[0]).toMatchObject({
      id: 'session-1:main',
      headNodeId: 'assistant-1',
      isMain: true,
    })

    const branchHints = deriveBranchHints({
      branches: derived.branches,
      nodes,
      activeBranchId: derived.activeBranchId,
    })

    expect(branchHints.get('bridge-1')).toBe('session-1:main')
    expect(branchHints.get('phase-transcript-1')).toBe('session-1:main')
    expect(branchHints.get('thread-snapshot-1')).toBe('session-1:main')
  })
})
