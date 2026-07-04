import type { Message } from '@shared/types/agent'
import { MessageId, ToolCallId } from '@shared/types/brand'
import { describe, expect, it } from 'vitest'
import {
  getVisibleMachineTaskMessages,
  isInternalToolHandoffAssistantText,
} from '../machine-run-service'

function assistantMessage(id: string, parts: Message['parts']): Message {
  return {
    id: MessageId(id),
    role: 'assistant',
    createdAt: 1,
    parts,
  }
}

describe('machine-run-service visible task output', () => {
  it('recognizes internal tool handoff assistant payloads', () => {
    expect(
      isInternalToolHandoffAssistantText(
        `[TOOL_HANDOFF]
{"type":"tool_handoff","tool":"read","tool_call_id":"call_123","status":"ok"}`,
      ),
    ).toBe(true)

    expect(isInternalToolHandoffAssistantText('Created the file successfully.')).toBe(false)
  })

  it('ignores tool-handoff-only assistant output when deciding whether a task visibly executed', () => {
    const visibleMessages = getVisibleMachineTaskMessages([
      assistantMessage('assistant-handoff', [
        {
          type: 'text',
          text: `[TOOL_HANDOFF]
{"type":"tool_handoff","tool":"read","tool_call_id":"call_123","status":"ok"}`,
        },
      ]),
    ])

    expect(visibleMessages).toEqual([])
  })

  it('keeps assistant messages that contain tool activity or visible text output', () => {
    const visibleMessages = getVisibleMachineTaskMessages([
      assistantMessage('assistant-tool', [
        {
          type: 'tool-call',
          toolCall: {
            id: ToolCallId('tool-call-1'),
            name: 'write',
            args: { path: 'index.html' },
            state: 'input-complete',
          },
        },
        {
          type: 'tool-result',
          toolResult: {
            id: ToolCallId('tool-call-1'),
            name: 'write',
            args: { path: 'index.html' },
            result: { ok: true },
            isError: false,
            duration: 10,
            details: null,
          },
        },
      ]),
      assistantMessage('assistant-text', [{ type: 'text', text: 'Created `index.html`.' }]),
    ])

    expect(visibleMessages.map((message) => String(message.id))).toEqual([
      'assistant-tool',
      'assistant-text',
    ])
  })
})
