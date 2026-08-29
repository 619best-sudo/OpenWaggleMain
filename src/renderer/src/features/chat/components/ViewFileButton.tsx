/**
 * A "View file" pill for the extreme right of a file tool's strip header.
 *
 * Clicking it publishes a scroll target to {@link useDiffViewTargetStore};
 * `ChatRouteSurface` opens the diff panel when it is closed, and `DiffPanel`
 * scrolls to that file's section once its data has loaded. Kept deliberately
 * free of router hooks so transcript components can render it anywhere.
 *
 * The harness carries absolute paths while the diff panel keys its sections
 * by repo-relative git paths — the relativization below is the bridge.
 */
import { FileSearch } from 'lucide-react'
import { relativeToProject } from '@/features/chat/lib/project-paths'
import { useActiveProjectPath } from '@/features/chat/lib/use-active-project-path'
import { useDiffViewTargetStore } from '@/features/diff-panel/state'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'

export function ViewFileButton({
  path,
  className,
}: {
  readonly path: string
  readonly className?: string
}) {
  const projectPath = useActiveProjectPath()
  const requestViewFile = useDiffViewTargetStore((state) => state.requestViewFile)

  return (
    <Button
      variant="unstyled"
      type="button"
      title={`View ${relativeToProject(projectPath, path)} in the diff panel`}
      onClick={() => {
        requestViewFile(relativeToProject(projectPath, path))
      }}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full',
        'border border-code-view-border bg-bg-secondary/95 px-2 py-0.5',
        'text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted',
        'transition-colors hover:bg-bg-hover hover:text-text-secondary',
        className,
      )}
    >
      <FileSearch className="size-3 shrink-0" />
      View file
    </Button>
  )
}
