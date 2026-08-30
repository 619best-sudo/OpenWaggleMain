import type { McpSettingsView } from '@shared/types/mcp'
import type { SessionDetail } from '@shared/types/session'
import type { Settings, ToolPermissionMode } from '@shared/types/settings'
import * as Effect from 'effect/Effect'
import { makeErrorInfo } from '../../agent/error-classifier'
import { buildTuringStandardsContext } from '../../agent/standards-context-projection'
import { createLogger } from '../../logger'
import type { AgentKernelStandardsContext } from '../../ports/agent-kernel-service'
import { McpConfigService } from '../../ports/mcp-config-service'
import { ProviderService } from '../../ports/provider-service'
import { SessionProjectionRepository } from '../../ports/session-projection-repository'
import { SettingsService } from '../../services/settings-service'
import { assignSessionTitleFromUserText } from '../run-handler-utils'
import {
  extractRunToolMentions,
  getSessionToolSelection,
  narrowMcpSettingsToServers,
  recordSessionToolSelection,
} from './session-tool-selection'
import type { AgentRunInput, AgentRunResult } from './types'

const logger = createLogger('agent-run-preflight')

interface AgentRunPreflightSuccess {
  readonly ok: true
  readonly session: SessionDetail
  readonly assignedTitle?: string
  readonly skillToggles?: Record<string, boolean>
  readonly toolPermissionMode: ToolPermissionMode
  /**
   * MCP settings view for the session's project, NARROWED to the servers this
   * run should attach: composer "/" mentions ∪ the session's sticky selection,
   * ∩ enabled. Resolved here (cheap: a JSON file read + merge) so the turing
   * kernel can attach MCP servers without a per-run config re-scan on the
   * critical path.
   */
  readonly mcpSettings?: McpSettingsView
  /**
   * Standards context (AGENTS.md + scoped instructions + the run's selected
   * skills) for the turing kernel. Skills are gated the same way as MCPs: only
   * explicitly selected (or sticky-selected) skills register as tools.
   */
  readonly standardsContext?: AgentKernelStandardsContext
}

interface AgentRunPreflightFailure {
  readonly ok: false
  readonly result: AgentRunResult
}

