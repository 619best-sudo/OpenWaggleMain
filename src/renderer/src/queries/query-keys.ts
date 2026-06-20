import type { SessionId } from '@shared/types/brand'

export const queryKeys = {
  wagglePresets: (projectPath: string | null) => ['wagglePresets', projectPath] as const,
  waggleAppInstallStatus: (projectPath: string | null, presetId: string, presetUpdatedAt: number) =>
    ['waggleAppInstallStatus', projectPath, presetId, presetUpdatedAt] as const,
  archivedSessions: ['archivedSessions'] as const,
  archivedSessionBranches: ['archivedSessionBranches'] as const,
  sessions: ['sessions'] as const,
  session: (id: SessionId | null) => ['session', id] as const,
  skills: (projectPath: string | null) => ['skills', projectPath] as const,
  skillPreview: (projectPath: string | null, skillId: string | null) =>
    ['skillPreview', projectPath, skillId] as const,
}
