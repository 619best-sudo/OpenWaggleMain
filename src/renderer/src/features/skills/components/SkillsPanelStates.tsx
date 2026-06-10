import { Search } from 'lucide-react'

export function NoProjectState() {
  return (
    <div className="flex h-full items-center justify-center bg-bg">
      <div className="rounded-xl border border-white/5 bg-white/[0.02] px-6 py-8 text-center backdrop-blur-sm">
        <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-white/5">
          <Search className="size-5 text-text-tertiary" />
        </div>
        <p className="text-sm font-medium text-text-primary">No project selected</p>
        <p className="mt-1 text-[13px] text-text-tertiary">
          Select a project folder to manage AGENTS.md and project skills.
        </p>
      </div>
    </div>
  )
}

export function EmptySkillsState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-white/5 bg-white/[0.01] p-6 text-center">
      <p className="text-[12px] font-medium text-text-secondary">No skills discovered</p>
      <p className="mt-1 text-[11px] text-text-tertiary leading-relaxed">
        Add skills to `.openwaggle/skills` or import from a URL.
      </p>
    </div>
  )
}