export function loadAgentRunPreflight(input: AgentRunInput) {
  return Effect.gen(function* () {
    const sessionProjectionRepo = yield* SessionProjectionRepository
    const session = yield* sessionProjectionRepo.getOptional(input.sessionId)
    if (!session) return sessionNotFound()

    const providerService = yield* ProviderService
    const isKnown = yield* providerService.isKnownModel(input.model, session.projectPath)
    if (!isKnown) return invalidModel(input.model)

    const settingsService = yield* SettingsService
    const settings = yield* settingsService.get()
    const assignedTitle = yield* assignSessionTitleFromUserText(
      input.sessionId,
      session,
      input.payload.text,
    )
    if (assignedTitle) {
      yield* Effect.sync(() => input.onTitleAssigned?.(assignedTitle))
    }

    // Resolve MCP settings first (mention matching needs the server list), then
    // derive the run's tool selection, then build the standards context against
    // it. All best-effort: a resolution failure must not block the run — the
    // kernel proceeds without extensions and the warnings land in the run
    // result. This runs on the pre-run path but is cheap (JSON read + directory
    // scan), and the bridge fast-path skips the expensive MCP re-spawn when
    // prewarm already attached.
    const projectPath = session.projectPath ?? undefined
    const mcpSettingsView = yield* resolveMcpSettings(projectPath)

    // Per-run tool gating: only skills/MCPs the user explicitly selected via
    // composer "/" mentions are attached. The selection is STICKY for the
    // session (follow-ups without a mention keep the prior set) and pruned by
    // the Settings toggles (mention ∩ enabled; toggling off de-selects).
    const mentions = extractRunToolMentions(input.payload.text, mcpSettingsView)
    const sticky = getSessionToolSelection(input.sessionId)
    const wantedSkillIds = [...new Set([...sticky.skillIds, ...mentions.skillIds])]
    const wantedMcpNames = [...new Set([...sticky.mcpNames, ...mentions.mcpNamesEnabled])]

    const standardsResult = yield* resolveTuringStandards(projectPath, settings, wantedSkillIds)

    const enabledMcpNames = new Set(
      (mcpSettingsView?.servers ?? [])
        .filter((summary) => summary.enabled)
        .map((summary) => summary.name),
    )
    const selectedMcpNames = wantedMcpNames.filter((name) => enabledMcpNames.has(name))
    const narrowedMcpSettings = mcpSettingsView
      ? narrowMcpSettingsToServers(mcpSettingsView, selectedMcpNames)
      : undefined

    // Sticky bookkeeping: remember what actually attached so follow-ups keep it
    // (replace semantics also prune entries the user toggled off in Settings).
    recordSessionToolSelection(input.sessionId, {
      skillIds: (standardsResult?.activeSkills ?? []).map((skill) => skill.id),
      mcpNames: selectedMcpNames,
    })

    // [DEBUG] The earliest possible view of "what will be sent" — fires once per
    // send before any tool registration or LLM call. Chain check: this log →
    // `MCP+SKILL SELECTION for run` (turing-classic-run) → `[DEBUG] LLM REQUEST`
    // (turing-harness wire log) must show the same narrowing at each stage.
    // Easy to grep: "PREFLIGHT resolved MCPs + skills for send".
    const narrowedServers = narrowedMcpSettings?.servers ?? []
    logger.info('PREFLIGHT resolved MCPs + skills for send', {
      sessionId: input.sessionId,
      userTextPreview: (input.payload.text ?? '').slice(0, 500),
      userTextHasSlash: /\//.test(input.payload.text ?? ''),
      mentionedSkillIds: mentions.skillIds,
      mentionedMcpNames: mentions.mcpNamesMentioned,
      mentionedMcpDisabled: mentions.mcpNamesMentioned.filter(
        (name) => !mentions.mcpNamesEnabled.includes(name),
      ),
      stickySkillIds: sticky.skillIds,
      stickyMcpNames: sticky.mcpNames,
      selectedMcpNames,
      mcpEnabled: narrowedServers.map((summary) => summary.name),
      activeSkills: (standardsResult?.activeSkills ?? []).map((skill) => ({
        id: skill.id,
        name: skill.name,
      })),
      activeSkillCount: standardsResult?.activeSkills.length ?? 0,
    })

    return {
      ok: true,
      session,
      toolPermissionMode: settings.toolPermissionMode,
      ...(assignedTitle ? { assignedTitle } : {}),
      ...(session.projectPath && settings.skillTogglesByProject[session.projectPath]
        ? { skillToggles: settings.skillTogglesByProject[session.projectPath] }
        : {}),
      ...(narrowedMcpSettings ? { mcpSettings: narrowedMcpSettings } : {}),
      ...(standardsResult ? { standardsContext: standardsResult } : {}),
    } satisfies AgentRunPreflightSuccess
  })
}

/**
 * Resolve the merged MCP settings view for a project. Failures are swallowed
 * (returns `undefined`) — the run proceeds without MCP servers and the failure
 * shows up in logs, not as a hard error to the user.
 */
function resolveMcpSettings(projectPath: string | undefined) {
  return Effect.gen(function* () {
    if (!projectPath) return undefined
    const mcpConfig = yield* McpConfigService
    const result = yield* Effect.either(mcpConfig.getView(projectPath))
    return result._tag === 'Right' ? result.right : undefined
  })
}

/**
 * Resolve the turing-path standards context (AGENTS.md + scoped instructions +
 * the run's selected skills). Failures are swallowed — the run proceeds without
 * skills/standards injected into the runtime prompt.
 */
function resolveTuringStandards(
  projectPath: string | undefined,
  settings: Settings,
  selectedSkillIds: readonly string[],
) {
  return Effect.gen(function* () {
    if (!projectPath) return undefined
    const result = yield* Effect.either(
      Effect.promise(() =>
        buildTuringStandardsContext(projectPath, settings, { selectedSkillIds }),
      ),
    )
    return result._tag === 'Right' ? result.right : undefined
  })
}

function sessionNotFound(): AgentRunPreflightFailure {
  const errorInfo = makeErrorInfo('session-not-found', 'Session not found')
  return {
    ok: false,
    result: { outcome: 'not-found', message: errorInfo.userMessage, code: errorInfo.code },
  }
}

function invalidModel(model: string): AgentRunPreflightFailure {
  return {
    ok: false,
    result: {
      outcome: 'invalid-model',
      message: `Unknown model: ${model}`,
      code: 'invalid-model',
    },
  }
}
