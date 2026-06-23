import type { AgentSendPayload } from '@shared/types/agent'
import type { SessionId } from '@shared/types/brand'
import type { SupportedModelId } from '@shared/types/llm'
import type { ThinkingLevel } from '@shared/types/settings'
import type { TeammateDefinition } from '@shared/types/teammate'
import type { WaggleConfig } from '@shared/types/waggle'
import { createOptimisticUserMessage } from '@/features/chat/lib/useAgentChat.utils'
import { useBackgroundRunStore } from '@/features/chat/state/background-run-store'
import { useOptimisticUserMessageStore } from '@/features/chat/state/optimistic-user-message-store'
import { api } from '@/shared/lib/ipc'
import { createRendererLogger } from '@/shared/lib/logger'

const logger = createRendererLogger('use-send-message')

interface SendMessageDeps {
  readonly activeSessionId: SessionId | null
  readonly projectPath: string | null
  readonly thinkingLevel: ThinkingLevel
  readonly createSession: (projectPath: string) => Promise<SessionId>
  readonly sendMessage: (payload: AgentSendPayload) => Promise<void>
  readonly sendFirstMessageToSession: (
    sessionId: SessionId,
    payload: AgentSendPayload,
    mode:
      | { readonly kind: 'plain' }
      | { readonly kind: 'waggle'; readonly config: WaggleConfig }
      | { readonly kind: 'team'; readonly teammate: TeammateDefinition },
  ) => Promise<void>
  readonly sendWaggleMessage: (payload: AgentSendPayload, config: WaggleConfig) => Promise<void>
  readonly sendTeamMessage: (
    payload: AgentSendPayload,
    teammate: TeammateDefinition,
  ) => Promise<void>
}

interface SendMessageHandlers {
  readonly handleSend: (payload: AgentSendPayload) => Promise<void>
  readonly handleSendText: (content: string) => Promise<void>
  readonly handleSendWaggle: (
    payload: AgentSendPayload,
    config: WaggleConfig,
    targetSessionId?: SessionId | null,
  ) => Promise<void>
  readonly handleSendTeam: (
    payload: AgentSendPayload,
    teammate: TeammateDefinition,
    targetSessionId?: SessionId | null,
  ) => Promise<void>
}

/** Pure factory — testable without React. */
export function createSendHandlers(deps: SendMessageDeps): SendMessageHandlers {
  const {
    activeSessionId,
    projectPath,
    thinkingLevel,
    createSession,
    sendMessage,
    sendFirstMessageToSession,
    sendWaggleMessage,
    sendTeamMessage,
  } = deps

  async function handleSend(payload: AgentSendPayload) {
    if (!activeSessionId) {
      if (!projectPath) {
        throw new Error('Select a project before sending.')
      }
      const sessionId = await createSession(projectPath)
      void sendFirstMessageToSession(sessionId, payload, { kind: 'plain' })
      return
    }
    await sendMessage(payload)
  }

  async function handleSendText(content: string) {
    await handleSend({ text: content, thinkingLevel, attachments: [] })
  }

  async function handleSendWaggle(
    payload: AgentSendPayload,
    config: WaggleConfig,
    targetSessionId?: SessionId | null,
  ) {
    if (targetSessionId) {
      void sendFirstMessageToSession(targetSessionId, payload, { kind: 'waggle', config })
      return
    }
    if (!activeSessionId) {
      if (!projectPath) {
        throw new Error('Select a project before sending.')
      }
      const sessionId = await createSession(projectPath)
      void sendFirstMessageToSession(sessionId, payload, { kind: 'waggle', config })
      return
    }
    await sendWaggleMessage(payload, config)
  }

  async function handleSendTeam(
    payload: AgentSendPayload,
    teammate: TeammateDefinition,
    targetSessionId?: SessionId | null,
  ) {
    if (targetSessionId) {
      void sendFirstMessageToSession(targetSessionId, payload, { kind: 'team', teammate })
      return
    }
    if (!activeSessionId) {
      if (!projectPath) {
        throw new Error('Select a project before sending.')
      }
      const sessionId = await createSession(projectPath)
      void sendFirstMessageToSession(sessionId, payload, { kind: 'team', teammate })
      return
    }
    await sendTeamMessage(payload, teammate)
  }

  return { handleSend, handleSendText, handleSendWaggle, handleSendTeam }
}

interface UseSendMessageOptions {
  readonly activeSessionId: SessionId | null
  readonly model: SupportedModelId
  readonly projectPath: string | null
  readonly thinkingLevel: ThinkingLevel
  readonly createSession: (projectPath: string) => Promise<SessionId>
  readonly sendMessage: (payload: AgentSendPayload) => Promise<void>
  readonly sendWaggleMessage: (payload: AgentSendPayload, config: WaggleConfig) => Promise<void>
  readonly sendTeamMessage: (
    payload: AgentSendPayload,
    teammate: TeammateDefinition,
  ) => Promise<void>
}

/** Hook wrapper — binds first-message sends to the concrete created session id. */
export function useSendMessage(options: UseSendMessageOptions): SendMessageHandlers {
  const { activeSessionId, model, sendMessage, sendWaggleMessage, sendTeamMessage, ...rest } = options

  async function sendFirstMessageToSession(
    sessionId: SessionId,
    payload: AgentSendPayload,
    mode:
      | { readonly kind: 'plain' }
      | { readonly kind: 'waggle'; readonly config: WaggleConfig }
      | { readonly kind: 'team'; readonly teammate: TeammateDefinition },
  ) {
    const optimisticUserMessage = createOptimisticUserMessage(payload)
    useOptimisticUserMessageStore.getState().add(sessionId, optimisticUserMessage)
    useBackgroundRunStore.getState().setRunRenderMessages(sessionId, [optimisticUserMessage])

    try {
      if (mode.kind === 'waggle') {
        await api.sendWaggleMessage(sessionId, payload, model, mode.config)
      } else if (mode.kind === 'team') {
        await api.sendTeamMessage(sessionId, payload, model, mode.teammate)
      } else {
        await api.sendMessage(sessionId, payload, model)
      }
    } catch (error) {
      useBackgroundRunStore.getState().clearRunRenderSnapshot(sessionId)
      logger.error('First message send failed', {
        sessionId: String(sessionId),
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return createSendHandlers({
    ...rest,
    activeSessionId,
    sendMessage,
    sendFirstMessageToSession,
    sendWaggleMessage,
    sendTeamMessage,
  })
}
