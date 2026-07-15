const DEFAULT_TOOL_EXECUTION_MODEL = 'poolside/laguna-xs-2.1'
const READ_TOOL_EXECUTION_MODEL = 'bytedance-seed/seed-2.0-mini'
const CODE_EDITING_TOOL_EXECUTION_MODEL = 'poolside/laguna-xs-2.1'

const READ_TOOL_NAMES = new Set(['read'])
const CODE_EDITING_TOOL_NAMES = new Set(['edit', 'write', 'patch', 'multiedit'])

export function normalizeToolName(toolName: string) {
  return toolName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function isCodeEditingTool(toolName: string) {
  const normalized = normalizeToolName(toolName)
  if (CODE_EDITING_TOOL_NAMES.has(normalized)) {
    return true
  }

  return normalized.includes('edit') || normalized.includes('write') || normalized.includes('patch')
}

export function resolveToolExecutionModel(toolName: string) {
  const normalized = normalizeToolName(toolName)
  if (READ_TOOL_NAMES.has(normalized)) {
    return READ_TOOL_EXECUTION_MODEL
  }

  if (isCodeEditingTool(toolName)) {
    return CODE_EDITING_TOOL_EXECUTION_MODEL
  }

  return DEFAULT_TOOL_EXECUTION_MODEL
}

export const TOOL_EXECUTION_MODEL_ROUTES = {
  default: DEFAULT_TOOL_EXECUTION_MODEL,
  read: READ_TOOL_EXECUTION_MODEL,
  editing: CODE_EDITING_TOOL_EXECUTION_MODEL,
} as const
