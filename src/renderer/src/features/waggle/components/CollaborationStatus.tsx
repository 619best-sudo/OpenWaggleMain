import type { SessionId } from '@shared/types/brand'
import { generateDisplayName } from '@shared/types/llm'
import { isInheritedWaggleModelBinding, type WaggleAgentSlot } from '@shared/types/waggle'
import { AlertTriangle, Loader2, Sparkles, X } from 'lucide-react'
import { usePreferencesStore } from '@/features/settings/state'
import type { TuringFollowUpSuggestion } from '@/features/waggle/lib/turing-follow-up'
import { AGENT_BG } from '@/features/waggle/lib/agent-colors'
import { useWaggleStore } from '@/features/waggle/state/waggle-store'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'

const SINGLE_TURN_COUNT = 1
const SLICE_ARG_1 = -3
const ARTIFACT_PREVIEW_COUNT = 4

interface CollaborationStatusProps {
  currentSessionId: SessionId | null
  onStop: () => void
  followUpSuggestion?: TuringFollowUpSuggestion | null
  onUseFollowUpPrompt?: (suggestion: TuringFollowUpSuggestion) => void
}

function turnCountLabel(turnCount: number) {
  return `${String(turnCount)} ${turnCount === SINGLE_TURN_COUNT ? 'turn' : 'turns'}`
}

function displayModelForAgent(agent: WaggleAgentSlot, inheritedModel: string) {
  if (!isInheritedWaggleModelBinding(agent.model)) return generateDisplayName(agent.model)
  return inheritedModel.trim() ? generateDisplayName(inheritedModel) : 'Select model'
}

