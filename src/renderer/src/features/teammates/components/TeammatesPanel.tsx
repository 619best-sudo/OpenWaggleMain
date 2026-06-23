import type { ReactNode } from 'react'
import type { SessionId } from '@shared/types/brand'
import type { TeammateDefinition } from '@shared/types/teammate'
import { useNavigate } from '@tanstack/react-router'
import {
  FilePenLine,
  Globe,
  Play,
  Plus,
  Sparkles,
  WandSparkles,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useEscapeHotkey } from '@/shared/hooks/useEscapeHotkey'
import { useChat } from '@/features/chat/hooks/useChat'
import { usePreferencesStore } from '@/features/settings/state'
import { api } from '@/shared/lib/ipc'
import { Button } from '@/shared/ui/Button'
import { Select } from '@/shared/ui/Select'
import { TextInput } from '@/shared/ui/TextInput'
import { Textarea } from '@/shared/ui/Textarea'
import { ToggleSwitch } from '@/shared/ui/ToggleSwitch'
import { useUIStore } from '@/shell/ui-store'
import { BUILT_IN_TEAMMATES } from '../lib/built-in-teammates'
import {
  applyGeneratedAgentResult,
  buildTeammateFromDraft,
  createDefaultAgentDraft,
  createDefaultTeamBuilderDraft,
  TEAM_AGENT_KIND_OPTIONS,
  TEAM_PROMPT_MODE_OPTIONS,
  TEAM_RUN_WHEN_OPTIONS,
  type TeamAgentDraft,
  type TeamBuilderDraft,
} from '../lib/custom-team-builder'

type AgentEditorMode = 'manual' | 'generate'

function AgentPill({ label }: { readonly label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border/70 bg-bg px-2.5 py-1 text-[11px] font-medium text-text-secondary">
      {label}
    </span>
  )
}

function DependencyPill({ label }: { readonly label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-accent/20 bg-accent/5 px-2.5 py-1 text-[11px] font-medium text-accent">
      {label}
    </span>
  )
}

function FieldLabel({ htmlFor, children }: { readonly htmlFor?: string; readonly children: React.ReactNode }) {
  return (
    <span className="block text-[13px] font-medium text-text-primary" id={htmlFor ? undefined : undefined}>
      {children}
    </span>
  )
}

function SectionHint({ children }: { readonly children: React.ReactNode }) {
  return <p className="text-[12px] leading-5 text-text-tertiary">{children}</p>
}

interface CollapsibleSectionProps {
  readonly title: string
  readonly description?: string
  readonly defaultExpanded?: boolean
  readonly children: React.ReactNode
  readonly action?: React.ReactNode
}

function CollapsibleSection({ title, description, defaultExpanded = false, children, action }: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  
  return (
    <section className="rounded-xl border border-border-light bg-bg-secondary/30 shadow-sm overflow-hidden">
      <div 
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-bg-hover transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex-1 pr-4">
          <h4 className="text-[14px] font-semibold text-text-primary">{title}</h4>
          {description && <p className="text-[12px] text-text-secondary mt-0.5">{description}</p>}
        </div>
        <div className="flex items-center gap-3">
          {action && <div onClick={(e) => e.stopPropagation()}>{action}</div>}
          <div className="flex size-6 items-center justify-center rounded-md bg-bg text-text-tertiary">
            {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </div>
        </div>
      </div>
      {isExpanded && (
        <div className="px-5 pb-5 pt-1 border-t border-border-light/50">
          {children}
        </div>
      )}
    </section>
  )
}

function StoreSectionHeader({
  title,
  description,
  count,
}: {
  readonly title: string
  readonly description: string
  readonly count?: number
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <h3 className="text-[16px] font-bold text-text-primary">{title}</h3>
        {typeof count === 'number' ? (
          <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-text-tertiary">
            {count}
          </span>
        ) : null}
      </div>
      <p className="max-w-[760px] text-[13px] leading-relaxed text-text-secondary">{description}</p>
    </div>
  )
}

function TeamEditorDialog({
  title,
  description,
  onClose,
  children,
}: {
  readonly title: string
  readonly description: string
  readonly onClose: () => void
  readonly children: ReactNode
}) {
  useEscapeHotkey(onClose)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" onClick={onClose} />
      <div className="relative flex max-h-full w-full max-w-[980px] flex-col overflow-hidden rounded-2xl border border-border-light bg-bg shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border-light bg-bg-secondary/50 px-6 py-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <FilePenLine className="size-4.5" />
              </div>
              <h2 className="text-[15px] font-semibold tracking-wide text-text-primary">{title}</h2>
            </div>
            <p className="max-w-[720px] text-[13px] leading-relaxed text-text-secondary">{description}</p>
          </div>
          <Button
            variant="unstyled"
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary"
            title="Close"
          >
            <X className="size-4.5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto bg-bg p-6">{children}</div>
      </div>
    </div>
  )
}

