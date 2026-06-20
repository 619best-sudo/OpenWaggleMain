import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { PanelErrorBoundary } from '@/shared/ui/PanelErrorBoundary'

interface WorkspacePanelSurfaceProps {
  readonly name: string
  readonly title: string
  readonly description?: string
  readonly children: ReactNode
  readonly className?: string
  readonly contentClassName?: string
  readonly headerActionsId?: string
  readonly framed?: boolean
}

export function WorkspacePanelSurface({
  name,
  title,
  description,
  children,
  className,
  contentClassName,
  headerActionsId,
  framed = true,
}: WorkspacePanelSurfaceProps) {
  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-1 overflow-hidden',
        framed && 'p-3',
      )}
    >
      <PanelErrorBoundary
        name={name}
        className={cn(
          'flex min-w-0 flex-1 overflow-hidden',
          framed && 'rounded-[18px] border border-border/70 bg-bg',
          className,
        )}
      >
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
            framed && 'bg-bg',
          )}
        >
          {title || description || headerActionsId ? (
            <div className="shrink-0 border-b border-border/70 px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  {title ? (
                    <h2 className="text-[20px] font-semibold text-text-primary">{title}</h2>
                  ) : null}
                  {description ? (
                    <p className="max-w-[760px] text-[13px] leading-5 text-text-secondary">
                      {description}
                    </p>
                  ) : null}
                </div>
                {headerActionsId ? <div id={headerActionsId} className="shrink-0" /> : null}
              </div>
            </div>
          ) : null}
          <div className={cn('min-h-0 min-w-0 flex-1 overflow-y-auto px-6 py-5', contentClassName)}>
            {children}
          </div>
        </div>
      </PanelErrorBoundary>
    </div>
  )
}
