import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  Theme,
} from '@mariozechner/pi-coding-agent'
import type { JsonValue } from '@shared/types/json'

type PiToolName = 'read' | 'bash' | 'edit' | 'write' | 'grep' | 'find' | 'ls'

const FG_THEME_COLORS = {
  accent: '',
  border: '',
  borderAccent: '',
  borderMuted: '',
  success: '',
  error: '',
  warning: '',
  muted: '',
  dim: '',
  text: '',
  thinkingText: '',
  userMessageText: '',
  customMessageText: '',
  customMessageLabel: '',
  toolTitle: '',
  toolOutput: '',
  mdHeading: '',
  mdLink: '',
  mdLinkUrl: '',
  mdCode: '',
  mdCodeBlock: '',
  mdCodeBlockBorder: '',
  mdQuote: '',
  mdQuoteBorder: '',
  mdHr: '',
  mdListBullet: '',
  toolDiffAdded: '',
  toolDiffRemoved: '',
  toolDiffContext: '',
  syntaxComment: '',
  syntaxKeyword: '',
  syntaxFunction: '',
  syntaxVariable: '',
  syntaxString: '',
  syntaxNumber: '',
  syntaxType: '',
  syntaxOperator: '',
  syntaxPunctuation: '',
  thinkingOff: '',
  thinkingMinimal: '',
  thinkingLow: '',
  thinkingMedium: '',
  thinkingHigh: '',
  thinkingXhigh: '',
  bashMode: '',
} as const

const BG_THEME_COLORS = {
  selectedBg: '',
  userMessageBg: '',
  customMessageBg: '',
  toolPendingBg: '',
  toolSuccessBg: '',
  toolErrorBg: '',
} as const

const SUMMARY_THEME = new Theme(FG_THEME_COLORS, BG_THEME_COLORS, '256color', {
  name: 'openwaggle-tool-summary',
})

const SUMMARY_RENDER_WIDTH = 120
const toolDefinitions = new Map<string, ReturnType<typeof createReadToolDefinition>>()

function stripAnsi(value: string) {
  return value.replace(
    // eslint-disable-next-line no-control-regex
    /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g,
    '',
  )
}

function isPiToolName(toolName: string): toolName is PiToolName {
  return (
    toolName === 'read' ||
    toolName === 'bash' ||
    toolName === 'edit' ||
    toolName === 'write' ||
    toolName === 'grep' ||
    toolName === 'find' ||
    toolName === 'ls'
  )
}

function normalizeSummaryLine(line: string) {
  return line.replace(/\s+/g, ' ').trim()
}

function getToolDefinition(toolName: PiToolName, cwd: string) {
  const cacheKey = `${cwd}:${toolName}`
  const cached = toolDefinitions.get(cacheKey)
  if (cached) {
    return cached
  }

  const created =
    toolName === 'read'
      ? createReadToolDefinition(cwd)
      : toolName === 'bash'
        ? createBashToolDefinition(cwd)
        : toolName === 'edit'
          ? createEditToolDefinition(cwd)
          : toolName === 'write'
            ? createWriteToolDefinition(cwd)
            : toolName === 'grep'
              ? createGrepToolDefinition(cwd)
              : toolName === 'find'
                ? createFindToolDefinition(cwd)
                : createLsToolDefinition(cwd)
  toolDefinitions.set(cacheKey, created)
  return created
}

export function renderPiToolCallSummary(input: {
  readonly toolCallId: string
  readonly toolName: string
  readonly args: JsonValue | undefined
  readonly cwd: string
}) {
  if (!isPiToolName(input.toolName) || input.args === undefined) {
    return undefined
  }

  try {
    const definition = getToolDefinition(input.toolName, input.cwd)
    if (!definition.renderCall) {
      return undefined
    }

    const component = definition.renderCall(input.args, SUMMARY_THEME, {
      args: input.args,
      toolCallId: input.toolCallId,
      invalidate: () => undefined,
      lastComponent: undefined,
      state: {},
      cwd: input.cwd,
      executionStarted: true,
      argsComplete: true,
      isPartial: true,
      expanded: false,
      showImages: false,
      isError: false,
    })

    for (const line of component.render(SUMMARY_RENDER_WIDTH)) {
      const normalized = normalizeSummaryLine(stripAnsi(line))
      if (normalized.length > 0) {
        return normalized
      }
    }
  } catch {
    return undefined
  }

  return undefined
}
