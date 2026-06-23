import {
  type WaggleAgentColor as CoreWaggleAgentColor,
  type WaggleAgentOutputContract as CoreWaggleAgentOutputContract,
  type WaggleAgentRunCondition as CoreWaggleAgentRunCondition,
  type WaggleCollaborationMode as CoreWaggleCollaborationMode,
  type WaggleLoopContract as CoreWaggleLoopContract,
  type WagglePlaceholderPolicy as CoreWagglePlaceholderPolicy,
  type WaggleStopCondition as CoreWaggleStopCondition,
  WAGGLE_AGENT_COLORS,
  WAGGLE_INHERIT_MODEL,
} from '@openwaggle/waggle-core'
import { SupportedModelId, type WagglePresetId } from './brand'
import type { SupportedModelId as SupportedModelIdType } from './llm'

export { WAGGLE_AGENT_COLORS, WAGGLE_INHERIT_MODEL }

export type WaggleCollaborationMode = CoreWaggleCollaborationMode
export type WaggleAgentColor = CoreWaggleAgentColor
export type WaggleAgentRunCondition = CoreWaggleAgentRunCondition
export type WaggleAgentOutputContract = CoreWaggleAgentOutputContract
export type WaggleLoopContract = CoreWaggleLoopContract
export type WagglePlaceholderPolicy = CoreWagglePlaceholderPolicy
export type WaggleStopCondition = CoreWaggleStopCondition
export type WaggleModelBinding = typeof WAGGLE_INHERIT_MODEL | SupportedModelIdType

export function createWaggleModelBinding(model: string): WaggleModelBinding {
  return model === WAGGLE_INHERIT_MODEL ? WAGGLE_INHERIT_MODEL : SupportedModelId(model)
}

export function isInheritedWaggleModelBinding(
  model: WaggleModelBinding,
): model is typeof WAGGLE_INHERIT_MODEL {
  return model === WAGGLE_INHERIT_MODEL
}

export interface WaggleAgentSlot {
  readonly label: string
  readonly model: WaggleModelBinding
  readonly roleDescription: string
  readonly color: WaggleAgentColor
  readonly runCondition?: WaggleAgentRunCondition
  readonly outputContract?: WaggleAgentOutputContract
}

export interface WaggleStopConfig {
  readonly primary: WaggleStopCondition
  readonly maxTurnsSafety: number
}

export interface WaggleConfig {
  readonly mode: WaggleCollaborationMode
  readonly agents: readonly WaggleAgentSlot[]
  readonly stop: WaggleStopConfig
  readonly loopContract?: WaggleLoopContract
}

export interface WaggleAppManifest {
  readonly requiredMcps: readonly string[]
  readonly requiredSkills: readonly string[]
  readonly optionalMcps?: readonly string[]
  readonly optionalSkills?: readonly string[]
}

export type WaggleAppDependencyKind = 'mcp' | 'skill'
export type WaggleAppDependencyState = 'installed' | 'missing' | 'unsupported'
export type WaggleAppPreflightVerdict = 'ready' | 'partial' | 'blocked'
export type WaggleAppPreflightCheckStatus = 'pass' | 'warn' | 'fail'

export interface WaggleAppDependencyStatus {
  readonly kind: WaggleAppDependencyKind
  readonly id: string
  readonly label: string
  readonly required: boolean
  readonly state: WaggleAppDependencyState
  readonly description?: string
  readonly detail?: string
  readonly setupSteps?: readonly string[]
}

export interface WaggleAppPreflightCheck {
  readonly id: string
  readonly label: string
  readonly status: WaggleAppPreflightCheckStatus
  readonly detail: string
  readonly blocking: boolean
}

export interface WaggleAppPreflightStatus {
  readonly verdict: WaggleAppPreflightVerdict
  readonly summary: string
  readonly checks: readonly WaggleAppPreflightCheck[]
}

export interface WaggleAppInstallStatus {
  readonly ready: boolean
  readonly requiredDependencyCount: number
  readonly optionalDependencyCount: number
  readonly installedCount: number
  readonly missingCount: number
  readonly unsupportedCount: number
  readonly optionalInstalledCount: number
  readonly optionalMissingCount: number
  readonly optionalUnsupportedCount: number
  readonly dependencies: readonly WaggleAppDependencyStatus[]
  readonly preflight?: WaggleAppPreflightStatus
}

