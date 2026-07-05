import type { AgentSendPayload } from '@shared/types/agent'
import { SessionId, SupportedModelId } from '@shared/types/brand'
import type { TeammateDefinition } from '@shared/types/teammate'
import type { WaggleConfig } from '@shared/types/waggle'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSendHandlers } from '../useSendMessage'

vi.mock('@/shared/lib/ipc', () => ({
  api: {
    sendMachineMessage: vi.fn(),
    sendMessage: vi.fn(),
    sendTeamMessage: vi.fn(),
    sendWaggleMessage: vi.fn(),
  },
}))

type SendDeps = Parameters<typeof createSendHandlers>[0]

function makeDeps(overrides: Partial<SendDeps> = {}) {
  return {
    activeSessionId: null,
    projectPath: '/test/project',
    thinkingLevel: 'medium',
    createSession: vi.fn<SendDeps['createSession']>().mockResolvedValue(SessionId('new-session')),
    sendMessage: vi.fn<(p: AgentSendPayload) => Promise<void>>().mockResolvedValue(undefined),
    sendMachineMessage: vi.fn<(p: AgentSendPayload) => Promise<void>>().mockResolvedValue(undefined),
    sendFirstMessageToSession: vi
      .fn<SendDeps['sendFirstMessageToSession']>()
      .mockResolvedValue(undefined),
    sendTeamMessage: vi.fn<SendDeps['sendTeamMessage']>().mockResolvedValue(undefined),
    sendWaggleMessage: vi
      .fn<(payload: AgentSendPayload) => Promise<void>>()
      .mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('createSendHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('handleSend', () => {
    it('with active session: calls sendMessage directly', async () => {
      const convId = SessionId('session-5')
      const deps = makeDeps({ activeSessionId: convId })
      const { handleSend } = createSendHandlers(deps)
      const payload: AgentSendPayload = { text: 'hello', thinkingLevel: 'medium', attachments: [] }

      await handleSend(payload)

      expect(deps.sendMessage).toHaveBeenCalledWith(payload)
    })

    it('without active session: creates a session and sends the first message to that exact session', async () => {
      const deps = makeDeps({ activeSessionId: null })
      const { handleSend } = createSendHandlers(deps)
      const payload: AgentSendPayload = { text: 'hello', thinkingLevel: 'medium', attachments: [] }

      await handleSend(payload)

      expect(deps.createSession).toHaveBeenCalledWith('/test/project')
      expect(deps.sendFirstMessageToSession).toHaveBeenCalledWith('new-session', payload, {
        kind: 'plain',
      })
      expect(deps.sendMessage).not.toHaveBeenCalled()
    })

    it('rejects first-message sends when no project is selected', async () => {
      const deps = makeDeps({
        activeSessionId: null,
        projectPath: null,
      })
      const { handleSend } = createSendHandlers(deps)
      const payload: AgentSendPayload = { text: 'hello', thinkingLevel: 'medium', attachments: [] }

      await expect(handleSend(payload)).rejects.toThrow('Select a project before sending.')

      expect(deps.createSession).not.toHaveBeenCalled()
      expect(deps.sendMessage).not.toHaveBeenCalled()
    })
  })

  describe('handleSendText', () => {
    it('wraps handleSend with correct payload shape', async () => {
      const convId = SessionId('session-6')
      const deps = makeDeps({ activeSessionId: convId, thinkingLevel: 'high' })
      const { handleSendText } = createSendHandlers(deps)

      await handleSendText('test message')

      expect(deps.sendMessage).toHaveBeenCalledWith({
        text: 'test message',
        thinkingLevel: 'high',
        attachments: [],
      })
    })
  })

  describe('handleSendWaggle', () => {
    it('sends first-message Waggle payloads to the created session instead of the next active session', async () => {
      const deps = makeDeps({ activeSessionId: null })
      const { handleSendWaggle } = createSendHandlers(deps)
      const payload: AgentSendPayload = { text: 'waggle', thinkingLevel: 'medium', attachments: [] }
      const config: WaggleConfig = {
        mode: 'sequential',
        agents: [
          {
            label: 'Planner',
            model: SupportedModelId('openai/gpt-5.5'),
            roleDescription: 'Plan the work',
            color: 'blue',
          },
          {
            label: 'Reviewer',
            model: SupportedModelId('anthropic/claude-sonnet-4-5'),
            roleDescription: 'Review the work',
            color: 'amber',
          },
        ],
        stop: { primary: 'consensus', maxTurnsSafety: 2 },
      }

      await handleSendWaggle(payload, config)

      expect(deps.createSession).toHaveBeenCalledWith('/test/project')
      expect(deps.sendFirstMessageToSession).toHaveBeenCalledWith('new-session', payload, {
        kind: 'waggle',
        config,
      })
      expect(deps.sendWaggleMessage).not.toHaveBeenCalled()
    })
  })

  describe('handleSendMachine', () => {
    it('sends first-message Machine payloads to the created session instead of plain chat', async () => {
      const onMachineSessionResolved = vi.fn()
      const deps = makeDeps({ activeSessionId: null, onMachineSessionResolved })
      const { handleSendMachine } = createSendHandlers(deps)
      const payload: AgentSendPayload = {
        text: 'Build a search experience',
        thinkingLevel: 'medium',
        attachments: [],
      }

      await handleSendMachine(payload)

      expect(deps.createSession).toHaveBeenCalledWith('/test/project')
      expect(deps.sendFirstMessageToSession).toHaveBeenCalledWith('new-session', payload, {
        kind: 'machine',
      })
      expect(onMachineSessionResolved).toHaveBeenCalledWith('new-session')
      expect(deps.sendMachineMessage).not.toHaveBeenCalled()
    })

    it('does not resolve machine session state when the first machine send fails', async () => {
      const onMachineSessionResolved = vi.fn()
      const deps = makeDeps({
        activeSessionId: null,
        onMachineSessionResolved,
        sendFirstMessageToSession: vi
          .fn<SendDeps['sendFirstMessageToSession']>()
          .mockRejectedValue(new Error('machine failed')),
      })
      const { handleSendMachine } = createSendHandlers(deps)
      const payload: AgentSendPayload = {
        text: 'Build a search experience',
        thinkingLevel: 'medium',
        attachments: [],
      }

      await expect(handleSendMachine(payload)).rejects.toThrow('machine failed')

      expect(onMachineSessionResolved).not.toHaveBeenCalled()
    })
  })

  describe('handleSendTeam', () => {
    it('sends first-message Team payloads to the created session instead of plain chat', async () => {
      const deps = makeDeps({ activeSessionId: null })
      const { handleSendTeam } = createSendHandlers(deps)
      const payload: AgentSendPayload = {
        text: 'build the site',
        thinkingLevel: 'medium',
        attachments: [],
      }
      const teammate: TeammateDefinition = {
        id: 'web-executor',
        name: 'Web Executor',
        description: 'Build and verify websites.',
        launchPromptPlaceholder: 'Build a website',
        launchButtonLabel: 'Launch Team',
        app: { requiredMcps: [], requiredSkills: [] },
        agents: [],
        loopPolicy: {
          initialAgentId: 'planner',
          decisionMakerAgentId: 'verifier',
          maxDecisionMakerCalls: 3,
          maxAutoSubmittedPrompts: 6,
          defaultWorkerAgentId: 'builder',
          endConditionSummary: 'Stop when verified.',
        },
      }

      await handleSendTeam(payload, teammate)

      expect(deps.createSession).toHaveBeenCalledWith('/test/project')
      expect(deps.sendFirstMessageToSession).toHaveBeenCalledWith('new-session', payload, {
        kind: 'team',
        teammate,
      })
      expect(deps.sendTeamMessage).not.toHaveBeenCalled()
    })
  })
})
