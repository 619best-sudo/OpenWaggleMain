import type { HarnessAgentState } from 'turing-harness'
import { describe, expect, it } from 'vitest'
import { buildRunTranscriptNode } from '../turing-classic-run'

function makeState(
  overrides: Partial<
    Pick<
      HarnessAgentState,
      'lastRunSummary' | 'lastSteps' | 'lastPlanSet' | 'lastThreadSnapshot' | 'pendingUserQuestion'
    >
  > = {},
): Pick<
  HarnessAgentState,
  'lastRunSummary' | 'lastSteps' | 'lastPlanSet' | 'lastThreadSnapshot' | 'pendingUserQuestion'
> {
  return {
    lastRunSummary: undefined,
    lastSteps: undefined,
    lastPlanSet: undefined,
    lastThreadSnapshot: undefined,
    pendingUserQuestion: undefined,
    ...overrides,
  }
}

describe('buildRunTranscriptNode', () => {
  it('persists a pending clarification even when no other output exists', () => {
    const node = buildRunTranscriptNode(
      makeState({
        pendingUserQuestion: {
          phase: 'plan',
          question:
            'To change the header name, please provide the file path and the current header name you want to changed.',
          kind: 'clarification',
        },
      }),
      [],
      123,
    )

    expect(node).toBeDefined()
    expect(node?.contentJson).toContain('openwaggle.phase-transcript')
    expect(node?.contentJson).toContain('"pendingUserQuestion"')
    expect(node?.contentJson).toContain('please provide the file path')
  })

  it('projects the run as a single working phase carrying the run summary', () => {
    const node = buildRunTranscriptNode(
      makeState({
        lastRunSummary: 'Updated the header in index.html.',
        lastSteps: [
          {
            planId: 'p1',
            taskId: 't1',
            title: 'edit header',
            summary: 'x',
            complexity: 'low',
            isCompleted: true,
            files: ['/tmp/index.html'],
          },
        ],
        lastThreadSnapshot: {
          timestamp: 1,
          task: 'change the header',
          route: 'task',
          disposition: 'completed',
          recommendedFollowUpMode: 'structured_continue',
          summary: 'Updated the header in index.html.',
        } as never,
      }),
      [],
      456,
    )

    expect(node).toBeDefined()
    const parsed = JSON.parse(node!.contentJson) as {
      data: { phases: Array<{ id: string; status: string; summary?: string }> }
    }
    const phases = parsed.data.phases
    expect(phases).toHaveLength(1)
    expect(phases[0]?.id).toBe('working')
    expect(phases[0]?.status).toBe('completed')
    expect(phases[0]?.summary).toBe('Updated the header in index.html.')
  })

  it('marks a failed disposition as a failed working phase', () => {
    const node = buildRunTranscriptNode(
      makeState({
        lastRunSummary: 'Could not finish.',
        lastThreadSnapshot: {
          timestamp: 1,
          task: 'x',
          route: 'task',
          disposition: 'failed',
          recommendedFollowUpMode: 'structured_continue',
          summary: 'Could not finish.',
          error: 'model request failed',
        } as never,
      }),
      [],
      789,
    )
    const parsed = JSON.parse(node!.contentJson) as {
      data: { phases: Array<{ id: string; status: string }> }
    }
    expect(parsed.data.phases[0]?.status).toBe('failed')
  })

  it('returns undefined when the run produced no signal worth persisting', () => {
    const node = buildRunTranscriptNode(makeState(), [], 1)
    expect(node).toBeUndefined()
  })
})

/**
 * The audit classifies by tool NAME, and the first-party `mobile`/`drive` tools
 * carry their action in an argument — so every call reaches it as the single name
 * `mobile`, which tells it nothing about whether the run looked at the screen.
 * This is the same gap `executedCommands` exists to close for `bash`, and it is
 * closed the same way: the action is extracted and appended to the tool names.
 *
 * Without it, the run replayed here — a Flutter screen edited, then screenshotted
 * on a simulator — was reported as never having captured anything.
 */
describe('device tool actions reach the visual audit', () => {
  const deviceCall = (id: string, action: string) => ({
    role: 'assistant' as const,
    content: [{ type: 'toolCall' as const, id, name: 'mobile', arguments: { action } }],
  })

  const nodeFor = (messages: readonly unknown[]) =>
    buildRunTranscriptNode(
      makeState({
        lastRunSummary: 'Changed the popup title.',
        lastThreadSnapshot: {
          timestamp: 1,
          task: 'change the title of delete account popup',
          route: 'task',
          disposition: 'completed',
          recommendedFollowUpMode: 'structured_continue',
          summary: 'Changed the popup title.',
          writtenPaths: ['/app/lib/screens/profile/profile_screen.dart'],
        } as never,
      }),
      messages as never,
      789,
      { userText: 'change the title of delete account popup', availableToolNames: ['mobile', 'drive'] },
    )

  it('does not warn when the run screenshotted the screen it changed', () => {
    const node = nodeFor([deviceCall('c1', 'launch'), deviceCall('c2', 'look')])
    expect(node).toBeDefined()
    expect(node!.contentJson).not.toContain('Unverified visual change')
  })

  it('still warns when the run only launched the app', () => {
    const node = nodeFor([deviceCall('c1', 'launch'), deviceCall('c2', 'tap')])
    expect(node).toBeDefined()
    expect(node!.contentJson).toContain('Unverified visual change')
  })
})
