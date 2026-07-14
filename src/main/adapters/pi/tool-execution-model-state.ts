const APPROVED_TOOL_MODEL_TTL_MS = 2 * 60 * 1000

type PendingApprovedToolModel = {
  readonly model: string
  readonly expiresAt: number
}

const pendingApprovedToolModels: PendingApprovedToolModel[] = []
const GLOBAL_CONSUMER_KEY = '__openwaggleConsumeToolExecutionModel'

type ToolExecutionModelGlobal = typeof globalThis & {
  [GLOBAL_CONSUMER_KEY]?: () => string | null
}

function pruneExpiredApprovedToolModels(now = Date.now()) {
  while (pendingApprovedToolModels.length > 0) {
    const next = pendingApprovedToolModels[0]
    if (!next || next.expiresAt > now) {
      return
    }
    pendingApprovedToolModels.shift()
  }
}

export function registerApprovedToolExecutionModel(model: string) {
  const normalizedModel = model.trim()
  if (!normalizedModel) {
    return
  }

  const now = Date.now()
  pruneExpiredApprovedToolModels(now)
  pendingApprovedToolModels.push({
    model: normalizedModel,
    expiresAt: now + APPROVED_TOOL_MODEL_TTL_MS,
  })
}

export function consumeApprovedToolExecutionModel() {
  const now = Date.now()
  pruneExpiredApprovedToolModels(now)
  const next = pendingApprovedToolModels.shift()
  return next?.model ?? null
}

export function clearApprovedToolExecutionModels() {
  pendingApprovedToolModels.length = 0
}

;(globalThis as ToolExecutionModelGlobal)[GLOBAL_CONSUMER_KEY] = () =>
  consumeApprovedToolExecutionModel()
