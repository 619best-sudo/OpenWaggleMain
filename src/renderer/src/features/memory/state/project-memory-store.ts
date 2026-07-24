import type { ProjectMemoryStatus } from '@shared/types/project-memory'
import { create } from 'zustand'
import { api } from '@/shared/lib/ipc'

interface ProjectMemoryState {
  status: ProjectMemoryStatus | null
  isLoading: boolean
  error: string | null
  refreshStatus: (
    projectPath: string | null,
    modelRef?: string,
    opts?: { silent?: boolean },
  ) => Promise<ProjectMemoryStatus | null>
  refreshMemory: (
    projectPath: string,
    modelRef?: string,
    piSessionId?: string,
  ) => Promise<ProjectMemoryStatus>
  clear: () => void
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback
}

function equalProjectMemoryStatus(a: ProjectMemoryStatus | null, b: ProjectMemoryStatus | null) {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.projectPath === b.projectPath &&
    a.isEnabled === b.isEnabled &&
    a.isRefreshing === b.isRefreshing &&
    a.lastFullSyncStartedAt === b.lastFullSyncStartedAt &&
    a.lastFullSyncCompletedAt === b.lastFullSyncCompletedAt &&
    a.lastModel === b.lastModel &&
    a.lastError === b.lastError
  )
}

export const useProjectMemoryStore = create<ProjectMemoryState>((set) => ({
  status: null,
  isLoading: false,
  error: null,

  async refreshStatus(projectPath: string | null, modelRef?: string, opts?: { silent?: boolean }) {
    if (!projectPath) {
      set({ status: null, isLoading: false, error: null })
      return null
    }

    if (!opts?.silent) {
      set({ isLoading: true, error: null })
    }
    try {
      const status = await api.getProjectMemoryStatus(projectPath, modelRef)
      set((state) => {
        if (equalProjectMemoryStatus(state.status, status) && state.isLoading === false && state.error === null) {
          return state
        }
        return { status, isLoading: false, error: null }
      })
      return status
    } catch (error) {
      set({
        status: null,
        isLoading: false,
        error: errorMessage(error, 'Failed to load project memory status.'),
      })
      return null
    }
  },

  async refreshMemory(projectPath: string, modelRef?: string, piSessionId?: string) {
    set({ isLoading: true, error: null })
    try {
      const status = await api.refreshProjectMemory(projectPath, modelRef, piSessionId)
      set({ status, isLoading: false, error: null })
      return status
    } catch (error) {
      const message = errorMessage(error, 'Failed to refresh project memory.')
      set({ isLoading: false, error: message })
      throw new Error(message)
    }
  },

  clear() {
    set({ status: null, isLoading: false, error: null })
  },
}))
