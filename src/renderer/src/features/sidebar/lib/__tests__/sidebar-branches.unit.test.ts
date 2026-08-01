import { SessionBranchId, SessionId, SessionNodeId } from '@shared/types/brand'
import type { SessionBranch, SessionSummary } from '@shared/types/session'
import { describe, expect, it } from 'vitest'
import { buildSidebarBranchRows, resolveActiveBranchIdForSession } from '../sidebar-branches'

function branch(input: {
  readonly sessionId: SessionId
  readonly id: string
  readonly name: string
  readonly isMain?: boolean
  readonly archived?: boolean
}) {
  return {
    id: SessionBranchId(input.id),
    sessionId: input.sessionId,
    sourceNodeId: null,
    headNodeId: SessionNodeId(`${input.id}:head`),
    name: input.name,
    isMain: input.isMain ?? false,
    ...(input.archived ? { archived: true, archivedAt: 10 } : { archivedAt: null }),
    createdAt: 1,
    updatedAt: 2,
  }
}

function session(input: {
  readonly id: SessionId
  readonly branches: readonly SessionBranch[]
  readonly collapsed?: boolean
}): SessionSummary {
  return {
    id: input.id,
    title: String(input.id),
    projectPath: '/tmp/project',
    createdAt: 1,
    updatedAt: 2,
    branches: input.branches,
    treeUiState: {
      sessionId: input.id,
      expandedNodeIds: [],
      expandedNodeIdsTouched: false,
      branchesSidebarCollapsed: input.collapsed ?? false,
      updatedAt: 3,
    },
  }
}

describe('buildSidebarBranchRows', () => {
  it('shows materialized non-archived branches for every multi-branch session', () => {
    const sessionId = SessionId('session-1')
    const rows = buildSidebarBranchRows({
      session: session({
        id: sessionId,
        branches: [
          branch({ sessionId, id: 'session-1:main', name: 'main', isMain: true }),
          branch({ sessionId, id: 'session-1:branch:a', name: 'OAuth path' }),
          branch({ sessionId, id: 'session-1:branch:b', name: 'Archived path', archived: true }),
        ],
      }),
      draftBranch: null,
    })

    expect(rows.map((row) => row.type === 'branch' && row.branch.name)).toEqual([
      'main',
      'OAuth path',
    ])
  })

  it('hides materialized branch rows for collapsed sessions without drafts', () => {
    const sessionId = SessionId('session-1')
    const rows = buildSidebarBranchRows({
      session: session({
        id: sessionId,
        collapsed: true,
        branches: [
          branch({ sessionId, id: 'session-1:main', name: 'main', isMain: true }),
          branch({ sessionId, id: 'session-1:branch:a', name: 'OAuth path' }),
        ],
      }),
      draftBranch: null,
    })

    expect(rows).toEqual([])
  })

  it('can force branch rows visible while a draft auto-expands a collapsed session', () => {
    const sessionId = SessionId('session-1')
    const rows = buildSidebarBranchRows({
      session: session({
        id: sessionId,
        collapsed: true,
        branches: [
          branch({ sessionId, id: 'session-1:main', name: 'main', isMain: true }),
          branch({ sessionId, id: 'session-1:branch:a', name: 'OAuth path' }),
        ],
      }),
      branchesCollapsed: false,
      draftBranch: { sessionId, sourceNodeId: SessionNodeId('source-node') },
    })

    expect(rows.map((row) => (row.type === 'draft' ? 'draft' : row.branch.name))).toEqual([
      'draft',
      'main',
      'OAuth path',
    ])
  })

  it('does not highlight a branch as active for a session that is not the active session', () => {
    // Regression: every session persists a non-null lastActiveBranchId, so
    // falling back to it for inactive sessions lit up one branch per session
    // and made several sessions look active at once. The active highlight must
    // belong only to the active session's active branch.
    const sessionId = SessionId('session-1')
    const rows = buildSidebarBranchRows({
      session: session({
        id: sessionId,
        branches: [
          branch({ sessionId, id: 'session-1:main', name: 'main', isMain: true }),
          branch({ sessionId, id: 'session-1:branch:a', name: 'Branch 2' }),
        ],
      }),
      activeBranchId: resolveActiveBranchIdForSession({
        sessionId,
        activeSessionId: SessionId('session-2'),
        activeBranchId: SessionBranchId('session-1:branch:a'),
      }),
      draftBranch: null,
    })

    expect(rows.filter((row) => row.type === 'branch' && row.isActive)).toEqual([])
  })

  it('highlights the active branch only for the active session', () => {
    const sessionId = SessionId('session-1')
    const rows = buildSidebarBranchRows({
      session: session({
        id: sessionId,
        branches: [
          branch({ sessionId, id: 'session-1:main', name: 'main', isMain: true }),
          branch({ sessionId, id: 'session-1:branch:a', name: 'Branch 2' }),
        ],
      }),
      activeBranchId: resolveActiveBranchIdForSession({
        sessionId,
        activeSessionId: sessionId,
        activeBranchId: SessionBranchId('session-1:branch:a'),
      }),
      draftBranch: null,
    })

    const activeBranchIds = rows
      .filter((row) => row.type === 'branch' && row.isActive)
      .map((row) => (row.type === 'branch' ? String(row.branch.id) : null))
    expect(activeBranchIds).toEqual(['session-1:branch:a'])
  })
})

describe('resolveActiveBranchIdForSession', () => {
  it('returns the active branch id for the active session', () => {
    expect(
      resolveActiveBranchIdForSession({
        sessionId: SessionId('session-1'),
        activeSessionId: SessionId('session-1'),
        activeBranchId: SessionBranchId('session-1:branch:a'),
      }),
    ).toBe(SessionBranchId('session-1:branch:a'))
  })

  it('returns null for a non-active session even when an activeBranchId is provided', () => {
    expect(
      resolveActiveBranchIdForSession({
        sessionId: SessionId('session-1'),
        activeSessionId: SessionId('session-2'),
        activeBranchId: SessionBranchId('session-1:branch:a'),
      }),
    ).toBeNull()
  })
})
