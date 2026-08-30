/**
 * Bridge between the wide {@link AgentStandardsContext} assembled by the standards
 * loader and the narrower {@link AgentKernelStandardsContext} consumed by the
 * turing-harness runtime bridge.
 *
 * The loader output carries extra fields (agents status, catalog, activation
 * details) that the renderer / AGENTS.md tooling need but the harness does not.
 * The turing bridge only cares about the instructions, scoped instructions, the
 * active skill bodies (registered as tools), and warnings — so we project down
 * to exactly those.
 *
 * `buildTuringStandardsContext` is the variant used by both the prewarm path
 * (project open / model change) and the turing classic-run path. Its default
 * (no options) activates ALL toggle-enabled skills, because:
 *   1. Prewarm runs before any message exists, so it has no text to analyze.
 *   2. A stable "all enabled skills" set gives a stable runtime signature, so
 *      the bridge WeakMap fast-path hits on every prewarm after the first.
 *
 * The classic-run preflight passes `selectedSkillIds` (composer "/" mentions ∪
 * the session's sticky selection, see `session-tool-selection.ts`): skills then
 * register as tools for a run ONLY when the user explicitly selected them, so
 * unselected skills never reach the model's tool list.
 */
import type { Settings } from '@shared/types/settings'
import type {
  AgentKernelActiveSkill,
  AgentKernelStandardsContext,
} from '../ports/agent-kernel-service'
import { loadSkillInstructions } from '../skills/skill-catalog'
import {
  type ActiveSkillInstruction,
  type AgentStandardsContext,
  EMPTY_STANDARDS_CONTEXT,
  loadAgentStandardsContext,
} from './standards-context'

/**
 * Project the wide loader output down to the shape the turing bridge expects.
 * Pure and total — never throws.
 */
export function projectStandardsContextForTuring(
  ctx: AgentStandardsContext,
): AgentKernelStandardsContext {
  return {
    agentsInstruction: ctx.agentsInstruction ?? '',
    agentsScopedInstructions: ctx.agentsScopedInstructions.map((scope) => ({
      scopeRelativeDir: scope.scopeRelativeDir,
      filePath: scope.filePath,
      content: scope.content,
    })),
    activeSkills: ctx.activeSkills.map(projectActiveSkill),
    warnings: [...ctx.warnings],
  }
}

function projectActiveSkill(skill: ActiveSkillInstruction): AgentKernelActiveSkill {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    body: skill.body,
    skillPath: skill.skillPath,
    folderPath: skill.folderPath,
    hasScripts: skill.hasScripts,
  }
}

/**
 * Build the turing-path standards context: AGENTS.md + scoped instructions, with
 * `activeSkills` set to ALL toggle-enabled skills by default (prewarm path), or
 * scoped to `options.selectedSkillIds` ∩ enabled when the run path passes an
 * explicit selection (composer "/" gating — see `session-tool-selection.ts`).
 *
 * User text is intentionally empty: the loader's AGENTS.md / scoped-instruction
 * resolution still runs (it does not depend on text), but message-driven skill
 * activation is skipped — skill selection is supplied via `options`, not
 * heuristics.
 */
export interface TuringStandardsOptions {
  /**
   * Explicitly selected skill ids (composer mentions ∪ sticky session
   * selection). Intersected with the toggle-enabled set; ids are matched
   * case-insensitively. Omit for the prewarm default (all enabled).
   */
  readonly selectedSkillIds?: readonly string[]
}

export async function buildTuringStandardsContext(
  projectPath: string | null,
  settings: Settings,
  options?: TuringStandardsOptions,
): Promise<AgentKernelStandardsContext> {
  if (!projectPath) {
    return projectStandardsContextForTuring(EMPTY_STANDARDS_CONTEXT)
  }

  const loaded = await loadAgentStandardsContext(projectPath, '', settings, [])
  const toggles = settings.skillTogglesByProject[projectPath] ?? {}
  const selected = options?.selectedSkillIds
    ? new Set(options.selectedSkillIds.map((id) => id.toLowerCase()))
    : undefined
  const activeSkills = await loadAllEnabledSkills(
    projectPath,
    loaded.catalogSkills.map((s) => s.id),
    toggles,
    selected,
  )
  return projectStandardsContextForTuring({
    ...loaded,
    activeSkills,
  })
}

/**
 * Load the bodies of the toggle-enabled skills in the project, scoped to
 * `selected` when given (composer selection gating). Errors loading a single
 * skill are pushed into warnings (mirrors `loadActiveSkills` in
 * standards-context.ts) so one bad skill folder doesn't break the whole run.
 */
async function loadAllEnabledSkills(
  projectPath: string,
  catalogSkillIds: readonly string[],
  toggles: Readonly<Record<string, boolean>>,
  selected?: ReadonlySet<string>,
): Promise<ActiveSkillInstruction[]> {
  const enabledIds = catalogSkillIds.filter((id) => toggles[id] ?? true)
  const scopedIds = selected
    ? enabledIds.filter((id) => selected.has(id.toLowerCase()))
    : enabledIds
  const out: ActiveSkillInstruction[] = []
  for (const skillId of scopedIds) {
    try {
      const skill = await loadSkillInstructions(projectPath, skillId, toggles)
      // `loadSkillInstructions` reads the toggle but defaults to enabled; the
      // catalog filter above already honored an explicit `false`, so this is a
      // belt-and-suspenders guard against races with the toggles store.
      if (skill.enabled === false) continue
      out.push({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        body: skill.instructions,
        folderPath: skill.folderPath,
        skillPath: skill.skillPath,
        hasScripts: skill.hasScripts,
      })
    } catch {
      // A malformed skill folder must not poison the runtime context. The
      // catalog already surfaces a per-skill load error in the Skills UI; the
      // run path just skips it.
    }
  }
  return out
}
