import { matchBy } from '@diegogbrisa/ts-match'
import type { ThemeMode } from '@shared/types/settings'
import type { UpdateStatus } from '@shared/types/updater'
import { Loader2, Moon, Palette, RefreshCw, RotateCcw, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { usePreferences } from '@/features/settings/hooks/useSettings'
import { api } from '@/shared/lib/ipc'
import { createRendererLogger } from '@/shared/lib/logger'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'

const logger = createRendererLogger('settings')

function useAppVersion() {
  const [version, setVersion] = useState('…')
  useEffect(() => {
    if (typeof api.getAppVersion !== 'function') return
    api
      .getAppVersion()
      .then(setVersion)
      .catch((err: unknown) => {
        logger.warn('Failed to load app version', { error: String(err) })
      })
  }, [])
  return version
}

function useUpdateStatus() {
  const [status, setStatus] = useState<UpdateStatus>({ type: 'idle' })

  useEffect(() => {
    if (typeof api.getUpdateStatus !== 'function') return
    api
      .getUpdateStatus()
      .then(setStatus)
      .catch((err: unknown) => {
        logger.warn('Failed to load update status', { error: String(err) })
      })
  }, [])

  useEffect(() => {
    if (typeof api.onUpdateStatus !== 'function') return
    return api.onUpdateStatus(setStatus)
  }, [])

  return status
}

interface StatusRow {
  subtitle: string
  subtitleClass: string
  dotClass: string | null
}

const THEME_OPTIONS: ReadonlyArray<{
  readonly value: ThemeMode
  readonly title: string
  readonly description: string
  readonly icon: typeof Moon
}> = [
  {
    value: 'dark',
    title: 'Dark',
    description: 'Deep surfaces with lower glare for focused work.',
    icon: Moon,
  },
  {
    value: 'light',
    title: 'Light',
    description: 'Brighter surfaces with higher daylight contrast.',
    icon: Sun,
  },
  {
    value: 'cocoa',
    title: 'Cocoa',
    description: 'Keeps the dark workspace while warming blue accents to a cocoa tint.',
    icon: Palette,
  },
  {
    value: 'metallic-gold',
    title: 'Metallic Gold',
    description: 'Replaces the blue dark-theme palette with metallic gold while keeping core dark surfaces.',
    icon: Moon,
  },
  {
    value: 'cream',
    title: 'Cream',
    description: 'Replaces the blue light-theme palette with cream-toned borders, fills, and accents.',
    icon: Sun,
  },
  {
    value: 'velvet-obsidian',
    title: 'Velvet Obsidian',
    description: 'Replaces the blue dark-theme palette with a velvet obsidian tint based on #171721.',
    icon: Moon,
  },
  {
    value: 'platinum',
    title: 'Platinum',
    description: 'Replaces the blue light-theme palette with a platinum tint based on #DAE0E1.',
    icon: Sun,
  },
  {
    value: 'bulgarian-rose',
    title: 'Bulgarian Rose',
    description: 'Replaces the blue dark-theme palette with a Bulgarian Rose tint based on #4A0603.',
    icon: Moon,
  },
]

const UP_TO_DATE: StatusRow = {
  subtitle: 'You are up to date',
  subtitleClass: 'text-text-tertiary',
  dotClass: null,
}

function getStatusRow(status: UpdateStatus) {
  return matchBy(status, 'type')
    .with('idle', () => UP_TO_DATE)
    .with('not-available', () => UP_TO_DATE)
    .with('checking', () => ({
      subtitle: 'Checking for updates…',
      subtitleClass: 'text-text-tertiary',
      dotClass: null,
    }))
    .with('available', (s) => ({
      subtitle: `Downloading v${s.version}…`,
      subtitleClass: 'text-info',
      dotClass: 'bg-info',
    }))
    .with('downloading', (s) => ({
      subtitle: `Downloading v${s.version}… ${Math.round(s.percent)}%`,
      subtitleClass: 'text-info',
      dotClass: 'bg-info',
    }))
    .with('downloaded', (s) => ({
      subtitle: `v${s.version} ready to install`,
      subtitleClass: 'text-success',
      dotClass: 'bg-success',
    }))
    .with('error', () => ({
      subtitle: 'Update check failed',
      subtitleClass: 'text-error',
      dotClass: 'bg-error',
    }))
    .exhaustive()
}

function ThemeSection() {
  const { settings, setThemeMode } = usePreferences()

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-[16px] font-semibold text-text-primary">Theme</h3>
        <p className="text-[13px] text-text-tertiary">
          Choose the workspace appearance used across OpenWaggle.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-bg-secondary">
        {THEME_OPTIONS.map((option, index) => {
          const isActive = settings.themeMode === option.value
          const Icon = option.icon

          return (
            <Button
              key={option.value}
              variant="unstyled"
              type="button"
              onClick={() => void setThemeMode(option.value)}
              aria-pressed={isActive}
              className={cn(
                'flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors',
                index > 0 && 'border-t border-border',
                isActive ? 'bg-bg-active' : 'hover:bg-bg-hover',
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-md border',
                    isActive
                      ? 'border-accent/30 bg-accent/10 text-accent'
                      : 'border-border bg-bg-tertiary text-text-tertiary',
                  )}
                >
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-text-primary">{option.title}</span>
                    {isActive ? (
                      <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-accent">
                        Active
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[12px] text-text-tertiary">{option.description}</p>
                </div>
              </div>
            </Button>
          )
        })}
      </div>
    </div>
  )
}

export function GeneralSection() {
  const version = useAppVersion()
  const status = useUpdateStatus()
  const statusRow = getStatusRow(status)

  const canCheck =
    status.type === 'idle' || status.type === 'not-available' || status.type === 'error'
  const isDownloaded = status.type === 'downloaded'
  const isChecking = status.type === 'checking'

  return (
    <div className="space-y-6">
      <ThemeSection />

      {/* About & Updates — title outside the card */}
      <div className="space-y-3">
        <h3 className="text-[16px] font-semibold text-text-primary">About & Updates</h3>

        <div className="overflow-hidden rounded-lg border border-border bg-bg-secondary">
          {/* Row 1 — Version */}
          <div className="flex h-14 items-center justify-between border-b border-border px-5">
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-medium text-text-primary">Version</span>
              <span className="text-[12px] text-text-tertiary">OpenWaggle v{version}</span>
            </div>
          </div>

          {/* Row 2 — Latest version / status */}
          <div className="flex h-14 items-center justify-between px-5">
            <div className="flex items-center gap-2">
              {statusRow.dotClass ? (
                <div className={`size-2 shrink-0 rounded-full ${statusRow.dotClass}`} />
              ) : isChecking ? (
                <Loader2 className="size-3 shrink-0 animate-spin text-text-tertiary" />
              ) : null}
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] font-medium text-text-primary">Latest version</span>
                <span className={`text-[12px] ${statusRow.subtitleClass}`}>
                  {statusRow.subtitle}
                </span>
              </div>
            </div>
            <div>
              {canCheck && (
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => {
                    if (typeof api.checkForUpdates === 'function') {
                      api.checkForUpdates().catch((err: unknown) => {
                        logger.warn('Failed to check for updates', { error: String(err) })
                      })
                    }
                  }}
                  className="h-7 bg-bg-tertiary text-text-secondary hover:bg-bg-hover"
                >
                  <RefreshCw className="size-3" />
                  Check now
                </Button>
              )}
              {isDownloaded && (
                <Button
                  variant="primary"
                  size="xs"
                  onClick={() => {
                    if (typeof api.installUpdate === 'function') {
                      api.installUpdate().catch((err: unknown) => {
                        logger.warn('Failed to install update', { error: String(err) })
                      })
                    }
                  }}
                  className="h-7"
                >
                  <RotateCcw className="size-3" />
                  Restart to update
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
