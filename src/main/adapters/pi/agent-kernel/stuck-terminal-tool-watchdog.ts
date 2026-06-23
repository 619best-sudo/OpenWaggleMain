import type { AgentSession } from '@mariozechner/pi-coding-agent'
import type { AgentTransportEvent } from '@shared/types/stream'
import { normalizeToolResultPayload } from '@shared/utils/tool-result-state'
import { isRecord } from '@shared/utils/validation'
import { logger } from './constants'

const STUCK_TERMINAL_TOOL_NAMES = new Set(['bash'])
const STUCK_TERMINAL_TOOL_POLL_MS = 5_000
const STUCK_TERMINAL_TOOL_TIMEOUT_MS = 60_000

interface PendingTerminalToolFailure {
  readonly toolCallId: string
  readonly toolName: string
  readonly baseMessage: string
  readonly observedAt: number
}

function isTerminalToolEvent(
  event: Extract<AgentTransportEvent, { type: 'tool_execution_start' | 'tool_execution_end' }>,
) {
  return STUCK_TERMINAL_TOOL_NAMES.has(event.toolName)
}

function textFromContentBlocks(value: unknown) {
  if (!Array.isArray(value)) {
    return null
  }

  const blocks: string[] = []
  for (const block of value) {
    if (!isRecord(block) || block.type !== 'text' || typeof block.text !== 'string') {
      continue
    }
    blocks.push(block.text)
  }

  return blocks.length > 0 ? blocks.join('\n').trim() : null
}

function summarizeTerminalToolResult(result: unknown) {
  const normalized = normalizeToolResultPayload(result)
  if (!isRecord(normalized)) {
    return {
      message:
        typeof normalized === 'string' && normalized.trim().length > 0
          ? normalized.trim()
          : 'Terminal tool execution failed.',
      fullOutputPath: null,
    }
  }

  const contentMessage = textFromContentBlocks(normalized.content)
  const directMessage =
    typeof normalized.message === 'string'
      ? normalized.message.trim()
      : typeof normalized.error === 'string'
        ? normalized.error.trim()
        : ''
  const details = isRecord(normalized.details) ? normalized.details : null
  const fullOutputPath =
    details && typeof details.fullOutputPath === 'string' ? details.fullOutputPath : null

  return {
    message: contentMessage ?? (directMessage || 'Terminal tool execution failed.'),
    fullOutputPath,
  }
}

function buildTerminalStuckMessage(event: Extract<AgentTransportEvent, { type: 'tool_execution_end' }>) {
  const summary = summarizeTerminalToolResult(event.result)
  const logHint = summary.fullOutputPath
    ? ` Inspect the terminal log at ${summary.fullOutputPath} and continue from that failure.`
    : ''
  return `Terminal tool "${event.toolName}" failed with: ${summary.message}. The run stayed stuck for over ${String(
    STUCK_TERMINAL_TOOL_TIMEOUT_MS / 1_000,
  )} seconds after that error.${logHint}`
}

function createWatchdogError(message: string) {
  const error = new Error(message)
  error.name = 'StuckTerminalToolError'
  return error
}

export function createStuckTerminalToolWatchdog(input: {
  readonly session: AgentSession
  readonly runId: string
  readonly emitErrorEvent: (event: Extract<AgentTransportEvent, { type: 'agent_end' }>) => void
  readonly abortWarning: string
}) {
  let pendingFailure: PendingTerminalToolFailure | null = null
  let active = true
  let rejectWatch: ((reason?: unknown) => void) | null = null

  const failurePromise = new Promise<never>((_, reject) => {
    rejectWatch = reject
  })

  async function abortSessionForWatchdog(message: string) {
    await input.session.abort().catch((error) => {
      logger.warn(input.abortWarning, {
        error: error instanceof Error ? error.message : String(error),
      })
    })

    input.emitErrorEvent({
      type: 'agent_end',
      runId: input.runId,
      reason: 'error',
      error: { message },
      timestamp: Date.now(),
    })
  }

  function trip(message: string) {
    if (!active) {
      return
    }

    active = false
    pendingFailure = null
    void abortSessionForWatchdog(message)
    rejectWatch?.(createWatchdogError(message))
  }

  const interval = setInterval(() => {
    if (!active || !pendingFailure) {
      return
    }
    if (Date.now() - pendingFailure.observedAt < STUCK_TERMINAL_TOOL_TIMEOUT_MS) {
      return
    }

    trip(pendingFailure.baseMessage)
  }, STUCK_TERMINAL_TOOL_POLL_MS)

  function stop() {
    if (!active) {
      clearInterval(interval)
      return
    }
    active = false
    pendingFailure = null
    clearInterval(interval)
  }

  function observe(event: AgentTransportEvent) {
    if (!active) {
      return
    }

    if (event.type === 'agent_end') {
      pendingFailure = null
      return
    }

    if (event.type === 'tool_execution_start' && isTerminalToolEvent(event)) {
      pendingFailure = null
      return
    }

    if (event.type === 'tool_execution_end' && isTerminalToolEvent(event)) {
      pendingFailure = event.isError
        ? {
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            baseMessage: buildTerminalStuckMessage(event),
            observedAt: Date.now(),
          }
        : null
      return
    }

    if (!pendingFailure) {
      return
    }

    if (
      event.type === 'tool_execution_update' &&
      event.toolCallId === pendingFailure.toolCallId &&
      event.toolName === pendingFailure.toolName
    ) {
      pendingFailure = { ...pendingFailure, observedAt: Date.now() }
      return
    }

    pendingFailure = null
  }

  async function watch<T>(operation: () => Promise<T>) {
    try {
      return await Promise.race([operation(), failurePromise])
    } finally {
      stop()
    }
  }

  return {
    observe,
    stop,
    watch,
  }
}
