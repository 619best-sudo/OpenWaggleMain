import { createAgentSessionFromServices, SessionManager } from '@mariozechner/pi-coding-agent'
import { Layer } from 'effect'
import * as Effect from 'effect/Effect'
import { createLogger } from '../../logger'
import {
  type ProviderGenerateTextInput,
  type ProviderProbeInput,
  ProviderProbeService,
} from '../../ports/provider-probe-service'
import { createPiRuntimeServices } from './pi-provider-catalog'

const logger = createLogger('pi-provider-probe')
const PROVIDER_PROBE_PROMPT = 'Reply with exactly OK and nothing else.'
const PROVIDER_PROBE_TIMEOUT_MS = 15_000

async function createInMemoryPiSession(input: {
  readonly providerId: string
  readonly modelId: string
  readonly projectPath?: string | null
  readonly apiKey?: string
}) {
  const cwd = input.projectPath ?? process.cwd()
  const services = await createPiRuntimeServices(cwd, { loadMcpAdapter: false })
  if (input.apiKey) {
    services.authStorage.setRuntimeApiKey(input.providerId, input.apiKey)
  }

  const model = services.modelRegistry.find(input.providerId, input.modelId)
  if (!model) {
    throw new Error(`Unknown provider/model: ${input.providerId}/${input.modelId}`)
  }

  return createAgentSessionFromServices({
    services,
    model,
    sessionManager: SessionManager.inMemory(),
    noTools: 'all',
  })
}

async function runPiPromptProbe(input: ProviderProbeInput) {
  const { session } = await createInMemoryPiSession(input)

  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      void session.abort().catch((error) => {
        logger.warn('Failed to abort provider probe session after timeout', {
          error: error instanceof Error ? error.message : String(error),
          providerId: input.providerId,
          modelId: input.modelId,
        })
      })
      reject(new Error('Provider test timed out'))
    }, PROVIDER_PROBE_TIMEOUT_MS)
  })

  try {
    await Promise.race([
      session.prompt(PROVIDER_PROBE_PROMPT, { expandPromptTemplates: false }),
      timeoutPromise,
    ])
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }
    session.dispose()
  }
}

async function runPiGenerateText(input: ProviderGenerateTextInput) {
  const { session } = await createInMemoryPiSession(input)

  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      void session.abort().catch((error) => {
        logger.warn('Failed to abort provider generateText session after timeout', {
          error: error instanceof Error ? error.message : String(error),
          providerId: input.providerId,
          modelId: input.modelId,
        })
      })
      reject(new Error('Provider generation timed out'))
    }, PROVIDER_PROBE_TIMEOUT_MS)
  })

  try {
    await Promise.race([
      session.prompt(input.prompt, { expandPromptTemplates: false }),
      timeoutPromise,
    ])
    return extractLatestAssistantText(session.agent.state.messages)
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }
    session.dispose()
  }
}

function extractLatestAssistantText(messages: readonly unknown[]) {
  const assistantMessages = messages.filter(
    (message): message is { readonly role: 'assistant'; readonly content?: readonly unknown[] } =>
      typeof message === 'object' &&
      message !== null &&
      'role' in message &&
      message.role === 'assistant',
  )
  const latestAssistant = assistantMessages[assistantMessages.length - 1]
  if (!latestAssistant || !Array.isArray(latestAssistant.content)) {
    return ''
  }

  return latestAssistant.content
    .flatMap((part) =>
      typeof part === 'object' &&
      part !== null &&
      'type' in part &&
      part.type === 'text' &&
      'text' in part &&
      typeof part.text === 'string'
        ? [part.text]
        : [],
    )
    .join('\n')
    .trim()
}

async function probeProviderCredentials(input: ProviderProbeInput) {
  await runPiPromptProbe(input)
}

export const PiProviderProbeLive = Layer.succeed(
  ProviderProbeService,
  ProviderProbeService.of({
    probeCredentials: (input) =>
      Effect.tryPromise({
        try: () => probeProviderCredentials(input),
        catch: (error) => (error instanceof Error ? error : new Error(String(error))),
      }),
    generateText: (input) =>
      Effect.tryPromise({
        try: () => runPiGenerateText(input),
        catch: (error) => (error instanceof Error ? error : new Error(String(error))),
      }),
  }),
)
