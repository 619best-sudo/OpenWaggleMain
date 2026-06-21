import { ChevronDown, FileText, FolderOpen, Gamepad2, PencilLine } from 'lucide-react'
import { useState } from 'react'
import { projectName } from '@/shared/lib/format'
import { Button } from '@/shared/ui/Button'
import { Popover } from '@/shared/ui/Popover'

interface WelcomeScreenProps {
  projectPath: string | null
  hasProject: boolean
  recentProjects: readonly string[]
  onOpenProject?: () => void
  onSelectProjectPath?: (path: string) => Promise<void> | void
  onRetry?: (content: string) => void
}

const STARTER_PROMPTS = [
  { label: 'Build a coding game in this repo', icon: Gamepad2 },
  { label: 'Draft a one-page summary of this app', icon: FileText },
  { label: 'Create a refactor plan for this codebase', icon: PencilLine },
]

const PRIMARY_PROMPT_COUNT = 2
const ICON_STROKE_WIDTH = 2.5
const SECONDARY_ICON_STROKE_WIDTH = 1.5

function ProjectPickerTrigger({
  projectPath,
  onClick,
}: {
  projectPath: string | null
  onClick: () => void
}) {
  return (
    <Button
      variant="unstyled"
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[16px] font-semibold text-accent-foreground transition-colors hover:bg-accent-dim"
      title="Open project picker"
    >
      <FolderOpen className="size-4.5" strokeWidth={ICON_STROKE_WIDTH} />
      <span>{projectName(projectPath)}</span>
      <ChevronDown className="size-4.5 opacity-60" strokeWidth={ICON_STROKE_WIDTH} />
    </Button>
  )
}

function StarterPromptButton({
  prompt,
  onClick,
  isSecondary = false,
}: {
  prompt: (typeof STARTER_PROMPTS)[number]
  onClick?: (content: string) => void
  isSecondary?: boolean
}) {
  return (
    <Button
      variant="unstyled"
      type="button"
      onClick={() => onClick?.(prompt.label)}
      className="flex min-h-11 w-full items-center justify-center gap-3 rounded-md border border-border bg-bg-secondary px-4 py-3 text-center text-[14px] font-medium text-text-primary/82 transition-all hover:border-border-light hover:bg-bg-hover hover:text-text-primary"
    >
      <prompt.icon
        className="size-4 shrink-0"
        strokeWidth={isSecondary ? SECONDARY_ICON_STROKE_WIDTH : undefined}
      />
      <span>{prompt.label}</span>
    </Button>
  )
}

export function WelcomeScreen({
  projectPath,
  hasProject,
  recentProjects,
  onOpenProject,
  onSelectProjectPath,
  onRetry,
}: WelcomeScreenProps) {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)

  function handleChooseProject(path: string) {
    setProjectMenuOpen(false)
    void onSelectProjectPath?.(path)
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-[960px] px-6 text-center">
      <div className="flex w-full flex-1 flex-col items-center justify-center">
        <div className="flex w-full max-w-[760px] flex-col items-center justify-center">
          <div className="flex w-full flex-col items-center">
            <div className="max-w-[620px] space-y-3">
              <h1 className="text-[40px] font-bold tracking-tight text-text-primary">
                What are we building?
              </h1>
              <p className="text-[16px] text-text-primary/78">
                Start typing to build, refactor, or debug.
              </p>
            </div>

            <div className="mt-10 flex justify-center">
              {hasProject ? (
                <Popover
                  open={projectMenuOpen}
                  onOpenChange={setProjectMenuOpen}
                  placement="bottom-start"
                  className="mt-2 w-[340px] p-2"
                  trigger={
                    <ProjectPickerTrigger
                      projectPath={projectPath}
                      onClick={() => setProjectMenuOpen((prev) => !prev)}
                    />
                  }
                >
                  <Button
                    variant="unstyled"
                    type="button"
                    onClick={() => {
                      setProjectMenuOpen(false)
                      onOpenProject?.()
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-text-primary/82 transition-colors hover:bg-bg-hover hover:text-text-primary"
                  >
                    <FolderOpen className="size-3.5 shrink-0" />
                    Select folder…
                  </Button>

                  {recentProjects.length > 0 && (
                    <div className="mt-1 border-t border-border pt-1">
                      <div className="px-2.5 py-1 text-[11px] uppercase tracking-wide text-text-tertiary">
                        Recent projects
                      </div>
                      {recentProjects.map((path) => (
                        <Button
                          variant="unstyled"
                          key={path}
                          type="button"
                          onClick={() => handleChooseProject(path)}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-text-primary/82 transition-colors hover:bg-bg-hover hover:text-text-primary"
                        >
                          <FolderOpen className="size-3.5 shrink-0 text-text-secondary" />
                          <span className="min-w-0 flex-1 truncate">{projectName(path)}</span>
                          {path === projectPath ? (
                            <span className="text-[11px] text-text-tertiary">Current</span>
                          ) : null}
                        </Button>
                      ))}
                    </div>
                  )}
                </Popover>
              ) : (
                <Button
                  variant="unstyled"
                  type="button"
                  onClick={() => {
                    onOpenProject?.()
                  }}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-[14px] font-medium text-text-primary/82 transition-colors hover:border-border-light hover:text-text-primary"
                  title="Open project picker"
                >
                  <FolderOpen className="size-4 shrink-0" />
                  <span>Select a project folder to get started</span>
                </Button>
              )}
            </div>

            <div className="mt-14 flex w-full flex-col items-center gap-3">
              <div className="grid w-full max-w-[700px] grid-cols-1 gap-3 md:grid-cols-2">
                {STARTER_PROMPTS.slice(0, PRIMARY_PROMPT_COUNT).map((prompt) => (
                  <StarterPromptButton key={prompt.label} prompt={prompt} onClick={onRetry} />
                ))}
              </div>
              <div className="w-full max-w-[340px]">
                {STARTER_PROMPTS.slice(PRIMARY_PROMPT_COUNT).map((prompt) => (
                  <StarterPromptButton
                    key={prompt.label}
                    prompt={prompt}
                    onClick={onRetry}
                    isSecondary
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
