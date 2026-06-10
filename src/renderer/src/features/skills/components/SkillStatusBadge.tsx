import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react'

export function StatusBadge({ status }: { status: 'found' | 'missing' | 'error' }) {
  if (status === 'found') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success ring-1 ring-inset ring-success/20">
        Found
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-error/10 px-1.5 py-0.5 text-[10px] font-medium text-error ring-1 ring-inset ring-error/20">
        Error
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-text-tertiary ring-1 ring-inset ring-white/10">
      Missing
    </span>
  )
}
