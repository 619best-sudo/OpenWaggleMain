import { parseJsonUnknown, safeDecodeUnknown } from '@shared/schema'
import { machinePlanSchema } from '@shared/types/machine'

/**
 * Strip a leading ```json fence (and its closing fence when present), tolerating
 * an unclosed fence while the plan is still streaming.
 */
function stripJsonFence(text: string) {
  const withoutOpen = text.replace(/^\s*```(?:json)?\s*/i, '')
  const closed = withoutOpen.match(/^([\s\S]*?)```/)
  return (closed ? closed[1] : withoutOpen).trim()
}

/**
 * Whether an assistant message's text is (or is becoming) a machine-mode plan
 * JSON object — `{ goal, tasks: [...] }`. Recognizes both a complete, valid plan
 * and a partially-streamed one (so the raw JSON can be hidden behind a card/
 * placeholder instead of flashing on screen while it streams).
 */
export function looksLikeMachinePlanText(text: string) {
  const body = stripJsonFence(text)
  if (!body.startsWith('{')) {
    return false
  }
  // Streaming: the object has begun declaring the plan's signature keys.
  if (/^\{\s*"goal"\s*:/.test(body) || /"tasks"\s*:/.test(body)) {
    return true
  }
  // Complete: parses and validates against the plan schema.
  try {
    return safeDecodeUnknown(machinePlanSchema, parseJsonUnknown(body)).success
  } catch {
    return false
  }
}
