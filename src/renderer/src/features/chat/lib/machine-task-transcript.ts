import { parseJsonUnknown, safeDecodeUnknown } from '@shared/schema'
import type { UIMessage } from '@shared/types/chat-ui'
import { machinePlanSchema, type MachineExecutionState } from '@shared/types/machine'
import { getUIMessageText, isInternalToolHandoffAssistantText } from './chat-message-text'

function normalizeMachineMessageText(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

function isRenderableMachineTaskMessage(message: UIMessage) {
  if (message.role !== 'assistant') {
    return false
  }

  if (message.metadata?.branchSummary || message.metadata?.compactionSummary) {
    return false
  }

  const normalizedText = normalizeMachineMessageText(getUIMessageText(message))
  if (normalizedText.length > 0 && !isInternalToolHandoffAssistantText(normalizedText)) {
    return true
  }

  return message.parts.some(
    (part) =>
      part.type === 'thinking' ||
      part.type === 'tool-call' ||
      part.type === 'tool-result' ||
      part.type === 'image' ||
      part.type === 'audio' ||
      part.type === 'video' ||
      part.type === 'document',
  )
}

function extractJsonBlock(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()
  return text.trim()
}

function matchesPersistedMachinePlanMessage(message: UIMessage, machinePlan: MachineExecutionState) {
  if (message.role !== 'assistant') {
    return false
  }

  let parsed: unknown
  try {
    parsed = parseJsonUnknown(extractJsonBlock(getUIMessageText(message)))
  } catch {
    return false
  }

  const decoded = safeDecodeUnknown(machinePlanSchema, parsed)
  if (!decoded.success) {
    return false
  }

  return (
    decoded.data.goal.trim() === machinePlan.goal.trim() &&
    decoded.data.tasks.length === machinePlan.tasks.length &&
    decoded.data.tasks.every((task, index) => {
      const persistedTask = machinePlan.tasks[index]
      return (
        persistedTask &&
        task.id.trim() === persistedTask.id &&
        task.title.trim() === persistedTask.title &&
        task.prompt.trim() === persistedTask.prompt &&
        JSON.stringify(task.dependsOn ?? []) === JSON.stringify(persistedTask.dependsOn ?? [])
      )
    })
  )
}

function findLastMatchingOriginalRequestIndex(
  messages: readonly UIMessage[],
  originalRequest: string | undefined,
) {
  const normalizedOriginalRequest = originalRequest ? normalizeMachineMessageText(originalRequest) : ''
  if (!normalizedOriginalRequest) {
    return -1
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (
      message?.role === 'user' &&
      normalizeMachineMessageText(getUIMessageText(message)) === normalizedOriginalRequest
    ) {
      return index
    }
  }

  return -1
}

function flattenPersistedMachineTaskMessageIds(machinePlan: MachineExecutionState) {
  return machinePlan.tasks.flatMap((task) => task.messageIds ?? [])
}

function inferRunningTaskMessageIds(
  messages: readonly UIMessage[],
  machinePlan: MachineExecutionState,
  persistedIds: ReadonlySet<string>,
) {
  if (machinePlan.phase !== 'running' || !machinePlan.currentTaskId) {
    return []
  }

  let startIndex = -1
  for (let index = 0; index < messages.length; index += 1) {
    if (persistedIds.has(messages[index]?.id ?? '')) {
      startIndex = index
    }
  }

  if (startIndex < 0) {
    startIndex = findLastMatchingOriginalRequestIndex(messages, machinePlan.originalRequest)
  }

  const inferredIds: string[] = []
  for (let index = startIndex + 1; index < messages.length; index += 1) {
    const message = messages[index]
    if (
      !message ||
      persistedIds.has(message.id) ||
      matchesPersistedMachinePlanMessage(message, machinePlan) ||
      !isRenderableMachineTaskMessage(message)
    ) {
      continue
    }
    inferredIds.push(message.id)
  }

  return inferredIds
}

export function buildMachineTaskMessageIdLookup(
  messages: readonly UIMessage[],
  machinePlan: MachineExecutionState | null,
): Readonly<Record<string, readonly string[]>> {
  if (!machinePlan) {
    return {}
  }

  const lookup: Record<string, readonly string[]> = Object.fromEntries(
    machinePlan.tasks.map((task) => [task.id, [...(task.messageIds ?? [])]]),
  )
  const persistedIds = new Set(flattenPersistedMachineTaskMessageIds(machinePlan))
  const runningTaskIds = inferRunningTaskMessageIds(messages, machinePlan, persistedIds)

  if (machinePlan.currentTaskId && runningTaskIds.length > 0) {
    const existingIds = lookup[machinePlan.currentTaskId] ?? []
    const mergedIds = [...existingIds]
    for (const id of runningTaskIds) {
      if (!mergedIds.includes(id)) {
        mergedIds.push(id)
      }
    }
    lookup[machinePlan.currentTaskId] = mergedIds
  }

  return lookup
}

export function getMachineTaskMessageIds(
  messages: readonly UIMessage[],
  machinePlan: MachineExecutionState | null,
) {
  const lookup = buildMachineTaskMessageIdLookup(messages, machinePlan)
  return Object.values(lookup).flat()
}
