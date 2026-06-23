import type { WaggleAppManifest } from './waggle'

export type TeammateAgentKind = 'executor' | 'decision-maker' | 'worker' | 'reviewer'

export type TeammateRunWhen =
  | 'initial'
  | 'when-routed'
  | 'before-stop'
  | 'on-demand'
  | 'after-failure'

export type TeammatePromptMode = 'app-generated' | 'user-original'

export interface TeammateAgentDefinition {
  readonly id: string
  readonly label: string
  readonly kind: TeammateAgentKind
  readonly roleDescription: string
  readonly whyToRun?: string
  readonly runWhen?: readonly TeammateRunWhen[]
  readonly minRuns?: number
  readonly maxRuns?: number
  readonly isDecisionMaker?: boolean
  readonly createPrompt?: TeammatePromptMode
  readonly suggestedNextAgentIfSuccess?: string
}

export interface TeammateAgentGenerationInput {
  readonly instructions: string
  readonly availableAgentIds: readonly string[]
  readonly availableAgentLabels: readonly string[]
}

export interface TeammateAgentGenerationResult {
  readonly label: string
  readonly kind: TeammateAgentKind
  readonly roleDescription: string
  readonly whyToRun?: string
  readonly runWhen?: readonly TeammateRunWhen[]
  readonly minRuns?: number
  readonly maxRuns?: number
  readonly isDecisionMaker?: boolean
  readonly createPrompt?: TeammatePromptMode
  readonly suggestedNextAgentIfSuccess?: string
}

export interface TeammateLoopPolicy {
  readonly initialAgentId: string
  readonly decisionMakerAgentId: string
  readonly maxDecisionMakerCalls: number
  readonly maxAutoSubmittedPrompts: number
  readonly defaultWorkerAgentId: string
  readonly endConditionSummary: string
}

export interface TeammateDefinition {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly launchPromptPlaceholder: string
  readonly launchButtonLabel: string
  readonly app: WaggleAppManifest
  readonly agents: readonly TeammateAgentDefinition[]
  readonly loopPolicy: TeammateLoopPolicy
}
