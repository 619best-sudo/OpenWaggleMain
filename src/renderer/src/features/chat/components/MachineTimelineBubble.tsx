import type { MachineExecutionState } from '@shared/types/machine'
import { CheckCircle2, Circle, PlayCircle, XCircle } from 'lucide-react'
import { Fragment } from 'react'
import { Button } from '@/shared/ui/Button'

function TaskStatusIcon({
  status,
}: {
  readonly status: MachineExecutionState['tasks'][number]['status']
}) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="size-4 text-emerald-500" />
    case 'running':
      return <PlayCircle className="size-4 text-violet-500" />
    case 'failed':
      return <XCircle className="size-4 text-red-400" />
    case 'pending':
      return <Circle className="size-4 text-text-tertiary" />
  }
}

interface MachineTimelineBubbleProps {
  readonly plan: MachineExecutionState
  readonly onApprove: () => Promise<void>
  readonly onDiscard: () => Promise<void>
  readonly variant?: 'primary' | 'summary'
}

export function MachineTimelineBubble({
  plan,
  onApprove,
  onDiscard,
  variant = 'primary',
}: MachineTimelineBubbleProps) {
  const isSummary = variant === 'summary'

  return (
    <div className="group/assistant-msg relative w-full">
      <section className="border-l-[3px] border-border pl-4 py-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium leading-6 text-text-primary">{plan.goal}</div>
            {plan.lastError ? (
              <div className="mt-2 text-[13px] text-red-400">{plan.lastError}</div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {isSummary ? null : plan.phase === 'awaiting_approval' ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="border border-border bg-transparent"
                  onClick={() => void onDiscard()}
                >
                  Discard
                </Button>
                <Button size="sm" onClick={() => void onApprove()}>
                  Approve Plan
                </Button>
              </>
            ) : plan.phase === 'completed' || plan.phase === 'failed' ? (
              <Button
                variant="ghost"
                size="sm"
                className="border border-border bg-transparent"
                onClick={() => void onDiscard()}
              >
                Dismiss
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full border-collapse border border-border text-left text-[13px]">
            <thead>
              <tr className="bg-bg-secondary">
                <th className="w-10 border border-border px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
                  No.
                </th>
                <th className="border border-border px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
                  Task
                </th>
                <th className="w-28 border border-border px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {plan.tasks.map((task, index) => (
                <Fragment key={task.id}>
                  <tr>
                    <td className="border border-border px-3 py-3 align-top text-sm font-medium tabular-nums text-text-secondary">
                      {index + 1}.
                    </td>
                    <td className="border border-border px-3 py-3 align-top">
                      <div className="min-w-0">
                        <div className="font-medium text-text-primary">{task.title}</div>
                        {task.lastError ? (
                          <div className="mt-2 text-[12px] text-red-400">{task.lastError}</div>
                        ) : null}
                      </div>
                    </td>
                    <td className="border border-border px-3 py-3 align-top">
                      <div className="inline-flex items-start gap-1.5 pt-0.5 text-[11px] uppercase tracking-wide text-text-secondary">
                        <TaskStatusIcon status={task.status} />
                        <span>{task.status.replace('_', ' ')}</span>
                      </div>
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
