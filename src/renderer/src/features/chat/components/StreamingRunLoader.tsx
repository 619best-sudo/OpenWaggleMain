import type { AgentPhaseId } from '@shared/types/phase'
import { isLightThemeMode } from '@shared/types/settings'
import { usePreferencesStore } from '@/features/settings/state'
import darkLoaderGif from '../../../../../assets/loader.gif'
import lightLoaderGif from '../../../../../assets/loader-light.gif'

interface StreamingRunLoaderProps {
  readonly currentPhaseId?: AgentPhaseId | null
  readonly isWaiting?: boolean
}

function resolveLoaderTitle(currentPhaseId?: AgentPhaseId | null, isWaiting?: boolean) {
  if (isWaiting) {
    return 'Waiting'
  }
  if (currentPhaseId === 'perform') {
    return 'Writing'
  }
  return 'Thinking'
}

export function StreamingRunLoader({ currentPhaseId, isWaiting }: StreamingRunLoaderProps) {
  const themeMode = usePreferencesStore((state) => state.settings.themeMode)
  const isLightTheme = isLightThemeMode(themeMode)
  const loaderSrc = isLightTheme ? lightLoaderGif : darkLoaderGif
  const title = resolveLoaderTitle(currentPhaseId, isWaiting)

  return (
    <div
      className="flex items-center gap-3 py-1"
      data-run-loader="true"
      data-run-loader-state="running"
    >
      <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full">
        <img
          src={loaderSrc}
          alt=""
          aria-hidden="true"
          className="size-7 rounded-[0.7rem] object-contain"
        />
      </div>
      <div className="text-sm font-semibold text-text-primary">{title}</div>
    </div>
  )
}
