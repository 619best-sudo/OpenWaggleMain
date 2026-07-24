import { SessionId } from '@shared/types/brand'
import { afterEach, describe, expect, it } from 'vitest'
import {
  beginToolPermissionRequest,
  beginUserQuestionRequest,
  getPendingToolPermission,
  getPendingUserQuestion,
  resolvePendingToolPermission,
  resolvePendingUserQuestion,
  cancelAllSessionRuns,
} from '../active-agent-runs'

describe('active-agent-runs pending request resolution', () => {
  afterEach(() => {
    cancelAllSessionRuns()
  })

  it('rejects stale tool-permission resolutions that do not match the pending request', async () => {
    const sessionId = SessionId('session-tool')
    const pendingResolution = beginToolPermissionRequest(
      sessionId,
      {
        toolCallId: 'tool-1',
        toolName: 'write',
        input: { path: 'a.ts' },
      },
      undefined,
    )

    expect(getPendingToolPermission(sessionId)).toEqual({
      toolCallId: 'tool-1',
      toolName: 'write',
      input: { path: 'a.ts' },
    })

    expect(
      resolvePendingToolPermission(sessionId, {
        request: {
          toolCallId: 'tool-2',
          toolName: 'write',
          input: { path: 'a.ts' },
        },
        decision: 'approved',
      }),
    ).toBe(false)

    expect(
      resolvePendingToolPermission(sessionId, {
        request: {
          toolCallId: 'tool-1',
          toolName: 'write',
          input: { path: 'a.ts' },
        },
        decision: 'approved',
      }),
    ).toBe(true)

    await expect(pendingResolution).resolves.toEqual({
      request: {
        toolCallId: 'tool-1',
        toolName: 'write',
        input: { path: 'a.ts' },
      },
      decision: 'approved',
    })
    expect(getPendingToolPermission(sessionId)).toBeNull()
  })

  it('tracks the pending user question and rejects mismatched answers', async () => {
    const sessionId = SessionId('session-question')
    const request = {
      phase: 'prepare' as const,
      question: 'Which file should I update?',
      kind: 'clarification' as const,
    }

    const pendingResolution = beginUserQuestionRequest(sessionId, request, undefined)

    expect(getPendingUserQuestion(sessionId)).toEqual(request)

    expect(
      resolvePendingUserQuestion(sessionId, {
        request: {
          ...request,
          question: 'Which component should I update?',
        },
        answer: 'Header.tsx',
      }),
    ).toBe(false)

    expect(
      resolvePendingUserQuestion(sessionId, {
        request,
        answer: 'src/Header.tsx',
      }),
    ).toBe(true)

    await expect(pendingResolution).resolves.toEqual({
      request,
      answer: 'src/Header.tsx',
    })
    expect(getPendingUserQuestion(sessionId)).toBeNull()
  })
})