export function WaggleCollaborationStatus({
  currentSessionId,
  onStop,
  followUpSuggestion = null,
  onUseFollowUpPrompt,
}: CollaborationStatusProps) {
  const selectedModel = usePreferencesStore((s) => s.settings.selectedModel)
  const status = useWaggleStore((s) => s.status)
  const config = useWaggleStore((s) => s.activeConfig)
  const activeCollaborationId = useWaggleStore((s) => s.activeCollaborationId)
  const configSessionId = useWaggleStore((s) => s.configSessionId)
  const currentTurn = useWaggleStore((s) => s.currentTurn)
  const currentAgentIndex = useWaggleStore((s) => s.currentAgentIndex)
  const currentAgentLabel = useWaggleStore((s) => s.currentAgentLabel)
  const fileConflicts = useWaggleStore((s) => s.fileConflicts)
  const artifacts = useWaggleStore((s) => s.artifacts)
  const completionReason = useWaggleStore((s) => s.completionReason)
  const clearConfig = useWaggleStore((s) => s.clearConfig)
  const reset = useWaggleStore((s) => s.reset)

  if (!config) return null

  // Scope: only show for the session that owns the waggle state
  const owningSessionId = activeCollaborationId ?? configSessionId
  if (owningSessionId && owningSessionId !== currentSessionId) return null
  const currentAgent = config.agents[currentAgentIndex]
  const maxTurns = config.stop.maxTurnsSafety

  function handleDismiss() {
    if (status === 'running') {
      onStop()
    }
    reset()
  }

  return (
    <div className="mx-auto w-full max-w-[720px] px-5 pb-2 space-y-1.5">
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg border px-3 py-2',
          status === 'idle' ? 'border-accent/20 bg-accent/5' : 'border-border bg-bg-secondary',
        )}
      >
        {/* Agent dots — always visible */}
        <div className="flex min-w-0 items-center gap-2 shrink-0">
          {config.agents.map((agent) => {
            const displayModel = displayModelForAgent(agent, selectedModel)
            return (
              <div
                key={`${agent.label}-${String(agent.model)}`}
                className="flex items-center gap-1"
                title={`${agent.label} · ${displayModel}`}
              >
                <div className={cn('size-2 rounded-full', AGENT_BG[agent.color])} />
                <span className="text-[11px] font-medium text-text-secondary">{agent.label}</span>
                <span className="hidden text-[11px] text-text-tertiary sm:inline">
                  · {displayModel}
                </span>
              </div>
            )
          })}
        </div>

        <div className="h-3 w-px bg-border shrink-0" />

        {/* Status-specific content */}
        {status === 'idle' && (
          <span className="text-[12px] text-text-tertiary truncate">
            Waggle ready · Sequential · {turnCountLabel(maxTurns)}: send a message to start
          </span>
        )}

        {status === 'running' && (
          <div className="flex items-center gap-2 min-w-0">
            <Loader2 className="size-3 animate-spin text-accent shrink-0" />
            <span className="text-[12px] text-text-secondary truncate">
              Turn {currentTurn + SINGLE_TURN_COUNT}/{maxTurns}: {currentAgentLabel}
              {currentAgent ? ` · ${displayModelForAgent(currentAgent, selectedModel)}` : ''}
            </span>
          </div>
        )}

        {status === 'completed' && (
          <span className="text-[12px] text-text-secondary truncate">
            Waggle complete · {completionReason ?? 'Collaboration complete'}
          </span>
        )}

        {status === 'stopped' && (
          <span className="text-[12px] text-text-muted truncate">Stopped by user</span>
        )}

        {/* Dismiss — always available */}
        <Button
          variant="unstyled"
          type="button"
          onClick={status === 'idle' ? clearConfig : handleDismiss}
          className="ml-auto shrink-0 rounded-md p-1 text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
          title={status === 'running' ? 'Stop & dismiss waggle' : 'Dismiss waggle'}
        >
          <X className="size-3" />
        </Button>
      </div>

      {status === 'completed' && followUpSuggestion ? (
        <div className="rounded-lg border border-accent/20 bg-accent/[0.03] px-3 py-2.5 shadow-sm">
          <div className="flex flex-wrap items-start gap-2.5">
            <div className="flex min-w-0 flex-1 gap-2.5">
              <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent" />
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
                    Suggested Next Waggle
                  </span>
                  <span className="inline-flex items-center rounded-md border border-border/70 bg-bg px-2 py-1 text-[12px] font-medium text-text-primary">
                    {followUpSuggestion.nextWaggle}
                  </span>
                  {followUpSuggestion.fallbackWaggle ? (
                    <span className="text-[11px] text-text-tertiary">
                      fallback{' '}
                      <span className="font-medium text-text-secondary">
                        {followUpSuggestion.fallbackWaggle}
                      </span>
                    </span>
                  ) : null}
                </div>

                <div className="rounded-md border border-border/50 bg-bg/80 px-2.5 py-2">
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-text-tertiary">
                    User Prompt
                  </div>
                  <div className="text-[11px] leading-5 text-text-secondary">
                    {followUpSuggestion.userPrompt}
                  </div>
                </div>
              </div>
            </div>

            <Button
              variant="accent"
              size="xs"
              className="shrink-0 self-start shadow-sm"
              onClick={() => {
                onUseFollowUpPrompt?.(followUpSuggestion)
              }}
            >
              Use Prompt
            </Button>
          </div>
        </div>
      ) : null}

      {/* File conflict warnings — only during/after run */}
      {fileConflicts.length > 0 && (
        <div className="space-y-1">
          {fileConflicts.slice(SLICE_ARG_1).map((conflict, i) => (
            <div
              key={`${conflict.path}-${String(i)}`}
              className="flex items-center gap-2 rounded-md border border-warning/20 bg-warning/5 px-2.5 py-1.5"
            >
              <AlertTriangle className="size-3 shrink-0 text-warning" />
              <span className="text-[11px] text-warning/90">
                {conflict.currentAgent} edited {conflict.path} (previously by{' '}
                {conflict.previousAgent})
              </span>
            </div>
          ))}
        </div>
      )}

      {artifacts.length > 0 && (
        <div className="rounded-lg border border-border bg-bg-secondary/70 px-3 py-2.5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
              Waggle Artifacts
            </span>
            <span className="text-[11px] text-text-tertiary">{artifacts.length} registered</span>
          </div>
          <div className="mb-2 rounded-md border border-border-light bg-bg px-2.5 py-2 text-[10px] leading-4 text-text-tertiary">
            When using MCPs, always map artifact starter payload values into the tool schema
            exactly.
          </div>
          <div className="space-y-1.5">
            {artifacts
              .slice(-ARTIFACT_PREVIEW_COUNT)
              .reverse()
              .map((artifact) => (
                <div
                  key={artifact.id}
                  className="rounded-md border border-border-light bg-bg px-2.5 py-2"
                >
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="rounded-full border border-border-light bg-bg-secondary px-2 py-0.5 font-medium uppercase tracking-wide text-text-secondary">
                      {artifact.kind}
                    </span>
                    <span className="font-medium text-text-primary">{artifact.id}</span>
                    <span className="text-text-tertiary">
                      Agent {String(artifact.createdByAgentIndex + SINGLE_TURN_COUNT)} ·{' '}
                      {artifact.createdByAgentLabel}
                    </span>
                  </div>
                  <div
                    className="mt-1 truncate text-[11px] text-text-secondary"
                    title={artifact.path}
                  >
                    {artifact.path}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-text-tertiary">
                    <span>
                      Prefer{' '}
                      {artifact.transport.preferredFieldNames
                        .map((field) => `\`${field}\``)
                        .join(', ')}
                    </span>
                    <span>·</span>
                    <span>
                      Fallback{' '}
                      {artifact.transport.fallbackFieldNames
                        .map((field) => `\`${field}\``)
                        .join(', ')}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-text-tertiary">
                    {artifact.transport.base64Mode === 'reasonable-if-required'
                      ? 'Small enough that base64 is reasonable only if the MCP explicitly requires bytes.'
                      : 'Prefer exact path or file URI. Avoid base64 unless the MCP has no path or URI option.'}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
