import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEscapeHotkey } from '@/shared/hooks/useEscapeHotkey'
import { cn } from '@/shared/lib/cn'
import { useBranchPickerController } from '../hooks/useBranchPickerController'
import { BranchPickerActions } from './BranchPickerActions'
import { BranchPickerList } from './BranchPickerList'
import { BranchPickerSearch } from './BranchPickerSearch'
import { BranchPickerTrigger } from './BranchPickerTrigger'

interface BranchPickerProps {
  readonly onToast?: (message: string) => void
}

export function BranchPicker({ onToast }: BranchPickerProps) {
  const controller = useBranchPickerController({ onToast })
  const triggerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelPosition, setPanelPosition] = useState({ top: 0, left: 0 })
  if (!controller.projectPath) return null

  useEffect(() => {
    if (!controller.branchMenuOpen) return

    function updatePanelPosition() {
      const trigger = triggerRef.current
      if (!trigger) return

      const rect = trigger.getBoundingClientRect()
      const panelWidth = 320
      const viewportPadding = 8
      const left = Math.min(
        Math.max(viewportPadding, rect.right - panelWidth),
        window.innerWidth - panelWidth - viewportPadding,
      )

      setPanelPosition({
        top: Math.max(viewportPadding, rect.top - 4),
        left,
      })
    }

    updatePanelPosition()
    window.addEventListener('resize', updatePanelPosition)
    window.addEventListener('scroll', updatePanelPosition, true)
    return () => {
      window.removeEventListener('resize', updatePanelPosition)
      window.removeEventListener('scroll', updatePanelPosition, true)
    }
  }, [controller.branchMenuOpen])

  useEffect(() => {
    if (!controller.branchMenuOpen) return

    function handlePointerDown(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      controller.openMenu(null)
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [controller.branchMenuOpen, controller.openMenu])

  useEscapeHotkey(
    () => {
      controller.openMenu(null)
    },
    { enabled: controller.branchMenuOpen },
  )

  return (
    <>
      <div ref={triggerRef}>
        <BranchPickerTrigger
          currentBranch={controller.currentBranch}
          isOpen={controller.branchMenuOpen}
          onToggle={(open) => controller.openMenu(open ? 'branch' : null)}
        />
      </div>
      {controller.branchMenuOpen
        ? createPortal(
            <div
              ref={panelRef}
              className={cn(
                'fixed z-[70] w-[320px] -translate-y-full rounded-lg border border-border-light bg-bg-secondary p-2 shadow-lg',
              )}
              style={{
                top: panelPosition.top,
                left: panelPosition.left,
              }}
            >
              <BranchPickerSearch
                query={controller.branchQuery}
                isBranchActionRunning={controller.isBranchActionRunning}
                onQueryChange={controller.setBranchQuery}
              />
              <BranchPickerActions
                currentBranch={controller.currentBranch}
                onOpenActionDialog={controller.openActionDialog}
              />
              <BranchPickerList
                filteredBranches={controller.filteredBranches}
                localBranches={controller.localBranches}
                remoteBranches={controller.remoteBranches}
                onCheckout={(branchName) => {
                  void controller.checkoutBranch(branchName)
                }}
                onOpenActionDialog={controller.openActionDialog}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
