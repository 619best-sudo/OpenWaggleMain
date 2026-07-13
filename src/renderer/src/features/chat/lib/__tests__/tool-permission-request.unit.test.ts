import type { UIMessage } from '@shared/types/chat-ui'
import { describe, expect, it } from 'vitest'
import { findLatestPendingToolPermissionRequest } from '../tool-permission-request'

function makePermissionMessage(overrides?: Partial<UIMessage>): UIMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    createdAt: new Date(),
    parts: [
      {
        type: 'tool-result',
        toolCallId: 'tool-1',
        state: 'complete',
        content: {
          content: [{ type: 'text', text: 'Permission required before running bash: ls -la' }],
          details: {
            kind: 'tool_permission_request',
            toolName: 'bash',
            args: { command: 'ls -la', timeout: 5000 },
            request: {
              model: 'model-b',
              permission: {
                title: 'Approve Bash',
                description: 'OpenWaggle requested permission before running bash.',
              },
            },
          },
        },
      },
    ],
    ...overrides,
  }
}

describe('findLatestPendingToolPermissionRequest', () => {
  it('extracts the latest permission request from transcript messages', () => {
    const request = findLatestPendingToolPermissionRequest([makePermissionMessage()], new Set())

    expect(request).toEqual({
      messageId: 'assistant-1',
      toolCallId: 'tool-1',
      toolName: 'bash',
      input: { command: 'ls -la', timeout: 5000 },
      title: 'Approve Bash',
      description: 'OpenWaggle requested permission before running bash.',
      model: 'model-b',
      summary: 'Permission required before running bash: ls -la',
    })
  })

  it('skips dismissed permission requests', () => {
    const request = findLatestPendingToolPermissionRequest(
      [makePermissionMessage()],
      new Set(['tool-1']),
    )

    expect(request).toBeNull()
  })
})
