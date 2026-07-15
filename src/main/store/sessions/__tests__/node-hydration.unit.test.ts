import { TOOL_PERMISSION_CUSTOM_TYPE } from '@shared/types/tool-permission'
import { describe, expect, it } from 'vitest'
import { buildSessionNodes, visibleNodeIdForHead } from '../node-hydration'
import type { SessionNodeRow } from '../../session-details/types'

function makeRow(overrides: Partial<SessionNodeRow> & Pick<SessionNodeRow, 'id'>): SessionNodeRow {
  return {
    id: overrides.id,
    session_id: overrides.session_id ?? 'session-1',
    parent_id: overrides.parent_id ?? null,
    pi_entry_type: overrides.pi_entry_type ?? 'message',
    kind: overrides.kind ?? 'assistant_message',
    role: overrides.role ?? 'assistant',
    timestamp_ms: overrides.timestamp_ms ?? 0,
    content_json: overrides.content_json ?? '{"parts":[],"model":null}',
    metadata_json: overrides.metadata_json ?? '{}',
    branch_hint_id: overrides.branch_hint_id ?? null,
    path_depth: overrides.path_depth ?? 0,
    created_order: overrides.created_order ?? 0,
  }
}

describe('buildSessionNodes', () => {
  it('hides internal approved-tool resume assistant nodes from the visible transcript tree', () => {
    const rows = [
      makeRow({
        id: 'user-1',
        kind: 'user_message',
        role: 'user',
        timestamp_ms: 10,
        content_json: JSON.stringify({
          parts: [{ type: 'text', text: 'run ls' }],
          model: null,
        }),
      }),
      makeRow({
        id: 'assistant-tool-call-1',
        parent_id: 'user-1',
        kind: 'assistant_message',
        role: 'assistant',
        timestamp_ms: 20,
        path_depth: 1,
        created_order: 1,
        content_json: JSON.stringify({
          parts: [
            {
              type: 'tool-call',
              toolCall: {
                id: 'tool-request',
                name: 'bash',
                args: { command: 'ls -la' },
                state: 'input-complete',
              },
            },
          ],
          model: 'turing-machine/turing-machine',
        }),
      }),
      makeRow({
        id: 'tool-result-request',
        parent_id: 'assistant-tool-call-1',
        kind: 'tool_result',
        role: null,
        timestamp_ms: 30,
        path_depth: 2,
        created_order: 2,
        content_json: JSON.stringify({
          parts: [
            {
              type: 'tool-result',
              toolResult: {
                id: 'tool-request',
                name: 'bash',
                args: { command: 'ls -la' },
                result: {
                  content: [{ type: 'text', text: 'Permission required before running bash: ls -la' }],
                  details: {
                    kind: 'tool_permission_request',
                    toolName: 'bash',
                    input: { command: 'ls -la' },
                  },
                },
                isError: false,
                duration: 0,
                details: {
                  kind: 'tool_permission_request',
                  toolName: 'bash',
                  input: { command: 'ls -la' },
                },
              },
            },
          ],
          model: null,
        }),
      }),
      makeRow({
        id: 'permission-approved',
        parent_id: 'tool-result-request',
        pi_entry_type: 'custom_message',
        kind: 'custom',
        role: null,
        timestamp_ms: 40,
        path_depth: 3,
        created_order: 3,
        content_json: JSON.stringify({
          customType: TOOL_PERMISSION_CUSTOM_TYPE,
          content: null,
          display: false,
          details: {
            source: 'openwaggle',
            kind: 'tool-permission-resolution',
            decision: 'approved',
            toolCallId: 'tool-request',
            toolName: 'bash',
            input: { command: 'ls -la' },
            model: 'poolside/laguna-xs-2.1',
          },
        }),
        metadata_json: JSON.stringify({
          customType: TOOL_PERMISSION_CUSTOM_TYPE,
          display: false,
        }),
      }),
      makeRow({
        id: 'assistant-tool-call-2',
        parent_id: 'permission-approved',
        kind: 'assistant_message',
        role: 'assistant',
        timestamp_ms: 50,
        path_depth: 4,
        created_order: 4,
        content_json: JSON.stringify({
          parts: [
            { type: 'reasoning', text: 'Resume the approved tool call.' },
            {
              type: 'tool-call',
              toolCall: {
                id: 'tool-resumed',
                name: 'bash',
                args: { command: 'ls -la' },
                state: 'input-complete',
              },
            },
          ],
          model: 'turing-machine/turing-machine',
        }),
      }),
      makeRow({
        id: 'tool-result-final',
        parent_id: 'assistant-tool-call-2',
        kind: 'tool_result',
        role: null,
        timestamp_ms: 60,
        path_depth: 5,
        created_order: 5,
        content_json: JSON.stringify({
          parts: [
            {
              type: 'tool-result',
              toolResult: {
                id: 'tool-resumed',
                name: 'bash',
                args: {},
                result: { content: [{ type: 'text', text: 'total 64' }] },
                isError: false,
                duration: 4,
              },
            },
          ],
          model: null,
        }),
      }),
    ] satisfies SessionNodeRow[]

    const nodes = buildSessionNodes(rows)

    expect(nodes.map((node) => String(node.id))).toEqual([
      'user-1',
      'assistant-tool-call-1',
      'tool-result-request',
      'tool-result-final',
    ])
    expect(nodes[2]?.message?.parts).toMatchObject([
      {
        type: 'tool-result',
        toolResult: {
          id: 'tool-request',
        },
      },
    ])
    expect(nodes[3]?.message?.parts).toMatchObject([
      {
        type: 'tool-result',
        toolResult: {
          id: 'tool-resumed',
        },
      },
    ])
    expect(String(nodes[3]?.parentId)).toBe('tool-result-request')
    expect(visibleNodeIdForHead('assistant-tool-call-2', rows)).toBe('tool-result-request')
    expect(visibleNodeIdForHead('tool-result-final', rows)).toBe('tool-result-final')
  })
})
