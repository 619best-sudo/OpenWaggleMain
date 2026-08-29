import { Search } from 'lucide-react'

export function NoProjectState() {
  return (
    <div className="flex h-full items-center justify-center bg-bg">
      <div className="rounded-xl border border-white/5 bg-white/[0.02] px-6 py-8 text-center backdrop-blur-sm">
        <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-white/5">
          <Search className="size-5 text-text-tertiary" />
        </div>
        <p className="text-sm font-medium text-text-primary">No project selected</p>
        <p className="mt-1 text-[12px] text-text-tertiary">
          Select a project folder to manage AGENTS.md and project skills.
        </p>
      </div>
    </div>
  )
}

export function EmptySkillsState() {
  return (
    <div className="px-4 py-3">
      <div className="border-b border-border/50 px-1 py-3">
        <div className="mb-2 h-3 w-32 rounded bg-bg-tertiary/70" />
        <div className="h-2.5 w-52 rounded bg-bg-tertiary/45" />
      </div>
      <div className="border-b border-border/50 px-1 py-3">
        <div className="mb-2 h-3 w-28 rounded bg-bg-tertiary/60" />
        <div className="h-2.5 w-44 rounded bg-bg-tertiary/40" />
      </div>
      <div className="px-1 pb-2 pt-4">
        <p className="text-[11px] font-medium text-text-secondary">No skills discovered</p>
        <p className="mt-1 text-[10px] text-text-tertiary leading-relaxed">
          Import a skill or add one to your project skills folder or `.agents/skills`.
        </p>
      </div>
    </div>
  )
}
