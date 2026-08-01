import type { SkillCatalogResult, SkillImportResult } from '@shared/types/standards'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { queryKeys } from '@/queries/query-keys'
import {
  type SkillResourcesResult,
  type StandardsStatus,
  skillPreviewQueryOptions,
  skillResourcesQueryOptions,
} from '@/queries/skills'
import { api } from '@/shared/lib/ipc'

interface UseSkillsResult {
  standardsStatus: StandardsStatus | null
  catalog: SkillCatalogResult | null
  selectedSkillId: string | null
  previewMarkdown: string
  isLoading: boolean
  isPreviewLoading: boolean
  isImporting: boolean
  isRemoving: boolean
  error: string | null
  refresh: () => Promise<void>
  selectSkill: (skillId: string) => void
  toggleSkill: (skillId: string, enabled: boolean) => Promise<void>
  importSkill: (sourceUrl: string) => Promise<SkillImportResult>
  removeSkill: (skillId: string) => Promise<void>
}

function describeSkillsError(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback
}

export function useSkills(projectPath: string | null): UseSkillsResult {
  const queryClient = useQueryClient()
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null)
  const skillResourcesQuery = useQuery(skillResourcesQueryOptions(projectPath))

  const toggleSkillMutation = useMutation({
    mutationFn: ({
      nextProjectPath,
      skillId,
      enabled,
    }: {
      readonly nextProjectPath: string
      readonly skillId: string
      readonly enabled: boolean
    }) => api.setSkillEnabled(nextProjectPath, skillId, enabled),
  })
  const importSkillMutation = useMutation({
    mutationFn: ({
      nextProjectPath,
      sourceUrl,
    }: {
      readonly nextProjectPath: string
      readonly sourceUrl: string
    }) => api.importSkillFromUrl(nextProjectPath, sourceUrl),
  })
  const removeSkillMutation = useMutation({
    mutationFn: ({
      nextProjectPath,
      skillId,
    }: {
      readonly nextProjectPath: string
      readonly skillId: string
    }) => api.removeSkill(nextProjectPath, skillId),
  })

  const catalog = skillResourcesQuery.data?.catalog ?? null
  const standardsStatus = skillResourcesQuery.data?.standardsStatus ?? null
  const selectedSkill = catalog?.skills.find((skill) => skill.id === selectedSkillId) ?? null
  const isPreviewEnabled =
    projectPath !== null &&
    selectedSkillId !== null &&
    selectedSkill !== null &&
    selectedSkill.loadStatus !== 'error'

  const previewQuery = useQuery(
    skillPreviewQueryOptions(projectPath, selectedSkillId, isPreviewEnabled),
  )

  useEffect(() => {
    if (!projectPath) {
      setSelectedSkillId(null)
      return
    }

    const currentSkills = catalog?.skills ?? []
    setSelectedSkillId((current) => {
      if (current && currentSkills.some((skill) => skill.id === current)) {
        return current
      }
      return currentSkills[0]?.id ?? null
    })
  }, [catalog?.skills, projectPath])

  async function toggleSkill(skillId: string, enabled: boolean) {
    if (!projectPath) return
    toggleSkillMutation.reset()
    try {
      await toggleSkillMutation.mutateAsync({ nextProjectPath: projectPath, skillId, enabled })
    } catch {
      return
    }

    await queryClient.invalidateQueries({ queryKey: queryKeys.skills(projectPath), exact: true })
    const refreshedResources = queryClient.getQueryData<SkillResourcesResult>(
      queryKeys.skills(projectPath),
    )
    const refreshedSkills = refreshedResources?.catalog.skills ?? []
    if (selectedSkillId === skillId && refreshedSkills.some((skill) => skill.id === skillId)) {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.skillPreview(projectPath, skillId),
        exact: true,
      })
    }
  }

  async function refresh() {
    if (!projectPath) return

    await queryClient.invalidateQueries({ queryKey: queryKeys.skills(projectPath), exact: true })
    const refreshedResources = queryClient.getQueryData<SkillResourcesResult>(
      queryKeys.skills(projectPath),
    )
    const refreshedSkills = refreshedResources?.catalog.skills ?? []
    if (selectedSkillId && refreshedSkills.some((skill) => skill.id === selectedSkillId)) {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.skillPreview(projectPath, selectedSkillId),
        exact: true,
      })
    }
  }

  async function importSkill(sourceUrl: string) {
    if (!projectPath) {
      throw new Error('Project path is required to import a skill.')
    }

    const result = await importSkillMutation.mutateAsync({
      nextProjectPath: projectPath,
      sourceUrl,
    })
    if (result.status === 'imported') {
      setSelectedSkillId(result.skillId)
      await queryClient.invalidateQueries({ queryKey: queryKeys.skills(projectPath), exact: true })
      await queryClient.invalidateQueries({
        queryKey: queryKeys.skillPreview(projectPath, result.skillId),
        exact: true,
      })
    }
    return result
  }

  async function removeSkill(skillId: string) {
    if (!projectPath) return
    removeSkillMutation.reset()
    await removeSkillMutation.mutateAsync({ nextProjectPath: projectPath, skillId })
    // Clear the preview for the removed skill so the pane doesn't hold stale
    // markdown for a folder that no longer exists.
    await queryClient.invalidateQueries({
      queryKey: queryKeys.skillPreview(projectPath, skillId),
      exact: true,
    })
    await queryClient.invalidateQueries({ queryKey: queryKeys.skills(projectPath), exact: true })
  }

  function getErrorMessage() {
    if (skillResourcesQuery.error) {
      return describeSkillsError(skillResourcesQuery.error, 'Failed to load skills.')
    }
    if (previewQuery.error) {
      return describeSkillsError(previewQuery.error, 'Failed to load skill preview.')
    }
    if (toggleSkillMutation.error) {
      return describeSkillsError(toggleSkillMutation.error, 'Failed to update skill state.')
    }
    if (removeSkillMutation.error) {
      return describeSkillsError(removeSkillMutation.error, 'Failed to remove skill.')
    }
    return null
  }

  return {
    standardsStatus,
    catalog,
    selectedSkillId,
    previewMarkdown: previewQuery.data?.markdown ?? '',
    isLoading: skillResourcesQuery.isPending,
    isPreviewLoading: previewQuery.isPending,
    isImporting: importSkillMutation.isPending,
    isRemoving: removeSkillMutation.isPending,
    error: getErrorMessage(),
    refresh,
    selectSkill: setSelectedSkillId,
    toggleSkill,
    importSkill,
    removeSkill,
  }
}
