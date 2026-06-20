import type { MouseEvent } from 'react'
import { cn } from '@/shared/lib/cn'

type ToggleSwitchSize = 'compact' | 'default'

interface ToggleSwitchProps {
  readonly checked: boolean
  readonly onCheckedChange: (checked: boolean) => void
  readonly label: string
  readonly disabled?: boolean
  readonly className?: string
  readonly size?: ToggleSwitchSize
  readonly stopPropagation?: boolean
}

const TRACK_CLASS: Record<ToggleSwitchSize, string> = {
  compact: 'h-4 w-7',
  default: 'h-5 w-9',
}

const THUMB_CLASS: Record<ToggleSwitchSize, string> = {
  compact: 'size-3',
  default: 'size-3.5',
}

const THUMB_OFFSET_CLASS: Record<ToggleSwitchSize, { readonly on: string; readonly off: string }> =
  {
    compact: { on: 'translate-x-3.5', off: 'translate-x-0.5' },
    default: { on: 'translate-x-5', off: 'translate-x-0.5' },
  }

export function ToggleSwitch({
  checked,
  onCheckedChange,
  label,
  disabled = false,
  className,
  size = 'default',
  stopPropagation = false,
}: ToggleSwitchProps) {
  function toggle() {
    if (!disabled) {
      onCheckedChange(!checked)
    }
  }

  function toggleFromClick(event: MouseEvent<HTMLButtonElement>) {
    if (stopPropagation) {
      event.stopPropagation()
    }
    toggle()
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      aria-label={label}
      disabled={disabled}
      onClick={toggleFromClick}
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border transition-[background-color,border-color,box-shadow]',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        checked
          ? 'border-info/45 bg-info shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-info)_22%,transparent),0_0_12px_color-mix(in_srgb,var(--color-info)_18%,transparent)]'
          : 'border-border bg-bg-hover',
        TRACK_CLASS[size],
        className,
      )}
    >
      <span
        className={cn(
          'block rounded-full transition-[transform,background-color]',
          checked ? 'bg-bg' : 'bg-text-tertiary',
          THUMB_CLASS[size],
          checked ? THUMB_OFFSET_CLASS[size].on : THUMB_OFFSET_CLASS[size].off,
        )}
      />
    </button>
  )
}
