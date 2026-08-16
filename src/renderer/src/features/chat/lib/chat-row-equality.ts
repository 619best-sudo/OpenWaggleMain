import type { ChatRow, MessageChatRow, TurnDividerProps, WaggleInfo } from './types-chat-row'

/**
 * Structural equality for rendered chat rows.
 *
 * Row objects are rebuilt from scratch every time the transcript is recomputed,
 * so reference equality is useless — but the *contents* of every row above the
 * one currently streaming are unchanged, and the underlying `UIMessage` objects
 * keep their identity across stream updates. Comparing rows field-by-field lets
 * memoized row components skip re-rendering (and re-highlighting markdown) for
 * the entire history on every token.
 */
export function areChatRowsEqual(left: ChatRow, right: ChatRow): boolean {
  if (left === right) return true
  if (left.type !== right.type) return false

  switch (left.type) {
    case 'message':
      return areMessageRowsEqual(left, right as MessageChatRow)
    case 'waggle-turn': {
      const other = right as Extract<ChatRow, { type: 'waggle-turn' }>
      return (
        left.id === other.id &&
        left.agentColor === other.agentColor &&
        areTurnDividerPropsEqual(left.turnDividerProps, other.turnDividerProps) &&
        left.messages.length === other.messages.length &&
        left.messages.every((message, index) =>
          areMessageRowsEqual(message, other.messages[index] as MessageChatRow),
        )
      )
    }
    case 'phase': {
      const other = right as Extract<ChatRow, { type: 'phase' }>
      // Phase rows carry a deeply-nested tool list; identity of the underlying
      // tool-call/tool-result parts is what actually changes, so compare those.
      return (
        left.id === other.id &&
        left.phase.status === other.phase.status &&
        left.phase.label === other.phase.label &&
        left.phase.activityText === other.phase.activityText &&
        left.phase.elapsedMs === other.phase.elapsedMs &&
        left.phase.pendingUserQuestion === other.phase.pendingUserQuestion &&
        left.phase.tools.length === other.phase.tools.length &&
        left.phase.tools.every((tool, index) => {
          const otherTool = other.phase.tools[index]
          return (
            otherTool !== undefined &&
            tool.toolCallId === otherTool.toolCallId &&
            tool.status === otherTool.status &&
            tool.toolCall === otherTool.toolCall &&
            tool.toolResult === otherTool.toolResult
          )
        })
      )
    }
    case 'machine-timeline': {
      const other = right as Extract<ChatRow, { type: 'machine-timeline' }>
      return left.id === other.id && left.variant === other.variant && left.plan === other.plan
    }
    case 'interrupted-run': {
      const other = right as Extract<ChatRow, { type: 'interrupted-run' }>
      return (
        left.runId === other.runId &&
        left.branchId === other.branchId &&
        left.runMode === other.runMode &&
        left.model === other.model &&
        left.interruptedAt === other.interruptedAt
      )
    }
    case 'branch-summary': {
      const other = right as Extract<ChatRow, { type: 'branch-summary' }>
      return left.id === other.id && left.summary === other.summary
    }
    case 'compaction-summary': {
      const other = right as Extract<ChatRow, { type: 'compaction-summary' }>
      return (
        left.id === other.id &&
        left.summary === other.summary &&
        left.tokensBefore === other.tokensBefore
      )
    }
    case 'phase-indicator': {
      const other = right as Extract<ChatRow, { type: 'phase-indicator' }>
      return left.label === other.label && left.elapsedMs === other.elapsedMs
    }
    case 'run-summary': {
      const other = right as Extract<ChatRow, { type: 'run-summary' }>
      return (
        left.phases === other.phases &&
        left.totalMs === other.totalMs &&
        left.completedAtMs === other.completedAtMs
      )
    }
    case 'error': {
      const other = right as Extract<ChatRow, { type: 'error' }>
      return (
        left.error === other.error &&
        left.lastUserMessage === other.lastUserMessage &&
        left.dismissedError === other.dismissedError &&
        left.sessionId === other.sessionId
      )
    }
    default:
      return false
  }
}

function areMessageRowsEqual(left: MessageChatRow, right: MessageChatRow | undefined) {
  return (
    right !== undefined &&
    left.message === right.message &&
    left.isStreaming === right.isStreaming &&
    left.isRunActive === right.isRunActive &&
    left.showTurnDivider === right.showTurnDivider &&
    left.assistantModel === right.assistantModel &&
    areTurnDividerPropsEqual(left.turnDividerProps, right.turnDividerProps) &&
    areWaggleInfoEqual(left.waggle, right.waggle)
  )
}

function areTurnDividerPropsEqual(
  left: TurnDividerProps | undefined,
  right: TurnDividerProps | undefined,
) {
  if (left === right) return true
  if (!left || !right) return false
  return (
    left.turnNumber === right.turnNumber &&
    left.agentLabel === right.agentLabel &&
    left.agentColor === right.agentColor &&
    left.agentModel === right.agentModel
  )
}

function areWaggleInfoEqual(left: WaggleInfo | undefined, right: WaggleInfo | undefined) {
  if (left === right) return true
  if (!left || !right) return false
  return left.agentLabel === right.agentLabel && left.agentColor === right.agentColor
}
