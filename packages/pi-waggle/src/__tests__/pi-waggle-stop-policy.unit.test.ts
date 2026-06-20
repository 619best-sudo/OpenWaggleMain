import type { AgentEndEvent } from '@mariozechner/pi-coding-agent'
import type { WaggleConfig } from '@openwaggle/waggle-core'
import { describe, expect, it } from 'vitest'
import {
  createPiWaggleStopPolicyState,
  evaluatePiWaggleStopPolicy,
  summarizePiWaggleTurnMessages,
} from '../stop-policy'

const MAX_TURNS = 2

function config(): WaggleConfig {
  return {
    mode: 'sequential',
    agents: [
      {
        label: 'Architect',
        model: 'openai/gpt-5.5',
        roleDescription: 'Designs',
        color: 'blue',
        outputContract: { requiredSections: ['progress', 'files_changed'] },
      },
      {
        label: 'Reviewer',
        model: 'anthropic/claude-sonnet-4',
        roleDescription: 'Reviews',
        color: 'amber',
        outputContract: { requiredSections: ['progress', 'files_changed'] },
      },
    ],
    stop: { primary: 'consensus', maxTurnsSafety: MAX_TURNS },
  }
}

function qaConfig(): WaggleConfig {
  return {
    mode: 'sequential',
    agents: [
      {
        label: 'QA / Runtime Governor',
        model: 'openai/gpt-5.5',
        roleDescription: 'Tests the game in the browser.',
        color: 'amber',
        outputContract: {
          requiredSections: [
            'loop_verdict',
            'failure_categories',
            'top_blockers',
            'evidence_reviewed',
            'screenshots',
            'logs',
            'exact_next_cycle',
          ],
        },
      },
    ],
    stop: { primary: 'consensus', maxTurnsSafety: MAX_TURNS },
  }
}

function assistantMessage(input: {
  readonly text?: string
  readonly stopReason?: 'stop' | 'length' | 'toolUse' | 'error' | 'aborted'
  readonly errorMessage?: string
  readonly toolCallId?: string
  readonly toolCallName?: string
}): AgentEndEvent['messages'][number] {
  const content: Array<
    | { type: 'text'; text: string }
    | { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> }
  > = []
  if (input.text) content.push({ type: 'text', text: input.text })
  if (input.toolCallId && input.toolCallName) {
    content.push({
      type: 'toolCall',
      id: input.toolCallId,
      name: input.toolCallName,
      arguments: {},
    })
  }

  return {
    role: 'assistant',
    content,
    api: 'openai-completions',
    provider: 'openai',
    model: 'gpt-5.5',
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: input.stopReason ?? 'stop',
    ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
    timestamp: Date.now(),
  }
}

function toolResultMessage(toolCallId: string): AgentEndEvent['messages'][number] {
  return {
    role: 'toolResult',
    toolCallId,
    toolName: 'write',
    content: [{ type: 'text', text: 'ok' }],
    isError: false,
    timestamp: Date.now(),
  }
}

