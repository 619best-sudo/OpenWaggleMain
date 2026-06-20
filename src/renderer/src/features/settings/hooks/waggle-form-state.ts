import { matchBy } from '@diegogbrisa/ts-match'
import type { SupportedModelId } from '@shared/types/brand'
import {
  WAGGLE_AGENT_COLORS,
  WAGGLE_INHERIT_MODEL,
  type WaggleAgentColor,
  type WaggleAgentSlot,
  type WaggleAppManifest,
  type WaggleCollaborationMode,
  type WaggleConfig,
  type WagglePreset,
  type WaggleStopCondition,
} from '@shared/types/waggle'

const MAX_TURNS = 8
const MIN_AGENT_COUNT = 2

export interface WaggleFormState {
  readonly agents: readonly WaggleAgentSlot[]
  readonly mode: WaggleCollaborationMode
  readonly stopCondition: WaggleStopCondition
  readonly maxTurns: number
  readonly requiredMcpsText: string
  readonly requiredSkillsText: string
}

export interface WagglePresetState {
  readonly activePresetId: string | null
  readonly error: string | null
}

export type WaggleFormAction =
  | { readonly type: 'load-preset'; readonly preset: WagglePreset }
  | { readonly type: 'reset' }
  | { readonly type: 'add-agent' }
  | { readonly type: 'remove-agent'; readonly index: number }
  | { readonly type: 'set-agent-label'; readonly index: number; readonly label: string }
  | { readonly type: 'set-agent-model'; readonly index: number; readonly model: SupportedModelId }
  | { readonly type: 'set-agent-role'; readonly index: number; readonly roleDescription: string }
  | { readonly type: 'set-agent-color'; readonly index: number; readonly color: WaggleAgentColor }
  | {
      readonly type: 'set-agent-run-condition-terms'
      readonly index: number
      readonly value: string
    }
  | { readonly type: 'set-stop-condition'; readonly stopCondition: WaggleStopCondition }
  | { readonly type: 'set-max-turns'; readonly maxTurns: number }
  | { readonly type: 'set-required-mcps-text'; readonly value: string }
  | { readonly type: 'set-required-skills-text'; readonly value: string }

function agentColorForIndex(index: number): WaggleAgentColor {
  return WAGGLE_AGENT_COLORS[index % WAGGLE_AGENT_COLORS.length] ?? WAGGLE_AGENT_COLORS[0]
}

function createDefaultAgent(index: number): WaggleAgentSlot {
  return {
    label: `Agent ${String(index + 1)}`,
    model: WAGGLE_INHERIT_MODEL,
    roleDescription: '',
    color: agentColorForIndex(index),
  }
}

export type WagglePresetAction =
  | { readonly type: 'select-preset'; readonly activePresetId: string }
  | { readonly type: 'save-success'; readonly activePresetId: string }
  | { readonly type: 'clear-active-preset' }
  | { readonly type: 'clear-error' }
  | { readonly type: 'set-error'; readonly error: string }

export const INITIAL_WAGGLE_FORM_STATE: WaggleFormState = {
  agents: [createDefaultAgent(0), createDefaultAgent(1)],
  mode: 'sequential',
  stopCondition: 'consensus',
  maxTurns: MAX_TURNS,
  requiredMcpsText: '',
  requiredSkillsText: '',
}

export const INITIAL_WAGGLE_PRESET_STATE: WagglePresetState = {
  activePresetId: null,
  error: null,
}

function buildDependencyText(values: readonly string[]) {
  return values.join('\n')
}

function normalizeDependencyList(text: string): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const rawLine of text.split('\n')) {
    const value = rawLine.trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    normalized.push(value)
  }
  return normalized
}

function normalizeRunConditionTerms(text: string): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const rawTerm of text.split(/[\n,]/u)) {
    const value = rawTerm.trim()
    if (!value) continue
    const key = value.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(value)
  }
  return normalized
}

export function buildWaggleAppManifest(state: WaggleFormState): WaggleAppManifest {
  return {
    requiredMcps: normalizeDependencyList(state.requiredMcpsText),
    requiredSkills: normalizeDependencyList(state.requiredSkillsText),
  }
}

