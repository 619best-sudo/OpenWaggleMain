export interface ProjectMemoryStatus {
  readonly projectPath: string
  readonly isEnabled: boolean
  readonly isRefreshing: boolean
  readonly lastFullSyncStartedAt?: number
  readonly lastFullSyncCompletedAt?: number
  readonly lastModel?: string
  readonly lastError?: string
}