export interface WaggleAppInstallResult {
  readonly status: WaggleAppInstallStatus
  readonly installedDependencyIds: readonly string[]
  readonly enabledDependencyIds: readonly string[]
  readonly skippedDependencyIds: readonly string[]
  readonly unsupportedDependencyIds: readonly string[]
}

export interface WagglePreset {
  readonly id: WagglePresetId
  readonly name: string
  readonly description: string
  readonly config: WaggleConfig
  readonly app: WaggleAppManifest
  readonly isBuiltIn: boolean
  readonly createdAt: number
  readonly updatedAt: number
}

export const WAGGLE_COLLABORATION_STATUSES = [
  'idle',
  'running',
  'paused',
  'completed',
  'stopped',
] as const
export type WaggleCollaborationStatus = (typeof WAGGLE_COLLABORATION_STATUSES)[number]

export interface WaggleFileModificationRecord {
  readonly path: string
  readonly lastModifiedBy: number
  readonly modifiedAt: number
  readonly modificationCount: number
}

export interface WaggleFileConflictWarning {
  readonly path: string
  readonly previousAgent: string
  readonly currentAgent: string
  readonly turnNumber: number
}

export interface WaggleConsensusSignal {
  readonly type: 'explicit-agreement' | 'no-new-information' | 'action-convergence' | 'turn-limit'
  readonly confidence: number
  readonly reason: string
}

export interface WaggleConsensusCheckResult {
  readonly reached: boolean
  readonly confidence: number
  readonly reason: string
  readonly signals: readonly WaggleConsensusSignal[]
}

export type WaggleArtifactKind = 'image' | 'audio' | 'video'
export type WaggleArtifactBase64Mode = 'reasonable-if-required' | 'avoid'

export interface WaggleArtifactTransport {
  readonly fileName: string
  readonly sizeBytes?: number
  readonly preferredFieldNames: readonly string[]
  readonly fallbackFieldNames: readonly string[]
  readonly base64Mode: WaggleArtifactBase64Mode
}

export interface WaggleArtifact {
  readonly id: string
  readonly kind: WaggleArtifactKind
  readonly path: string
  readonly uri: string
  readonly mimeType?: string
  readonly sourceTool: string
  readonly createdByAgentIndex: number
  readonly createdByAgentLabel: string
  readonly turnNumber: number
  readonly transport: WaggleArtifactTransport
  readonly promptSummary?: string
}

export interface WaggleStreamMetadata {
  readonly agentIndex: number
  readonly agentLabel: string
  readonly agentColor: WaggleAgentColor
  readonly agentModel: SupportedModelId
  readonly turnNumber: number
  readonly collaborationMode: WaggleCollaborationMode
  readonly sessionId?: string
}

export interface WaggleMessageMetadata {
  readonly agentIndex: number
  readonly agentLabel: string
  readonly agentColor: WaggleAgentColor
  readonly agentModel?: SupportedModelId
  readonly turnNumber: number
  /** Unique ID for this waggle session. Groups turns that belong to the same waggle run. */
  readonly sessionId?: string
}

export type WaggleTurnEvent =
  | {
      readonly type: 'turn-start'
      readonly turnNumber: number
      readonly agentIndex: number
      readonly agentLabel: string
    }
  | {
      readonly type: 'artifact-registered'
      readonly artifact: WaggleArtifact
    }
  | {
      readonly type: 'turn-end'
      readonly turnNumber: number
      readonly agentIndex: number
      readonly agentLabel: string
      readonly agentColor: WaggleAgentColor
      readonly agentModel: SupportedModelId
    }
  | { readonly type: 'consensus-reached'; readonly result: WaggleConsensusCheckResult }
  | { readonly type: 'file-conflict'; readonly warning: WaggleFileConflictWarning }
  | {
      readonly type: 'collaboration-complete'
      readonly reason: string
      readonly totalTurns: number
    }
  | { readonly type: 'collaboration-stopped'; readonly reason: string }