function TeamVisitingCard({
  icon,
  eyebrow,
  title,
  role,
  description,
  agentLabels,
  dependencyLabels,
  onEdit,
}: {
  readonly icon: ReactNode
  readonly eyebrow: string
  readonly title: string
  readonly role: string
  readonly description: string
  readonly agentLabels: readonly string[]
  readonly dependencyLabels: readonly string[]
  readonly onEdit: () => void
}) {
  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-[16px] border border-border bg-bg-secondary p-5 shadow-sm transition-all duration-300 cursor-pointer hover:bg-bg-hover hover:border-white/20 hover:shadow-lg hover:-translate-y-0.5" onClick={onEdit}>
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="relative z-10 flex h-full flex-col gap-5">
        <div className="flex items-start gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-border bg-bg shadow-inner text-text-secondary">
            {icon}
          </div>
          <div className="min-w-0 space-y-1.5 pt-0.5">
            <div className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-tertiary">
              {eyebrow}
            </div>
            <div className="space-y-0.5">
              <h3 className="text-[16px] font-semibold tracking-tight text-text-primary leading-tight line-clamp-1">{title}</h3>
              <p className="text-[13px] font-medium text-text-secondary">{role}</p>
            </div>
          </div>
        </div>

        <p className="min-h-[60px] text-[13px] leading-relaxed text-text-tertiary">{description}</p>

        <div className="flex flex-wrap gap-2">
          {agentLabels.slice(0, 3).map((label) => (
            <span key={label} className="inline-flex items-center rounded-full border border-border bg-bg px-2.5 py-1 text-[11px] font-semibold text-text-secondary">
              {label}
            </span>
          ))}
          {dependencyLabels.map((label) => (
            <span key={label} className="inline-flex items-center rounded-full border border-border bg-bg-tertiary px-2.5 py-1 text-[11px] font-semibold text-text-tertiary">
              {label}
            </span>
          ))}
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-border pt-4">
          <span className="text-[12px] font-medium text-text-tertiary">View team configuration</span>
          <Button variant="secondary" size="sm" className="h-8 border-border bg-bg-tertiary hover:bg-bg-hover" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
            Edit
          </Button>
        </div>
      </div>
    </div>
  )
}

function summarizeRole(agentLabels: readonly string[]) {
  return agentLabels.slice(0, 2).join(' • ') || 'Custom Team'
}

function summarizeDescription(text: string, fallback: string) {
  const trimmed = text.trim()
  if (!trimmed) return fallback
  const firstSentence = trimmed.split(/(?<=[.!?])\s+/)[0]?.trim() ?? trimmed
  return firstSentence.length > 140 ? `${firstSentence.slice(0, 137)}...` : firstSentence
}

