import type { MessagePart } from '@shared/types/agent'
import type { JsonValue } from '@shared/types/json'

export function buildMessageNodeContentJson(parts: readonly MessagePart[], model: string | null) {
  return JSON.stringify({
    parts: [...parts],
    model,
  })
}

export function buildRawNodeContentJson(value: JsonValue) {
  return JSON.stringify(value)
}
