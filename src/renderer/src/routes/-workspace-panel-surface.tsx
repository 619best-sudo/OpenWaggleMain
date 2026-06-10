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
}

export function WorkspacePanelSurface({
  name,
  title,
  description,
  children,
  className,
  contentClassName,
  headerActionsId,
}: WorkspacePanelSurfaceProps) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden px-3 pb-3 pt-3">
      <PanelErrorBoundary
        name={name}
        className={cn(
          'flex min-w-0 flex-1 overflow-hidden rounded-[16px] border border-[#8ba57b]/16 bg-[#09090b]',
          className,
        )}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#09090b]">
          <div className="shrink-0 border-b border-white/6 px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-[20px] font-semibold text-[#f1f4ee]">{title}</h2>
                {description ? (
                  <p className="max-w-[760px] text-[13px] leading-5 text-[#a1a1aa]">
                    {description}
                  </p>
                ) : null}
              </div>
              {headerActionsId ? <div id={headerActionsId} className="shrink-0" /> : null}
            </div>
          </div>
          <div className={cn('min-h-0 min-w-0 flex-1 overflow-y-auto px-6 py-5', contentClassName)}>
            {children}
          </div>
        </div>
      </PanelErrorBoundary>
    </div>
  )
}
