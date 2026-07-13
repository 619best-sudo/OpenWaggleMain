import { isLightThemeMode } from '@shared/types/settings'
import type { CompletedPhase } from '@/features/chat/hooks/useStreamingPhase'
import { usePreferencesStore } from '@/features/settings/state'
import lightLogoPng from '../../../../../assets/new-logo.png'
import darkLogoPng from '../../../../../assets/new-logo.png'

interface RunSummaryProps {
  phases: readonly CompletedPhase[]
  totalMs: number
  completedAtMs: number | null
}

export function RunSummary({
  phases: _phases,
  totalMs: _totalMs,
  completedAtMs: _completedAtMs,
}: RunSummaryProps) {
  const themeMode = usePreferencesStore((state) => state.settings.themeMode)
  const isLightTheme = isLightThemeMode(themeMode)
  const completionLogoSrc = isLightTheme ? lightLogoPng : darkLogoPng

  const totalSecs = Math.round(_totalMs / 1000)

  return (
    <div className="py-0.5">
      <div className="flex items-center gap-3 py-1">
        <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-bg-secondary/20">
          <div
            className={`flex size-7 items-center justify-center overflow-hidden rounded-[0.7rem] ${
              isLightTheme ? 'bg-white' : 'bg-black'
            }`}
          >
            <img
              src={completionLogoSrc}
              alt=""
              aria-hidden="true"
              className="size-7 object-contain"
            />
          </div>
        </div>
        <div className="flex flex-col text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-text-primary">Completed</span>
            <span className="text-text-tertiary">in {totalSecs}s</span>
          </div>
          {_completedAtMs && (
            <span className="text-[10px] text-text-tertiary">
              Finished at {new Date(_completedAtMs).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
