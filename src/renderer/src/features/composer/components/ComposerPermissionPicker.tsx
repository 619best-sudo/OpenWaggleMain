import { TOOL_PERMISSION_MODES, type ToolPermissionMode } from '@shared/types/settings'
import { Check, Shield, ShieldCheck, ShieldEllipsis } from 'lucide-react'
import { useMemo, useState } from 'react'
import { usePreferencesStore } from '@/features/settings/state'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { Popover } from '@/shared/ui/Popover'

const PERMISSION_MODE_LABELS: Record<ToolPermissionMode, string> = {
  ask: 'Ask',
  'ask-edit': 'Ask only edit',
  'allow-all': 'Allow all',
}

const PERMISSION_MODE_HELPER: Record<ToolPermissionMode, string> = {
  ask: 'Show permission prompts before guarded tools run.',
  'ask-edit': 'Let tools run by default, but ask before code mutation tools run.',
  'allow-all': 'Run guarded tools without permission prompts by default.',
}

export function ComposerPermissionPicker() {
  const permissionMode = usePreferencesStore((state) => state.settings.toolPermissionMode)
  const setToolPermissionMode = usePreferencesStore((state) => state.setToolPermissionMode)
  const [open, setOpen] = useState(false)

  const triggerLabel = useMemo(
    () => `Permission: ${PERMISSION_MODE_LABELS[permissionMode]}`,
    [permissionMode],
  )

  function handleSelect(mode: ToolPermissionMode) {
    void setToolPermissionMode(mode)
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="top-start"
      className="w-[240px] p-1.5"
      trigger={
        <Button
          variant="unstyled"
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="home-panel-frame-soft flex h-6 min-w-0 shrink items-center gap-1 rounded-[5px] px-2 text-[11px] text-text-secondary transition-colors hover:bg-bg-hover"
          title={triggerLabel}
          aria-label={triggerLabel}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          {permissionMode === 'allow-all' ? (
            <ShieldCheck className="size-[13px] shrink-0 text-text-tertiary" />
          ) : permissionMode === 'ask-edit' ? (
            <ShieldEllipsis className="size-[13px] shrink-0 text-text-tertiary" />
          ) : (
            <Shield className="size-[13px] shrink-0 text-text-tertiary" />
          )}
          <span className="whitespace-nowrap @max-[560px]:hidden">
            {PERMISSION_MODE_LABELS[permissionMode]}
          </span>
          <span className="shrink-0 text-[9px] text-text-tertiary">&#x2228;</span>
        </Button>
      }
    >
      <div className="rounded-md">
        <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-text-muted">
          Future Tools
        </div>
        <div className="space-y-1">
          {TOOL_PERMISSION_MODES.map((mode) => {
            const active = mode === permissionMode
            return (
              <Button
                key={mode}
                variant="unstyled"
                type="button"
                onClick={() => handleSelect(mode)}
                className={cn(
                  'flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors',
                  active
                    ? 'bg-bg-hover text-text-primary'
                    : 'text-text-secondary hover:bg-bg-hover',
                )}
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[11px] font-medium">{PERMISSION_MODE_LABELS[mode]}</span>
                  <span className="text-[10px] text-text-muted">
                    {PERMISSION_MODE_HELPER[mode]}
                  </span>
                </div>
                {active ? <Check className="mt-0.5 size-3.5 shrink-0 text-accent" /> : null}
              </Button>
            )
          })}
        </div>
      </div>
    </Popover>
  )
}