export function formMatchesPreset(state: WaggleFormState, preset: WagglePreset) {
  const config = buildWaggleConfig(state)
  const pc = preset.config
  if (config.mode !== pc.mode) return false
  if (config.stop.primary !== pc.stop.primary) return false
  if (config.stop.maxTurnsSafety !== pc.stop.maxTurnsSafety) return false
  if (config.agents.length !== pc.agents.length) return false
  for (let i = 0; i < config.agents.length; i++) {
    const a = config.agents[i]
    const p = pc.agents[i]
    if (!a || !p) return false
    if (a.label !== p.label) return false
    if (a.model !== p.model) return false
    if (a.roleDescription !== p.roleDescription) return false
    if (a.color !== p.color) return false
    if (a.runCondition?.type !== p.runCondition?.type) return false
    if ((a.runCondition?.anyOf.length ?? 0) !== (p.runCondition?.anyOf.length ?? 0)) return false
    for (let j = 0; j < (a.runCondition?.anyOf.length ?? 0); j++) {
      if (a.runCondition?.anyOf[j] !== p.runCondition?.anyOf[j]) return false
    }
  }
  const app = buildWaggleAppManifest(state)
  if (app.requiredMcps.length !== preset.app.requiredMcps.length) return false
  if (app.requiredSkills.length !== preset.app.requiredSkills.length) return false
  for (let i = 0; i < app.requiredMcps.length; i++) {
    if (app.requiredMcps[i] !== preset.app.requiredMcps[i]) return false
  }
  for (let i = 0; i < app.requiredSkills.length; i++) {
    if (app.requiredSkills[i] !== preset.app.requiredSkills[i]) return false
  }
  return true
}

export function buildWaggleConfig(state: WaggleFormState): WaggleConfig {
  return {
    mode: state.mode,
    agents: state.agents.map((agent) => ({ ...agent })),
    stop: { primary: state.stopCondition, maxTurnsSafety: state.maxTurns },
  }
}

function updateAgentAt(
  agents: readonly WaggleAgentSlot[],
  index: number,
  update: (agent: WaggleAgentSlot) => WaggleAgentSlot,
): readonly WaggleAgentSlot[] {
  return agents.map((agent, currentIndex) => (currentIndex === index ? update(agent) : agent))
}

export function waggleFormReducer(
  state: WaggleFormState,
  action: WaggleFormAction,
): WaggleFormState {
  return matchBy(action, 'type')
    .with('load-preset', (value) => ({
      agents: value.preset.config.agents,
      mode: value.preset.config.mode,
      stopCondition: value.preset.config.stop.primary,
      maxTurns: value.preset.config.stop.maxTurnsSafety,
      requiredMcpsText: buildDependencyText(value.preset.app.requiredMcps),
      requiredSkillsText: buildDependencyText(value.preset.app.requiredSkills),
    }))
    .with('reset', () => INITIAL_WAGGLE_FORM_STATE)
    .with('add-agent', () => ({
      ...state,
      agents: [...state.agents, createDefaultAgent(state.agents.length)],
    }))
    .with('remove-agent', (value) => ({
      ...state,
      agents:
        state.agents.length <= MIN_AGENT_COUNT
          ? state.agents
          : state.agents.filter((_, index) => index !== value.index),
    }))
    .with('set-agent-label', (value) => ({
      ...state,
      agents: updateAgentAt(state.agents, value.index, (agent) => ({
        ...agent,
        label: value.label,
      })),
    }))
    .with('set-agent-model', (value) => ({
      ...state,
      agents: updateAgentAt(state.agents, value.index, (agent) => ({
        ...agent,
        model: value.model,
      })),
    }))
    .with('set-agent-role', (value) => ({
      ...state,
      agents: updateAgentAt(state.agents, value.index, (agent) => ({
        ...agent,
        roleDescription: value.roleDescription,
      })),
    }))
    .with('set-agent-color', (value) => ({
      ...state,
      agents: updateAgentAt(state.agents, value.index, (agent) => ({
        ...agent,
        color: value.color,
      })),
    }))
    .with('set-agent-run-condition-terms', (value) => ({
      ...state,
      agents: updateAgentAt(state.agents, value.index, (agent) => {
        const anyOf = normalizeRunConditionTerms(value.value)
        return {
          ...agent,
          ...(anyOf.length > 0
            ? {
                runCondition: {
                  type: 'prompt-match',
                  anyOf,
                } as const,
              }
            : { runCondition: undefined }),
        }
      }),
    }))
    .with('set-stop-condition', (value) => ({ ...state, stopCondition: value.stopCondition }))
    .with('set-max-turns', (value) => ({ ...state, maxTurns: value.maxTurns }))
    .with('set-required-mcps-text', (value) => ({ ...state, requiredMcpsText: value.value }))
    .with('set-required-skills-text', (value) => ({ ...state, requiredSkillsText: value.value }))
    .exhaustive()
}

export function wagglePresetReducer(
  state: WagglePresetState,
  action: WagglePresetAction,
): WagglePresetState {
  return matchBy(action, 'type')
    .with('select-preset', (value) => ({ ...state, activePresetId: value.activePresetId }))
    .with('save-success', (value) => ({
      ...state,
      activePresetId: value.activePresetId,
      error: null,
    }))
    .with('clear-active-preset', () => ({ ...state, activePresetId: null }))
    .with('clear-error', () => ({ ...state, error: null }))
    .with('set-error', (value) => ({ ...state, error: value.error }))
    .exhaustive()
}