export function TeammatesPanel() {
  const navigate = useNavigate()
  const projectPath = usePreferencesStore((state) => state.settings.projectPath)
  const selectedModel = usePreferencesStore((state) => state.settings.selectedModel)
  const thinkingLevel = usePreferencesStore((state) => state.settings.thinkingLevel)
  const { activeSession, activeSessionId, createSession } = useChat()
  const showToast = useUIStore((state) => state.showToast)
  const builtInTeammates = useMemo(() => BUILT_IN_TEAMMATES, [])
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(builtInTeammates.map((teammate) => [teammate.id, ''])),
  )
  const [customTeam, setCustomTeam] = useState<TeamBuilderDraft>(() => createDefaultTeamBuilderDraft())
  const [agentEditorModes, setAgentEditorModes] = useState<Record<string, AgentEditorMode>>(() =>
    Object.fromEntries(customTeam.agents.map((agent) => [agent.id, 'manual' as const])),
  )
  const [isCustomEditorOpen, setIsCustomEditorOpen] = useState(false)
  const [activeBuiltInEditorId, setActiveBuiltInEditorId] = useState<string | null>(null)
  const [generatingAgentId, setGeneratingAgentId] = useState<string | null>(null)
  const [launchingId, setLaunchingId] = useState<string | null>(null)

  const activeBuiltInTeammate =
    builtInTeammates.find((teammate) => teammate.id === activeBuiltInEditorId) ?? null

  function updateDraft(teammateId: string, value: string) {
    setDrafts((current) => ({ ...current, [teammateId]: value }))
  }

  function updateCustomTeam(patch: Partial<TeamBuilderDraft>) {
    setCustomTeam((current) => ({ ...current, ...patch }))
  }

  function updateAgent(agentId: string, updater: (agent: TeamAgentDraft) => TeamAgentDraft) {
    setCustomTeam((current) => ({
      ...current,
      agents: current.agents.map((agent) => (agent.id === agentId ? updater(agent) : agent)),
    }))
  }

  function setEditorMode(agentId: string, mode: AgentEditorMode) {
    setAgentEditorModes((current) => ({ ...current, [agentId]: mode }))
  }

  function addAgent() {
    const nextIndex = customTeam.agents.length + 1
    const nextAgent = createDefaultAgentDraft(nextIndex)
    setCustomTeam((current) => ({
      ...current,
      agents: [...current.agents, nextAgent],
    }))
    setAgentEditorModes((current) => ({ ...current, [nextAgent.id]: 'manual' }))
  }

  function removeAgent(agentId: string) {
    if (customTeam.agents.length <= 1) {
      showToast('A custom team needs at least one agent.', 'error')
      return
    }

    setCustomTeam((current) => {
      const remainingAgents = current.agents.filter((agent) => agent.id !== agentId)
      const nextInitialAgentId =
        current.initialAgentId === agentId ? (remainingAgents[0]?.id ?? '') : current.initialAgentId
      const nextDecisionMakerAgentId =
        current.decisionMakerAgentId === agentId ? '' : current.decisionMakerAgentId

      return {
        ...current,
        agents: remainingAgents,
        initialAgentId: nextInitialAgentId,
        decisionMakerAgentId: nextDecisionMakerAgentId,
      }
    })

    setAgentEditorModes((current) => {
      const nextModes = { ...current }
      delete nextModes[agentId]
      return nextModes
    })
  }

  function toggleRunWhen(agentId: string, runWhen: (typeof TEAM_RUN_WHEN_OPTIONS)[number]['value']) {
    updateAgent(agentId, (agent) => ({
      ...agent,
      runWhen: agent.runWhen.includes(runWhen)
        ? agent.runWhen.filter((value) => value !== runWhen)
        : [...agent.runWhen, runWhen],
    }))
  }

  function setDecisionMaker(agentId: string, checked: boolean) {
    setCustomTeam((current) => ({
      ...current,
      decisionMakerAgentId:
        checked ? agentId : current.decisionMakerAgentId === agentId ? '' : current.decisionMakerAgentId,
      agents: current.agents.map((agent) =>
        agent.id === agentId
          ? {
              ...agent,
              isDecisionMaker: checked,
              kind: checked ? 'decision-maker' : agent.kind === 'decision-maker' ? 'worker' : agent.kind,
              createPrompt: checked ? 'app-generated' : agent.createPrompt,
              runWhen: checked
                ? Array.from(new Set([...agent.runWhen, 'before-stop', 'when-routed']))
                : agent.runWhen,
            }
          : {
              ...agent,
              isDecisionMaker: false,
              kind: agent.kind === 'decision-maker' ? 'worker' : agent.kind,
            },
      ),
    }))
  }

  function setAgentKind(agentId: string, kind: TeamAgentDraft['kind']) {
    if (kind === 'decision-maker') {
      setDecisionMaker(agentId, true)
      return
    }

    updateAgent(agentId, (agent) => ({
      ...agent,
      kind,
      isDecisionMaker: false,
      createPrompt:
        kind === 'reviewer'
          ? 'app-generated'
          : kind === 'executor' || kind === 'worker'
            ? 'user-original'
            : agent.createPrompt,
    }))

    setCustomTeam((current) => ({
      ...current,
      decisionMakerAgentId: current.decisionMakerAgentId === agentId ? '' : current.decisionMakerAgentId,
    }))
  }

  async function generateAgentFromInstructions(agentId: string) {
    const agent = customTeam.agents.find((value) => value.id === agentId)
    if (!agent) return
    if (!agent.instructionSeed.trim()) {
      showToast('Add agent instructions before generating the setup.', 'error')
      return
    }
    if (!projectPath) {
      showToast('Select a project before generating an agent.', 'error')
      return
    }
    if (!selectedModel.trim()) {
      showToast('Select a model before generating an agent.', 'error')
      return
    }

    setGeneratingAgentId(agentId)

    try {
      const generated = await api.generateTeamAgent(projectPath, selectedModel, {
        instructions: agent.instructionSeed,
        availableAgentIds: customTeam.agents.map((value) => value.id),
        availableAgentLabels: customTeam.agents.map((value) => value.label),
      })
      const nextDraft = applyGeneratedAgentResult(agent, generated)

      setCustomTeam((current) => ({
        ...current,
        decisionMakerAgentId: nextDraft.isDecisionMaker ? nextDraft.id : current.decisionMakerAgentId,
        agents: current.agents.map((value) =>
          value.id === agentId
            ? nextDraft
            : nextDraft.isDecisionMaker
              ? {
                  ...value,
                  isDecisionMaker: false,
                  kind: value.kind === 'decision-maker' ? 'worker' : value.kind,
                }
              : value,
        ),
      }))
      setEditorMode(agentId, 'manual')
      showToast(`Generated setup for "${nextDraft.label}".`, 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      showToast(`Failed to generate agent setup: ${message}`, 'error')
    } finally {
      setGeneratingAgentId(null)
    }
  }

  async function resolveTargetSessionId(): Promise<SessionId> {
    if (activeSessionId && activeSession?.projectPath === projectPath) {
      return activeSessionId
    }
    return createSession(projectPath!)
  }

  async function launchTeam(teammate: TeammateDefinition, prompt: string) {
    if (!projectPath) {
      showToast('Select a project before launching Team(New).', 'error')
      return
    }
    if (!selectedModel.trim()) {
      showToast('Select a model before launching Team(New).', 'error')
      return
    }
    if (!prompt) {
      showToast('Write the task prompt before launching Team(New).', 'error')
      return
    }

    setLaunchingId(teammate.id)

    try {
      const targetSessionId = await resolveTargetSessionId()
      void navigate({
        to: '/sessions/$sessionId',
        params: { sessionId: String(targetSessionId) },
      })

      await api.sendTeamMessage(
        targetSessionId,
        {
          text: prompt,
          attachments: [],
          thinkingLevel,
        },
        selectedModel,
        teammate,
      )

      showToast(`"${teammate.name}" launched in Team(New).`, 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      showToast(`Failed to launch Team(New): ${message}`, 'error')
    } finally {
      setLaunchingId(null)
    }
  }

  async function handleLaunchBuiltIn(teammate: TeammateDefinition) {
    await launchTeam(teammate, drafts[teammate.id]?.trim() ?? '')
  }

  async function handleLaunchCustomTeam() {
    const teammate = buildTeammateFromDraft(customTeam)
    const decisionMakerExists = teammate.agents.some(
      (agent) => agent.id === teammate.loopPolicy.decisionMakerAgentId,
    )
    if (!customTeam.name.trim()) {
      showToast('Give the custom team a name before launching it.', 'error')
      return
    }
    if (!decisionMakerExists) {
      showToast('Select one agent as the decision maker before launching the team.', 'error')
      return
    }
    if (teammate.agents.some((agent) => agent.roleDescription.trim().length === 0)) {
      showToast('Each agent needs a role description before launch.', 'error')
      return
    }
    await launchTeam(teammate, customTeam.taskPrompt.trim())
  }

  return (
    <>
      <div className="space-y-10">
        <div className="flex flex-col justify-between gap-6 border-b border-white/[0.04] pb-8 md:flex-row md:items-end">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-accent">
              Storefront
            </div>
            <div className="space-y-2">
              <h2 className="bg-gradient-to-r from-amber-400 to-rose-500 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent">
                Team(New)
              </h2>
              <p className="max-w-[700px] text-[15px] leading-relaxed text-text-secondary">
                Browse teams like a clean card store, then open the full team editor only when you
                want to inspect agents, prompts, and routing rules.
              </p>
            </div>
          </div>
          <Button
            variant="accent"
            size="lg"
            radius="full"
            className="shrink-0 px-6 shadow-lg transition-transform hover:scale-105 active:scale-95"
            leftIcon={<WandSparkles className="size-5" />}
            onClick={() => setIsCustomEditorOpen(true)}
          >
            Create Team
          </Button>
        </div>

        <section className="space-y-4">
          <StoreSectionHeader
            title="Custom Team"
            count={1}
            description="Your editable team card. Open it to manage every agent, prompt rule, and launch setting."
          />
          <div className="grid grid-cols-1 gap-5">
            <TeamVisitingCard
              icon={<WandSparkles className="size-7" />}
              eyebrow="Custom"
              title={customTeam.name.trim() || 'Custom Team'}
              role={summarizeRole(customTeam.agents.map((agent) => agent.label || agent.id))}
              description={summarizeDescription(
                customTeam.description,
                'Build your own team with specialists, a decision maker, and auto-generated handoffs.',
              )}
              agentLabels={customTeam.agents.map((agent) => agent.label || agent.id)}
              dependencyLabels={[]}
              onEdit={() => setIsCustomEditorOpen(true)}
            />
          </div>
        </section>

        <section className="space-y-4">
          <StoreSectionHeader
            title="Built-In Teams"
            count={builtInTeammates.length}
            description="Beautiful quick-start cards. Open a card to inspect all agents, loop policy, prompt, and launch settings."
          />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {builtInTeammates.map((teammate) => (
              <TeamVisitingCard
                key={teammate.id}
                icon={<Globe className="size-7" />}
                eyebrow="Built-In"
                title={teammate.name}
                role={summarizeRole(teammate.agents.map((agent) => agent.label))}
                description={summarizeDescription(teammate.description, teammate.loopPolicy.endConditionSummary)}
                agentLabels={teammate.agents.map((agent) => agent.label)}
                dependencyLabels={teammate.app.requiredMcps.map((dependency) => `MCP: ${dependency}`)}
                onEdit={() => setActiveBuiltInEditorId(teammate.id)}
              />
            ))}
          </div>
        </section>
      </div>

      {isCustomEditorOpen ? (
        <TeamEditorDialog
          title={customTeam.name.trim() || 'Custom Team'}
          description="Edit the full team: top-level launch settings, every agent, AI generation instructions, and decision-maker behavior."
          onClose={() => setIsCustomEditorOpen(false)}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border-light bg-bg-secondary/35 px-4 py-3 mb-2">
              <div className="text-[12px] leading-5 text-text-tertiary">
                Build your team below. Use the AI generator to auto-fill agents from a simple prompt.
              </div>
              <Button variant="secondary" size="sm" leftIcon={<Plus className="size-4" />} onClick={addAgent}>
                Add Agent
              </Button>
            </div>

            <CollapsibleSection 
              title="Team Settings" 
              description="Basic identity and the primary task prompt for this team."
              defaultExpanded={true}
            >
              <div className="grid gap-4 lg:grid-cols-2 mt-4">
                <label className="space-y-2">
                  <FieldLabel htmlFor="custom-team-name">Team name</FieldLabel>
                  <TextInput
                    id="custom-team-name"
                    value={customTeam.name}
                    onChange={(event) => updateCustomTeam({ name: event.currentTarget.value })}
                  />
                </label>

                <label className="space-y-2 lg:col-span-2">
                  <FieldLabel htmlFor="custom-team-description">Description</FieldLabel>
                  <Textarea
                    id="custom-team-description"
                    value={customTeam.description}
                    onChange={(event) => updateCustomTeam({ description: event.currentTarget.value })}
                    className="min-h-[88px]"
                  />
                </label>

                <label className="space-y-2 lg:col-span-2">
                  <FieldLabel htmlFor="custom-team-task-prompt">Team task prompt</FieldLabel>
                  <Textarea
                    id="custom-team-task-prompt"
                    value={customTeam.taskPrompt}
                    onChange={(event) => updateCustomTeam({ taskPrompt: event.currentTarget.value })}
                    placeholder={customTeam.launchPromptPlaceholder}
                    className="min-h-[120px]"
                  />
                </label>
              </div>
            </CollapsibleSection>

            <CollapsibleSection 
              title="Loop Policy & UI" 
              description="Advanced routing constraints and interface labels."
            >
              <div className="grid gap-4 lg:grid-cols-2 mt-4">
                <label className="space-y-2">
                  <FieldLabel htmlFor="custom-team-button-label">Launch button label</FieldLabel>
                  <TextInput
                    id="custom-team-button-label"
                    value={customTeam.launchButtonLabel}
                    onChange={(event) => updateCustomTeam({ launchButtonLabel: event.currentTarget.value })}
                  />
                </label>

                <label className="space-y-2">
                  <FieldLabel htmlFor="custom-team-placeholder">Launch prompt placeholder</FieldLabel>
                  <TextInput
                    id="custom-team-placeholder"
                    value={customTeam.launchPromptPlaceholder}
                    onChange={(event) => updateCustomTeam({ launchPromptPlaceholder: event.currentTarget.value })}
                  />
                </label>

                <label className="space-y-2">
                  <FieldLabel htmlFor="custom-team-initial-agent">Initial agent</FieldLabel>
                  <Select
                    id="custom-team-initial-agent"
                    value={customTeam.initialAgentId}
                    onChange={(event) => updateCustomTeam({ initialAgentId: event.currentTarget.value })}
                    selectSize="md"
                  >
                    {customTeam.agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.label || agent.id}
                      </option>
                    ))}
                  </Select>
                </label>

                <label className="space-y-2">
                  <FieldLabel htmlFor="custom-team-decision-maker">Decision maker</FieldLabel>
                  <Select
                    id="custom-team-decision-maker"
                    value={customTeam.decisionMakerAgentId}
                    onChange={(event) => setDecisionMaker(event.currentTarget.value, true)}
                    selectSize="md"
                  >
                    <option value="">Select one agent</option>
                    {customTeam.agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.label || agent.id}
                      </option>
                    ))}
                  </Select>
                </label>

                <label className="space-y-2">
                  <FieldLabel htmlFor="custom-team-max-decision-maker-calls">Max decision-maker calls</FieldLabel>
                  <TextInput
                    id="custom-team-max-decision-maker-calls"
                    type="number"
                    min={1}
                    value={String(customTeam.maxDecisionMakerCalls)}
                    onChange={(event) =>
                      updateCustomTeam({
                        maxDecisionMakerCalls: Number.parseInt(event.currentTarget.value || '1', 10) || 1,
                      })
                    }
                  />
                </label>

                <label className="space-y-2">
                  <FieldLabel htmlFor="custom-team-max-auto-prompts">Max auto prompts</FieldLabel>
                  <TextInput
                    id="custom-team-max-auto-prompts"
                    type="number"
                    min={1}
                    value={String(customTeam.maxAutoSubmittedPrompts)}
                    onChange={(event) =>
                      updateCustomTeam({
                        maxAutoSubmittedPrompts: Number.parseInt(event.currentTarget.value || '1', 10) || 1,
                      })
                    }
                  />
                </label>
              </div>
            </CollapsibleSection>

            <div className="pt-2">
              <h3 className="text-[15px] font-semibold text-text-primary mb-4 px-1">Agents</h3>
              <div className="space-y-3">
                {customTeam.agents.map((agent, index) => {
                  const editorMode = agentEditorModes[agent.id] ?? 'manual'
                  return (
                    <CollapsibleSection
                      key={agent.id}
                      title={`${index + 1}. ${agent.label || 'Unnamed Agent'}`}
                      description={agent.roleDescription ? (agent.roleDescription.length > 60 ? agent.roleDescription.slice(0, 60) + '...' : agent.roleDescription) : 'No role description'}
                      defaultExpanded={index === 0}
                      action={
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={customTeam.agents.length <= 1}
                          onClick={(e) => { e.stopPropagation(); removeAgent(agent.id) }}
                        >
                          Remove
                        </Button>
                      }
                    >
                      <div className="mt-4 flex items-center gap-2 mb-4 border-b border-border-light pb-4">
                        <Button
                          variant={editorMode === 'manual' ? 'secondary' : 'ghost'}
                          size="sm"
                          onClick={() => setEditorMode(agent.id, 'manual')}
                        >
                          Manual Setup
                        </Button>
                        <Button
                          variant={editorMode === 'generate' ? 'secondary' : 'ghost'}
                          size="sm"
                          onClick={() => setEditorMode(agent.id, 'generate')}
                        >
                          ✨ Generate with AI
                        </Button>
                      </div>

                      {editorMode === 'generate' ? (
                        <div className="mb-6 space-y-3 rounded-xl border border-accent/20 bg-accent/5 p-4">
                          <label className="block space-y-2">
                            <FieldLabel htmlFor={`agent-generate-${agent.id}`}>Agent instructions</FieldLabel>
                            <Textarea
                              id={`agent-generate-${agent.id}`}
                              value={agent.instructionSeed}
                              onChange={(event) => {
                                const value = event.currentTarget.value
                                updateAgent(agent.id, (current) => ({
                                  ...current,
                                  instructionSeed: value,
                                }))
                              }}
                              placeholder="Example: Reviewer who checks bugs and missing tests before the decision maker stops."
                              className="min-h-[80px]"
                            />
                          </label>
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <SectionHint>
                              Team(New) will autofill the agent fields below.
                            </SectionHint>
                            <Button
                              variant="secondary"
                              size="sm"
                              leftIcon={<WandSparkles className="size-4" />}
                              disabled={generatingAgentId === agent.id}
                              onClick={() => void generateAgentFromInstructions(agent.id)}
                            >
                              {generatingAgentId === agent.id ? 'Generating…' : 'Generate Fields'}
                            </Button>
                          </div>
                        </div>
                      ) : null}

                      <div className="grid gap-5 lg:grid-cols-2">
                        <label className="space-y-2">
                          <FieldLabel htmlFor={`agent-name-${agent.id}`}>Agent name</FieldLabel>
                          <TextInput
                            id={`agent-name-${agent.id}`}
                            value={agent.label}
                            onChange={(event) => {
                              const value = event.currentTarget.value
                              updateAgent(agent.id, (current) => ({
                                ...current,
                                label: value,
                              }))
                            }}
                          />
                        </label>

                        <div className="space-y-2 flex items-center justify-between lg:col-span-1 rounded-xl border border-border-light bg-bg px-4 py-2.5">
                          <div>
                            <span className="block text-[13px] font-medium text-text-primary">Decision Maker</span>
                            <span className="block text-[11px] text-text-tertiary">Can end the loop</span>
                          </div>
                          <ToggleSwitch 
                            label="Decision Maker"
                            checked={agent.isDecisionMaker || false}
                            onCheckedChange={(checked) => setDecisionMaker(agent.id, checked)}
                          />
                        </div>

                        {!agent.isDecisionMaker && (
                          <label className="space-y-2 lg:col-span-2">
                            <FieldLabel htmlFor={`agent-kind-${agent.id}`}>Agent type</FieldLabel>
                            <div className="flex gap-2">
                              {TEAM_AGENT_KIND_OPTIONS.filter(o => o.value !== 'decision-maker').map((option) => (
                                <button
                                  key={option.value}
                                  onClick={() => setAgentKind(agent.id, option.value as TeamAgentDraft['kind'])}
                                  className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors border ${
                                    agent.kind === option.value 
                                      ? 'bg-bg-hover border-border text-text-primary shadow-sm' 
                                      : 'bg-transparent border-transparent text-text-secondary hover:bg-bg-hover/50'
                                  }`}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          </label>
                        )}

                        <label className="space-y-2 lg:col-span-2">
                          <FieldLabel htmlFor={`agent-role-${agent.id}`}>Role description</FieldLabel>
                          <Textarea
                            id={`agent-role-${agent.id}`}
                            value={agent.roleDescription}
                            onChange={(event) => {
                              const value = event.currentTarget.value
                              updateAgent(agent.id, (current) => ({
                                ...current,
                                roleDescription: value,
                              }))
                            }}
                            className="min-h-[80px]"
                          />
                        </label>

                        <CollapsibleSection 
                          title="Advanced Configuration" 
                          description="Run constraints, routing, and prompt behavior."
                        >
                          <div className="grid gap-5 lg:grid-cols-2 mt-4">
                            <label className="space-y-2 lg:col-span-2">
                              <FieldLabel htmlFor={`agent-why-${agent.id}`}>Why to run</FieldLabel>
                              <Textarea
                                id={`agent-why-${agent.id}`}
                                value={agent.whyToRun}
                                onChange={(event) => {
                                  const value = event.currentTarget.value
                                  updateAgent(agent.id, (current) => ({
                                    ...current,
                                    whyToRun: value,
                                  }))
                                }}
                                className="min-h-[60px]"
                              />
                            </label>

                            <div className="space-y-2 lg:col-span-2">
                              <FieldLabel>Run when</FieldLabel>
                              <div className="flex flex-wrap gap-2">
                                {TEAM_RUN_WHEN_OPTIONS.map((option) => {
                                  const isSelected = agent.runWhen.includes(option.value)
                                  return (
                                    <button
                                      key={option.value}
                                      onClick={() => toggleRunWhen(agent.id, option.value)}
                                      className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors border ${
                                        isSelected 
                                          ? 'bg-bg-hover border-border text-text-primary shadow-sm' 
                                          : 'bg-bg-secondary border-border-light text-text-secondary hover:bg-bg-elevated'
                                      }`}
                                    >
                                      {option.label}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>

                            <label className="space-y-2">
                              <FieldLabel htmlFor={`agent-min-runs-${agent.id}`}>Minimum runs</FieldLabel>
                              <TextInput
                                id={`agent-min-runs-${agent.id}`}
                                type="number"
                                min={0}
                                value={typeof agent.minRuns === 'number' ? String(agent.minRuns) : ''}
                                onChange={(event) => {
                                  const value = event.currentTarget.value
                                  updateAgent(agent.id, (current) => ({
                                    ...current,
                                    minRuns: value.trim().length === 0 ? undefined : Number.parseInt(value, 10) || 0,
                                  }))
                                }}
                                placeholder="Skip if blank"
                              />
                            </label>

                            <label className="space-y-2">
                              <FieldLabel htmlFor={`agent-max-runs-${agent.id}`}>Maximum runs</FieldLabel>
                              <TextInput
                                id={`agent-max-runs-${agent.id}`}
                                type="number"
                                min={1}
                                value={typeof agent.maxRuns === 'number' ? String(agent.maxRuns) : ''}
                                onChange={(event) => {
                                  const value = event.currentTarget.value
                                  updateAgent(agent.id, (current) => ({
                                    ...current,
                                    maxRuns: value.trim().length === 0 ? undefined : Number.parseInt(value, 10) || 1,
                                  }))
                                }}
                                placeholder="Unlimited if blank"
                              />
                            </label>

                            <label className="space-y-2 lg:col-span-2">
                              <FieldLabel htmlFor={`agent-prompt-mode-${agent.id}`}>Next prompt content</FieldLabel>
                              <div className="flex gap-2 p-1 bg-bg-secondary rounded-lg border border-border-light inline-flex">
                                {TEAM_PROMPT_MODE_OPTIONS.map((option) => (
                                  <button
                                    key={option.value}
                                    onClick={() => updateAgent(agent.id, (current) => ({ ...current, createPrompt: option.value as TeamAgentDraft['createPrompt'] }))}
                                    className={`px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
                                      agent.createPrompt === option.value 
                                        ? 'bg-bg border border-border text-text-primary shadow-sm' 
                                        : 'bg-transparent border border-transparent text-text-secondary hover:text-text-primary'
                                    }`}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            </label>

                            <label className="space-y-2 lg:col-span-2">
                              <FieldLabel htmlFor={`agent-next-${agent.id}`}>Suggested next agent on success</FieldLabel>
                              <Select
                                id={`agent-next-${agent.id}`}
                                value={agent.suggestedNextAgentIfSuccess ?? ''}
                                onChange={(event) => {
                                  const value = event.currentTarget.value
                                  updateAgent(agent.id, (current) => ({
                                    ...current,
                                    suggestedNextAgentIfSuccess: value.trim().length === 0 ? undefined : value,
                                  }))
                                }}
                                selectSize="md"
                              >
                                <option value="">Let the agent or runtime decide</option>
                                {customTeam.agents
                                  .filter((a) => a.id !== agent.id)
                                  .map((a) => (
                                    <option key={a.id} value={a.id}>
                                      {a.label || a.id}
                                    </option>
                                  ))}
                              </Select>
                            </label>
                          </div>
                        </CollapsibleSection>
                      </div>
                    </CollapsibleSection>
                  )
                })}
              </div>
            </div>
          </div>
          <div className="mt-8 flex items-center justify-between gap-3 border-t border-border-light pt-6">
            <div className="text-[12px] text-text-tertiary">
              {customTeam.agents.length} agent{customTeam.agents.length === 1 ? '' : 's'} configured.
            </div>
            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={() => setIsCustomEditorOpen(false)}>
                Cancel
              </Button>
              <Button 
                leftIcon={<Globe className="size-4" />} 
                onClick={() => void handleLaunchCustomTeam()}
                disabled={launchingId === customTeam.id}
              >
                {launchingId === customTeam.id ? 'Launching…' : customTeam.launchButtonLabel}
              </Button>
            </div>
          </div>
        </TeamEditorDialog>
      ) : null}

      {activeBuiltInTeammate ? (
        <TeamEditorDialog
          title={activeBuiltInTeammate.name}
          description="Review the team card in full: who the agents are, what the loop policy says, then write the task prompt and launch it."
          onClose={() => setActiveBuiltInEditorId(null)}
        >
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              {activeBuiltInTeammate.agents.map((agent) => (
                <AgentPill key={agent.id} label={agent.label} />
              ))}
              {activeBuiltInTeammate.app.requiredMcps.map((dependency) => (
                <DependencyPill key={dependency} label={`MCP: ${dependency}`} />
              ))}
            </div>

            <div className="rounded-xl border border-border/60 bg-bg-secondary/35 px-4 py-4">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-tertiary">
                <Sparkles className="size-3.5" />
                Loop policy
              </div>
              <p className="text-[13px] leading-7 text-text-secondary">
                {activeBuiltInTeammate.loopPolicy.endConditionSummary} The decision maker can be
                called up to {String(activeBuiltInTeammate.loopPolicy.maxDecisionMakerCalls)} times
                before the loop must stop decisively.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {activeBuiltInTeammate.agents.map((agent) => (
                <div key={agent.id} className="rounded-xl border border-border/60 bg-bg px-4 py-4">
                  <div className="text-[14px] font-semibold text-text-primary">{agent.label}</div>
                  <div className="mt-2 text-[12px] uppercase tracking-[0.16em] text-text-tertiary">
                    {agent.kind}
                  </div>
                  <p className="mt-3 text-[13px] leading-6 text-text-secondary">{agent.roleDescription}</p>
                </div>
              ))}
            </div>

            <label className="block space-y-2">
              <FieldLabel htmlFor="built-in-task-prompt">Task prompt</FieldLabel>
              <Textarea
                id="built-in-task-prompt"
                value={drafts[activeBuiltInTeammate.id] ?? ''}
                onChange={(event) => updateDraft(activeBuiltInTeammate.id, event.currentTarget.value)}
                placeholder={activeBuiltInTeammate.launchPromptPlaceholder}
                className="min-h-[132px]"
              />
            </label>

            <div className="flex justify-end">
              <Button
                variant="primary"
                size="md"
                leftIcon={<Play className="size-4" />}
                disabled={launchingId === activeBuiltInTeammate.id}
                onClick={() => void handleLaunchBuiltIn(activeBuiltInTeammate)}
              >
                {launchingId === activeBuiltInTeammate.id
                  ? 'Launching…'
                  : activeBuiltInTeammate.launchButtonLabel}
              </Button>
            </div>
          </div>
        </TeamEditorDialog>
      ) : null}
    </>
  )
}
