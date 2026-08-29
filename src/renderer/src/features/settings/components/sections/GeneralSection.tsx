import type { ThemeMode } from '@shared/types/settings'
import { Check, Moon, Sun } from 'lucide-react'
import { usePreferences } from '@/features/settings/hooks/useSettings'
import { cn } from '@/shared/lib/cn'

const THEME_OPTIONS: Array<{
  readonly mode: ThemeMode
  readonly label: string
  readonly description: string
  readonly icon: typeof Sun
}> = [
  {
    mode: 'light',
    label: 'Light',
    description: 'Brighter surfaces for daytime use.',
    icon: Sun,
  },
  {
    mode: 'dark',
    label: 'Dark',
    description: 'A lower-glare workspace for longer sessions.',
    icon: Moon,
  },
]

function ThemeSection() {
  const { settings, setThemeMode } = usePreferences()
  const isDarkTheme = settings.themeMode === 'dark'

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-[14px] font-semibold text-text-primary">Theme</h3>
        <p className="text-[12px] text-text-tertiary">
          Choose the appearance used across the workspace.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-bg-secondary p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {THEME_OPTIONS.map((option) => {
            const isSelected = settings.themeMode === option.mode
            const OptionIcon = option.icon

            return (
              <button
                key={option.mode}
                type="button"
                aria-pressed={isSelected}
                aria-label={`${option.label} theme`}
                onClick={() => void setThemeMode(option.mode)}
                className={cn(
                  'group w-full rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35',
                  isSelected
                    ? 'border-accent/35 bg-bg shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-accent)_16%,transparent)]'
                    : 'border-border bg-bg/60 hover:border-border/70 hover:bg-bg',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          'flex size-8 items-center justify-center rounded-lg border',
                          isSelected
                            ? 'border-accent/30 bg-accent/10 text-accent'
                            : 'border-border bg-bg-secondary text-text-tertiary',
                        )}
                      >
                        <OptionIcon className="size-4" />
                      </div>
                      <span className="text-[13px] font-semibold text-text-primary">
                        {option.label}
                      </span>
                    </div>
                    <p className="text-[11px] leading-5 text-text-tertiary">{option.description}</p>
                  </div>

                  {isSelected ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-accent">
                      <Check className="size-3" />
                      Current
                    </span>
                  ) : null}
                </div>

                <div
                  aria-hidden="true"
                  className={cn(
                    'mt-4 overflow-hidden rounded-lg border p-3',
                    option.mode === 'light'
                      ? 'border-black/10 bg-[#f4f4f5]'
                      : 'border-white/10 bg-[#09090b]',
                  )}
                >
                  <div
                    className={cn(
                      'h-2.5 w-16 rounded-full',
                      option.mode === 'light' ? 'bg-black/12' : 'bg-white/15',
                    )}
                  />
                  <div className="mt-3 grid grid-cols-[1.3fr_1fr] gap-2">
                    <div
                      className={cn(
                        'h-12 rounded-md',
                        option.mode === 'light' ? 'bg-white shadow-sm' : 'bg-white/8',
                      )}
                    />
                    <div className="space-y-2">
                      <div
                        className={cn(
                          'h-5 rounded-md',
                          option.mode === 'light' ? 'bg-black/8' : 'bg-white/10',
                        )}
                      />
                      <div
                        className={cn(
                          'h-5 rounded-md',
                          option.mode === 'light' ? 'bg-black/8' : 'bg-white/10',
                        )}
                      />
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <p className="mt-4 text-[11px] text-text-muted">
          Active now:{' '}
          <span className="font-medium text-text-secondary">{isDarkTheme ? 'Dark' : 'Light'}</span>
        </p>
      </div>
    </div>
  )
}

export function GeneralSection() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-text-primary">General</h2>
        <p className="max-w-[720px] text-[12px] leading-6 text-text-tertiary">
          Manage workspace-wide preferences such as theme and appearance.
        </p>
      </div>

      <ThemeSection />
    </div>
  )
}
