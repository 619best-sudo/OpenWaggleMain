import type { InputHTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '@/shared/lib/cn'

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  readonly ref?: Ref<HTMLInputElement>
  readonly label?: ReactNode
  readonly labelClassName?: string
}

const CHECKBOX_CLASS = cn(
  'peer size-4 shrink-0 appearance-none rounded-[4px] border border-border bg-bg-secondary shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-bg)_65%,transparent)] transition-[background-color,border-color,box-shadow,opacity]',
  'hover:border-text-muted/70 hover:bg-bg-tertiary',
  'checked:border-accent checked:bg-accent checked:shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-accent)_22%,transparent)]',
  'disabled:cursor-not-allowed disabled:opacity-60',
)

const CHECKMARK_CLASS = cn(
  'pointer-events-none absolute left-[5px] top-[1px] h-2.5 w-1.5 rotate-45 border-b-2 border-r-2 border-accent-foreground opacity-0 transition-opacity',
  'peer-checked:opacity-100 peer-disabled:opacity-50',
)

function CheckboxControl({
  ref,
  className,
  ...props
}: Omit<CheckboxProps, 'label' | 'labelClassName'>) {
  return (
    <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
      <input ref={ref} type="checkbox" className={cn(CHECKBOX_CLASS, className)} {...props} />
      <span aria-hidden="true" className={CHECKMARK_CLASS} />
    </span>
  )
}

export function Checkbox({ ref, label, labelClassName, className, ...props }: CheckboxProps) {
  if (!label) {
    return <CheckboxControl ref={ref} className={className} {...props} />
  }

  return (
    <label
      className={cn(
        'flex items-center gap-2 text-[13px] text-text-secondary',
        props.disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        labelClassName,
      )}
    >
      <CheckboxControl ref={ref} className={className} {...props} />
      {label}
    </label>
  )
}
