import type { WagglePreset } from '@shared/types/waggle'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/lib/ipc'
import { queryKeys } from './query-keys'
import type { OpenWaggleQueryOptions } from './query-options'

type WaggleAppInstallStatusResult = Awaited<ReturnType<typeof api.getWaggleAppInstallStatus>>

export function waggleAppInstallStatusQueryOptions(
  projectPath: string | null,
  preset: WagglePreset,
): OpenWaggleQueryOptions<
  WaggleAppInstallStatusResult,
  Error,
  WaggleAppInstallStatusResult,
  ReturnType<typeof queryKeys.waggleAppInstallStatus>
> {
  return queryOptions({
    queryKey: queryKeys.waggleAppInstallStatus(projectPath, preset.id, preset.updatedAt),
    enabled: projectPath !== null,
    queryFn: () => api.getWaggleAppInstallStatus(preset, projectPath),
  })
}

export function useWaggleAppInstallStatus(projectPath: string | null, preset: WagglePreset) {
  return useQuery(waggleAppInstallStatusQueryOptions(projectPath, preset))
}

export function useInstallWaggleAppDependenciesMutation(projectPath: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (preset: WagglePreset) => api.installWaggleAppDependencies(preset, projectPath),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['waggleAppInstallStatus', projectPath],
      })
    },
  })
}
