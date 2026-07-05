import type { AgentErrorInfo } from './errors'

export type FeedbackCategory = 'bug' | 'feature' | 'question'

export interface FeedbackPayload {
  readonly title: string
  readonly description: string
  readonly category: FeedbackCategory
  readonly includeSystemInfo: boolean
  readonly includeLogs: boolean
  readonly includeErrorContext: boolean
  readonly includeLastMessage: boolean
  readonly includeModelInfo: boolean
  /** Pre-resolved renderer context for attachment sections */
  readonly lastUserMessage?: string
  readonly lastErrorContext?: AgentErrorInfo
  readonly activeModel?: string
  readonly activeProvider?: string
}

export interface GhCliStatus {
  readonly available: boolean
  readonly authenticated: boolean
}

export interface GithubRepoStat {
  readonly name: string
  readonly stargazerCount: number
  readonly forkCount: number
  readonly pushedAt?: string
}

export interface GithubRepoStatsSnapshot {
  readonly username: string
  readonly repos: readonly GithubRepoStat[]
  readonly publicRepoCount: number
  readonly totalStars: number
  readonly totalForks: number
  readonly activeRepoCount: number
  readonly syncedAt: string
}

export interface DiagnosticsInfo {
  readonly os: string
  readonly appVersion: string
  readonly electronVersion: string
  readonly nodeVersion: string
  readonly arch: string
}

export type FeedbackSubmitResult =
  | {
      readonly success: true
      readonly issueUrl?: string
    }
  | {
      readonly success: false
      readonly error?: string
    }
