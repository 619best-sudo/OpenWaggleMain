import { describe, expect, it } from 'vitest'
import type { Message } from '@shared/types/agent'
import { MessageId } from '@shared/types/brand'
import {
  buildCustomSessionNode,
  buildSessionSnapshotFromMessages,
  buildSessionSnapshotFromTimeline,
} from '../turing/turing-message-projection'

function message(input: {
  readonly id: string
  readonly role: Message['role']
  readonly text: string
  readonly createdAt: number
}): Message {
  return {
    id: MessageId(input.id),
    role: input.role,
    parts: [{ type: 'text', text: input.text }],
    createdAt: input.createdAt,
  }
}

describe('turing message projection', () => {
  it('keeps the basic message-only snapshot linear', () => {
    const snapshot = buildSessionSnapshotFromMessages([
      message({ id: 'user-1', role: 'user', text: 'hello', createdAt: 1 }),
      message({ id: 'assistant-1', role: 'assistant', text: 'hi', createdAt: 2 }),
    ])

    expect(snapshot.activeNodeId).toBe('assistant-1')
    expect(snapshot.nodes).toEqual([
      expect.objectContaining({
        id: 'user-1',
        parentId: null,
        kind: 'user_message',
        role: 'user',
        pathDepth: 0,
        createdOrder: 0,
      }),
      expect.objectContaining({
        id: 'assistant-1',
        parentId: 'user-1',
        kind: 'assistant_message',
        role: 'assistant',
        pathDepth: 1,
        createdOrder: 1,
      }),
    ])
  })

  it('persists bridge debug data as an in-order custom node', () => {
    const user = message({ id: 'user-1', role: 'user', text: 'build it', createdAt: 10 })
    const assistant = message({
      id: 'assistant-1',
      role: 'assistant',
      text: 'working on it',
      createdAt: 30,
    })
    const bridgeNode = buildCustomSessionNode({
      nodeId: 'bridge-1',
      customType: 'turing_bridge_status',
      data: {
        enabledMcpNames: ['playwright'],
        activeSkillToolNames: ['openwaggle_skill_ui_critic'],
      },
      timestampMs: 20,
    })

    const snapshot = buildSessionSnapshotFromTimeline([
      { type: 'message', message: user },
      { type: 'node', node: bridgeNode },
      { type: 'message', message: assistant },
    ])

    expect(snapshot.activeNodeId).toBe('assistant-1')
    expect(snapshot.nodes).toEqual([
      expect.objectContaining({
        id: 'user-1',
        parentId: null,
        kind: 'user_message',
        role: 'user',
        pathDepth: 0,
        createdOrder: 0,
      }),
      expect.objectContaining({
        id: 'bridge-1',
        parentId: 'user-1',
        piEntryType: 'custom',
        kind: 'custom',
        role: null,
        pathDepth: 1,
        createdOrder: 1,
        metadataJson: '{}',
      }),
      expect.objectContaining({
        id: 'assistant-1',
        parentId: 'bridge-1',
        kind: 'assistant_message',
        role: 'assistant',
        pathDepth: 2,
        createdOrder: 2,
      }),
    ])
    expect(JSON.parse(snapshot.nodes[1]!.contentJson)).toEqual({
      customType: 'turing_bridge_status',
      data: {
        enabledMcpNames: ['playwright'],
        activeSkillToolNames: ['openwaggle_skill_ui_critic'],
      },
    })
  })
})