describe('pi-waggle stop policy', () => {
  it('stops after two consecutive recoverable errors', () => {
    const waggleConfig = config()
    const first = evaluatePiWaggleStopPolicy({
      config: waggleConfig,
      turnNumber: 0,
      summary: summarizePiWaggleTurnMessages([
        assistantMessage({ stopReason: 'error', errorMessage: 'Provider timeout' }),
      ]),
      state: createPiWaggleStopPolicyState(),
      agentLabel: 'Architect',
    })
    expect(first.continue).toBe(true)

    const second = evaluatePiWaggleStopPolicy({
      config: waggleConfig,
      turnNumber: 1,
      summary: summarizePiWaggleTurnMessages([
        assistantMessage({ stopReason: 'error', errorMessage: 'Provider timeout' }),
      ]),
      state: first.state,
      agentLabel: 'Reviewer',
    })
    expect(second.continue).toBe(false)
    expect(second.stop).toEqual({
      classification: 'stopped',
      reason: 'Provider timeout',
    })
  })

  it('stops immediately when an assistant turn is aborted', () => {
    const decision = evaluatePiWaggleStopPolicy({
      config: config(),
      turnNumber: 0,
      summary: summarizePiWaggleTurnMessages([assistantMessage({ stopReason: 'aborted' })]),
      state: createPiWaggleStopPolicyState(),
      agentLabel: 'Architect',
    })

    expect(decision.continue).toBe(false)
    expect(decision.turnSucceeded).toBe(false)
    expect(decision.stop).toEqual({
      classification: 'stopped',
      reason: 'Waggle stopped because the assistant turn was aborted.',
    })
  })

  it('stops immediately when unresolved tool calls remain', () => {
    const decision = evaluatePiWaggleStopPolicy({
      config: config(),
      turnNumber: 0,
      summary: summarizePiWaggleTurnMessages([
        assistantMessage({ text: 'Working on it', toolCallId: 'tool-1', toolCallName: 'write' }),
      ]),
      state: createPiWaggleStopPolicyState(),
      agentLabel: 'Architect',
    })

    expect(decision.continue).toBe(false)
    expect(decision.stop?.classification).toBe('stopped')
    expect(decision.stop?.reason).toContain('unresolved tool calls')
  })

  it('continues when tool calls are resolved by tool result messages', () => {
    const decision = evaluatePiWaggleStopPolicy({
      config: config(),
      turnNumber: 0,
      summary: summarizePiWaggleTurnMessages([
        assistantMessage({
          text: 'progress: writing file\nfiles_changed: src/main.tsx',
          toolCallId: 'tool-1',
          toolCallName: 'write',
        }),
        toolResultMessage('tool-1'),
      ]),
      state: createPiWaggleStopPolicyState(),
      agentLabel: 'Architect',
    })

    expect(decision.continue).toBe(true)
    expect(decision.turnSucceeded).toBe(true)
  })

  it('treats missing output contract sections as a recoverable error turn', () => {
    const decision = evaluatePiWaggleStopPolicy({
      config: config(),
      turnNumber: 0,
      summary: summarizePiWaggleTurnMessages([assistantMessage({ text: 'progress: working on it' })]),
      state: createPiWaggleStopPolicyState(),
      agentLabel: 'Architect',
    })

    expect(decision.continue).toBe(true)
    expect(decision.turnSucceeded).toBe(false)
    expect(decision.stop).toBeUndefined()
    expect(decision.state.consecutiveErrorTurns).toBe(1)
  })

  it('accepts human-friendly contract headings in stop policy evaluation', () => {
    const decision = evaluatePiWaggleStopPolicy({
      config: config(),
      turnNumber: 0,
      summary: summarizePiWaggleTurnMessages([
        assistantMessage({
          text:
            'Progress: built the board\nFiles changed: server.js public/game.js\nCommands run: npm install\nArtifacts: none\nBlockers: none\nNext task: implement turn logic',
        }),
      ]),
      state: createPiWaggleStopPolicyState(),
      agentLabel: 'Architect',
    })

    expect(decision.continue).toBe(true)
    expect(decision.turnSucceeded).toBe(true)
  })

  it('completes when consensus is reached', () => {
    const waggleConfig = config()
    const first = evaluatePiWaggleStopPolicy({
      config: waggleConfig,
      turnNumber: 0,
      summary: summarizePiWaggleTurnMessages([
        assistantMessage({
          text:
            'progress: propose migrating orchestration into the package and keeping runtime state Pi-native.\nfiles_changed: none',
        }),
      ]),
      state: createPiWaggleStopPolicyState(),
      agentLabel: 'Architect',
    })
    expect(first.continue).toBe(true)

    const second = evaluatePiWaggleStopPolicy({
      config: waggleConfig,
      turnNumber: 1,
      summary: summarizePiWaggleTurnMessages([
        assistantMessage({
          text: 'progress: I agree, that plan is correct and we are aligned.\nfiles_changed: none',
        }),
      ]),
      state: first.state,
      agentLabel: 'Reviewer',
    })

    expect(second.continue).toBe(false)
    expect(second.stop?.classification).toBe('complete')
    expect(second.stop?.reason).toContain('Consensus reached')
  })

  it('treats QA approval without evidence artifacts as a recoverable error turn', () => {
    const decision = evaluatePiWaggleStopPolicy({
      config: qaConfig(),
      turnNumber: 0,
      summary: summarizePiWaggleTurnMessages([
        assistantMessage({
          text:
            'loop_verdict: approved\nfailure_categories: none\ntop_blockers: none\nevidence_reviewed: browser checked\nscreenshots: none\nlogs: none\nexact_next_cycle: none',
        }),
      ]),
      state: createPiWaggleStopPolicyState(),
      agentLabel: 'QA / Runtime Governor',
    })

    expect(decision.continue).toBe(true)
    expect(decision.turnSucceeded).toBe(false)
    expect(decision.state.consecutiveErrorTurns).toBe(1)
  })

  it('treats QA non-approval with failure_categories none as a recoverable error turn', () => {
    const decision = evaluatePiWaggleStopPolicy({
      config: qaConfig(),
      turnNumber: 0,
      summary: summarizePiWaggleTurnMessages([
        assistantMessage({
          text:
            'loop_verdict: another cycle required\nfailure_categories: none\ntop_blockers: dice roll broken\nevidence_reviewed: opened the browser and clicked roll dice\nscreenshots: board.png\nlogs: console.log\nexact_next_cycle: repair dice interaction and retest',
        }),
      ]),
      state: createPiWaggleStopPolicyState(),
      agentLabel: 'QA / Runtime Governor',
    })

    expect(decision.continue).toBe(true)
    expect(decision.turnSucceeded).toBe(false)
    expect(decision.state.consecutiveErrorTurns).toBe(1)
  })

  it('accepts QA approval only when it includes concrete evidence and artifacts', () => {
    const decision = evaluatePiWaggleStopPolicy({
      config: qaConfig(),
      turnNumber: 0,
      summary: summarizePiWaggleTurnMessages([
        assistantMessage({
          text:
            'loop_verdict: approved\nfailure_categories: none\ntop_blockers: none\nevidence_reviewed: opened the browser, ran pnpm build, clicked the roll dice button, and checked console output\nscreenshots: ludo-board.png\nlogs: browser-console.txt\nexact_next_cycle: none',
        }),
      ]),
      state: createPiWaggleStopPolicyState(),
      agentLabel: 'QA / Runtime Governor',
    })

    expect(decision.continue).toBe(true)
    expect(decision.turnSucceeded).toBe(true)
    expect(decision.state.consecutiveErrorTurns).toBe(0)
  })

  it('rejects QA turns that use code-mutation tools instead of routing fixes back to builders', () => {
    const decision = evaluatePiWaggleStopPolicy({
      config: qaConfig(),
      turnNumber: 0,
      summary: summarizePiWaggleTurnMessages([
        assistantMessage({
          text:
            'loop_verdict: another cycle required\nfailure_categories: bootstrap\ntop_blockers: missing script.js\nevidence_reviewed: listed public files and confirmed script.js is missing\nscreenshots: none\nlogs: none\nexact_next_cycle: builder should add the missing script and retest',
          toolCallId: 'tool-1',
          toolCallName: 'write',
        }),
        toolResultMessage('tool-1'),
      ]),
      state: createPiWaggleStopPolicyState(),
      agentLabel: 'QA / Runtime Governor',
    })

    expect(decision.continue).toBe(true)
    expect(decision.turnSucceeded).toBe(false)
    expect(decision.state.consecutiveErrorTurns).toBe(1)
  })

  it('rejects QA turns that describe file creation as QA work', () => {
    const decision = evaluatePiWaggleStopPolicy({
      config: qaConfig(),
      turnNumber: 0,
      summary: summarizePiWaggleTurnMessages([
        assistantMessage({
          text:
            "loop_verdict: another cycle required\nfailure_categories: bootstrap\ntop_blockers: missing script.js\nevidence_reviewed: checked public directory and found script.js missing\nscreenshots: none\nlogs: none\nexact_next_cycle: none\nWe need to create public/script.js and implement the button handler.",
        }),
      ]),
      state: createPiWaggleStopPolicyState(),
      agentLabel: 'QA / Runtime Governor',
    })

    expect(decision.continue).toBe(true)
    expect(decision.turnSucceeded).toBe(false)
    expect(decision.state.consecutiveErrorTurns).toBe(1)
  })
})
