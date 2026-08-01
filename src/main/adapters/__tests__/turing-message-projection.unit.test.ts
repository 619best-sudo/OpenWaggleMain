import { describe, expect, it } from 'vitest'
import type { Message } from '@shared/types/agent'
import { MessageId } from '@shared/types/brand'
import {
  buildCustomSessionNode,
  buildSessionSnapshotFromMessages,
  buildSessionSnapshotFromTimeline,
  buildTuringRunNewMessagesFromProjected,
  turingAppendedToProjectedMessages,
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

describe('turingAppendedToProjectedMessages: handoff contract stripping', () => {
  type TuringMessage = Parameters<typeof turingAppendedToProjectedMessages>[0][number]

  function assistantText(text: string): TuringMessage {
    return {
      role: 'assistant',
      content: [{ type: 'text', text }],
      model: 'm',
      api: 'openrouter',
      provider: 'x',
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: 'stop',
      timestamp: 0,
    } as TuringMessage
  }

  function assistantWithToolCall(): TuringMessage {
    return {
      role: 'assistant',
      content: [
        { type: 'text', text: 'SUMMARY:\nraw handoff\nUI SUMMARY:\nDoing the edit\nCATEGORY: frontend\nPLAN_JSON: []' },
        { type: 'toolCall', id: 'call-1', name: 'edit', arguments: { path: '/a' } },
      ],
      model: 'm',
      api: 'openrouter',
      provider: 'x',
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: 'tool_use',
      timestamp: 0,
    } as unknown as TuringMessage
  }

  it('keeps only the UI SUMMARY prose from a phase-final handoff text block', () => {
    const [projected] = turingAppendedToProjectedMessages([
      assistantText('SUMMARY:\nprepared a shortlist\nUI SUMMARY:\nFound the files that matter.\nCATEGORY: frontend\nTOOL CHAIN:\nnone'),
    ])
    const textParts = projected!.parts.filter((part) => part.type === 'text')
    expect(textParts).toHaveLength(1)
    expect((textParts[0] as { text: string }).text).toBe('Found the files that matter.')
  })

  it('drops a handoff text block with no UI SUMMARY entirely (no empty bubble)', () => {
    const [projected] = turingAppendedToProjectedMessages([
      assistantText('PLAN_JSON: []\nCATEGORY: frontend\nVERDICT: PASS'),
    ])
    const textParts = projected!.parts.filter((part) => part.type === 'text')
    expect(textParts).toHaveLength(0)
  })

  it('preserves conversational assistant text that has no contract markers', () => {
    const [projected] = turingAppendedToProjectedMessages([
      assistantText('Sure! Let me look at that for you.'),
    ])
    const textParts = projected!.parts.filter((part) => part.type === 'text')
    expect(textParts).toHaveLength(1)
    expect((textParts[0] as { text: string }).text).toBe('Sure! Let me look at that for you.')
  })

  it('keeps tool-call parts even when the same message has handoff text', () => {
    const [projected] = turingAppendedToProjectedMessages([assistantWithToolCall()])
    const toolCallParts = projected!.parts.filter((part) => part.type === 'tool-call')
    expect(toolCallParts).toHaveLength(1)
    // The handoff text is reduced to the UI SUMMARY prose; tool call survives.
    const textParts = projected!.parts.filter((part) => part.type === 'text')
    expect(textParts).toHaveLength(1)
    expect((textParts[0] as { text: string }).text).toBe('Doing the edit')
  })
})

describe('buildTuringRunNewMessagesFromProjected: single-projection dedup', () => {
  it('reuses the already-projected message ids so snapshot and newMessages agree', () => {
    // Project once (as the run-result builder now does).
    const projected = turingAppendedToProjectedMessages([
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'hello there' }],
        model: 'm', api: 'openrouter', provider: 'x',
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: 'stop', timestamp: 0,
      } as unknown as Parameters<typeof turingAppendedToProjectedMessages>[0][number],
    ])
    const projectedAssistantId = projected[0]!.id

    // Build newMessages from the SAME projection (no re-projection).
    const newMessages = buildTuringRunNewMessagesFromProjected(
      { text: 'do the thing', attachments: [] } as Parameters<typeof buildTuringRunNewMessagesFromProjected>[0],
      projected,
    )

    // user turn + the one assistant message, sharing the projected id.
    expect(newMessages).toHaveLength(2)
    expect(newMessages[1]!.role).toBe('assistant')
    expect(newMessages[1]!.id).toBe(projectedAssistantId)
  })
})

describe('turingAppendedToProjectedMessages: streamed-id reuse (dedup vs live stream)', () => {
  type TuringMessage = Parameters<typeof turingAppendedToProjectedMessages>[0][number]

  function assistantWithToolCall(id: string, name: string): TuringMessage {
    return {
      role: 'assistant',
      content: [{ type: 'toolCall', id, name, arguments: {} }],
      model: 'm', api: 'openrouter', provider: 'x',
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: 'tool_use', timestamp: 0,
    } as unknown as TuringMessage
  }
  function toolResult(toolCallId: string): TuringMessage {
    return {
      role: 'toolResult',
      content: [{ type: 'text', text: 'ok' }],
      toolCallId, toolName: 'read', isError: false, timestamp: 0,
    } as unknown as TuringMessage
  }

  it('assigns streamed assistant ids positionally so the persisted snapshot matches the live stream', () => {
    const appended = [
      assistantWithToolCall('tc-1', 'read'),
      toolResult('tc-1'),
      assistantWithToolCall('tc-2', 'edit'),
      toolResult('tc-2'),
    ]
    // The mapper assigned these streamed messageIds (one per assistant turn).
    const streamedIds = ['streamed-msg-A', 'streamed-msg-B']
    const projected = turingAppendedToProjectedMessages(appended, streamedIds)

    // Two assistant turns → two projected assistant messages, each reusing its
    // streamed id (toolResults fold into the preceding assistant message).
    const assistantMessages = projected.filter((message) => message.role === 'assistant')
    expect(assistantMessages).toHaveLength(2)
    expect(assistantMessages[0]!.id).toBe('streamed-msg-A')
    expect(assistantMessages[1]!.id).toBe('streamed-msg-B')
  })

  it('leaves ids untouched when the streamed count does not match the projected count', () => {
    const appended = [assistantWithToolCall('tc-1', 'read')]
    // Wrong count (2 streamed vs 1 projected) → no misalignment, ids untouched.
    const projected = turingAppendedToProjectedMessages(appended, ['a', 'b'])
    expect(projected[0]!.id).not.toBe('a')
    expect(projected[0]!.id).not.toBe('b')
  })
})
