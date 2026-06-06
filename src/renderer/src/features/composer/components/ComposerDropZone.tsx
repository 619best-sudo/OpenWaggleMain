import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import type { UseFileAttachmentResult } from '../hooks/useFileAttachment'
import { ComposerDropOverlay } from './ComposerDropOverlay'

interface ComposerDropZoneProps {
  readonly fileAttachment: UseFileAttachmentResult
  readonly children: ReactNode
}

export function ComposerDropZone({ fileAttachment, children }: ComposerDropZoneProps) {
  return (
    <section
      aria-label="Composer file drop zone"
      className={cn(
        'relative rounded-md bg-[#09090b] border border-white/10 transition-all',
        'focus-within:border-[#8ba57b]/50',
        fileAttachment.isDragOver &&
          !fileAttachment.isAtCapacity &&
          'border-[#8ba57b] bg-[#8ba57b]/5',
        fileAttachment.isDragOver &&
          fileAttachment.isAtCapacity &&
          'border-red-400/60 bg-red-400/5',
      )}
      onDragEnter={fileAttachment.handleDragEnter}
      onDragLeave={fileAttachment.handleDragLeave}
      onDragOver={fileAttachment.handleDragOver}
      onDrop={(event) => {
        void fileAttachment.handleDrop(event)
      }}
    >
      {fileAttachment.isDragOver ? (
        <ComposerDropOverlay isAtCapacity={fileAttachment.isAtCapacity} />
      ) : null}
      {children}
    </section>
  )
}
