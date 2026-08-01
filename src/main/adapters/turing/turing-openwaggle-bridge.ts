import { spawn } from 'node:child_process'
import type { McpServerDefinition, McpSettingsView } from '@shared/types/mcp'
import {
  defineSkill,
  type McpServerOptions,
  type ProviderInput,
  type Session,
  type McpRuntimePool,
} from 'turing-harness'
import type {
  AgentKernelActiveSkill,
  AgentKernelStandardsContext,
} from '../../ports/agent-kernel-service'
import { createLogger } from '../../logger'
import {
  buildRuntimeSignature,
  cacheRuntimeAttachment,
  getCachedRuntimeAttachment,
} from './turing-openwaggle-runtime-cache'

interface BridgeIssue {
  readonly kind: 'mcp-skip' | 'mcp-fail'
  readonly message: string
}

export interface BridgeResult {
  readonly issues: readonly BridgeIssue[]
  readonly enabledMcpNames: readonly string[]
  readonly attemptedMcpNames: readonly string[]
  readonly connectedMcpIds: readonly string[]
  readonly skillToolNames: readonly string[]
  /** Tool names from successfully connected MCP servers (for the prompt). */
  readonly connectedMcpToolNames: Readonly<Record<string, readonly string[]>>
  /** MCP server names that failed to connect (for the prompt). */
  readonly failedMcpNames: readonly string[]
}

const logger = createLogger('turing-bridge')

function primeMcpServerCache(
  opts: Pick<McpServerOptions, 'command' | 'args' | 'id'>,
): Promise<void> {
  const base = opts.command.split('/').pop() ?? opts.command
  if (base !== 'npx') return Promise.resolve()

  const pkg = (opts.args ?? []).find((arg) => !arg.startsWith('-'))
  if (!pkg) return Promise.resolve()

  return new Promise((resolve) => {
    try {
      const child = spawn('npm', ['cache', 'add', pkg], { stdio: 'ignore' })
      const finish = () => resolve()
      child.once('error', finish)
      child.once('close', finish)
      logger.info('Priming npm cache for MCP server', {
        mcpId: opts.id,
        package: pkg,
      })
    } catch {
      resolve()
    }
  })
}

function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? [...value]
    : undefined
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const pairs = Object.entries(value).filter(([, entry]) => typeof entry === 'string')
  return pairs.length > 0 ? Object.fromEntries(pairs) : undefined
}

function sanitizeSkillToolName(skillId: string) {
  return `openwaggle_skill_${skillId
    .replace(/[^a-z0-9_]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()}`
}

function describeSkill(skill: AgentKernelActiveSkill) {
  const description = skill.description.trim()
  return description.length > 0
    ? description
    : `OpenWaggle skill "${skill.name}" instructions and guardrails.`
}

function buildSkillOutput(skill: AgentKernelActiveSkill) {
  return [
    `SKILL: ${skill.name} (${skill.id})`,
    `DESCRIPTION: ${skill.description || 'none'}`,
    `SKILL PATH: ${skill.skillPath}`,
    `SKILL FOLDER: ${skill.folderPath}`,
    `HAS SCRIPTS: ${skill.hasScripts ? 'yes' : 'no'}`,
    'INSTRUCTIONS:',
    skill.body,
  ].join('\n')
}

function buildMcpServerOptions(
  name: string,
  definition: McpServerDefinition,
): McpServerOptions | undefined {
  if (typeof definition.command !== 'string' || definition.command.trim().length === 0) {
    return undefined
  }

  return {
    id: `openwaggle:mcp:${name}`,
    name,
    command: definition.command,
    ...(asStringArray(definition.args) ? { args: asStringArray(definition.args) } : {}),
    ...(asStringRecord(definition.env) ? { env: asStringRecord(definition.env) } : {}),
    ...(typeof definition.cwd === 'string' ? { cwd: definition.cwd } : {}),
  }
}

export function resolveOpenWaggleMcpServers(view?: McpSettingsView): {
  readonly servers: readonly McpServerOptions[]
  readonly issues: readonly BridgeIssue[]
} {
  if (!view) {
    return { servers: [], issues: [] }
  }

  const servers: McpServerOptions[] = []
  const issues: BridgeIssue[] = []
  for (const summary of view.servers) {
    if (!summary.enabled) continue
    const definition = view.effective.mcpServers[summary.name]
    if (!definition) continue
    if (summary.transport !== 'stdio') {
      issues.push({
        kind: 'mcp-skip',
        message: `Skipped MCP "${summary.name}" because only stdio MCP servers can be bridged into turing-harness right now.`,
      })
      continue
    }
    const options = buildMcpServerOptions(summary.name, definition)
    if (!options) {
      issues.push({
        kind: 'mcp-skip',
        message: `Skipped MCP "${summary.name}" because its command configuration is incomplete.`,
      })
      continue
    }
    servers.push(options)
  }
  return { servers, issues }
}

async function clearExistingOpenWaggleRuntime(session: Session): Promise<void> {
  const removableProviderIds = session
    .listCapabilities()
    .map((provider) => provider.id)
    .filter(
      (providerId) =>
        providerId.startsWith('openwaggle:mcp:') || providerId.startsWith('openwaggle:skill:'),
    )

  await Promise.all(removableProviderIds.map((providerId) => session.removeProvider(providerId)))
}

export async function attachOpenWaggleRuntime(
  session: Session,
  runtime: {
    readonly mcpSettings?: McpSettingsView
    readonly standardsContext?: AgentKernelStandardsContext
  },
  options?: {
    readonly projectPath?: string
    readonly mcpPool?: McpRuntimePool
  },
): Promise<BridgeResult> {
  const t0 = Date.now()
  const enabledMcpNames = (runtime.mcpSettings?.servers ?? [])
    .filter((summary) => summary.enabled)
    .map((summary) => summary.name)
  const { servers, issues: mcpIssues } = resolveOpenWaggleMcpServers(runtime.mcpSettings)
  const activeSkills = runtime.standardsContext?.activeSkills ?? []
  const { mcpPool } = options ?? {}
  if (mcpPool) {
    const poolAny = mcpPool as unknown as { pool?: Map<string, unknown> }
    logger.info('Bridge attach using shared MCP pool', {
      poolSize: poolAny.pool?.size ?? 'unknown',
      serverCount: servers.length,
    })
  }

  // Fast path: the same session was already wired with an identical runtime, so
  // its MCP servers are still connected and its skills still registered. Skip the
  // clear + sequential MCP reconnect (the main per-run latency) and reuse the
  // prior result.
  const signature = buildRuntimeSignature(servers, enabledMcpNames, activeSkills)
  const cached = getCachedRuntimeAttachment(session, signature)
  if (cached) {
    logger.info('Bridge attach fast-path', {
      mode: 'fast-path',
      ms: Date.now() - t0,
      mcpCount: servers.length,
      skillCount: activeSkills.length,
      signature,
    })
    return cached
  }
  logger.info('Bridge attach cold', {
    mode: 'cold',
    mcpCount: servers.length,
    skillCount: activeSkills.length,
    signature,
  })

  await clearExistingOpenWaggleRuntime(session)
  const issues: BridgeIssue[] = []
  const connectedMcpIds: string[] = []
  const skillToolNames: string[] = []
  const attemptedMcpNames = servers.map((server) => server.name ?? server.id)
  issues.push(...mcpIssues)

  // Phase 1: prime the npm cache for npx-style servers IN PARALLEL and
  // await all of them. Each `npm cache add` is a single network round-trip
  // for the tarball. For 9 servers, parallel priming takes ≈ max(1-3s)
  // instead of sum(1-3s). After this, the actual `npx` calls hit the cache
  // and skip the registry fetch + dependency resolution, so the dominant
  // cost becomes the `npx` process spawn (≈100 ms) instead of 1-3 s each.
  //
  // For non-npx commands (and on subsequent runs where the cache is warm),
  // `primeMcpServerCache` resolves immediately. `allSettled` so a failed
  // priming of one server doesn't block the others.
  await Promise.allSettled(servers.map((options) => primeMcpServerCache(options)))

  // Fan out MCP spawns in parallel. Use shared pool when available to avoid
  // re-spawning already-connected MCP servers across sessions.
  const settled = await Promise.allSettled(
    servers.map(async (options) => {
      try {
        let item
        if (mcpPool) {
          item = await session.addPooledMcpServer(options, mcpPool)
        } else {
          item = await session.addMcpServer(options)
        }
        return { ok: true as const, id: item.id, options }
      } catch (error) {
        return {
          ok: false as const,
          options,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }),
  )
  for (const result of settled) {
    if (result.status === 'rejected') {
      issues.push({
        kind: 'mcp-fail',
        message: `MCP attach crashed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
      })
      continue
    }
    const value = result.value
    if (value.ok) {
      connectedMcpIds.push(value.id)
    } else {
      issues.push({
        kind: 'mcp-fail',
        message: `Failed to connect MCP "${value.options.name ?? value.options.id}": ${value.error}`,
      })
    }
  }

  for (const skill of activeSkills) {
    const toolName = sanitizeSkillToolName(skill.id)
    // `defineSkill` is turing-harness's first-class skill registration path: it
    // stamps kind:'skill', applies the declared `phases` to every tool that
    // doesn't set its own, defaults `mutates` to false, and tags skill metadata —
    // so the skill lands in exactly the phases we intend rather than the
    // categorizer's guess. These skills are reference/instruction bundles useful
    // in every phase.
    session.addSkill(
      // `defineSkill` returns `ProviderInput` (kind: ProviderKind) but always stamps
      // kind:'skill' at runtime; `addSkill` expects the narrowed skill variant. The
      // library's return type is imprecise, so cast to the shape addSkill requires.
      defineSkill({
        id: `openwaggle:skill:${skill.id}`,
        source: 'external',
        name: skill.name,
        description: describeSkill(skill),
        phases: ['prepare', 'plan', 'perform', 'perfect'],
        tools: [
          {
            name: toolName,
            description: describeSkill(skill),
            parameters: {
              type: 'object',
              properties: {},
            },
            async execute() {
              return { output: buildSkillOutput(skill) }
            },
          },
        ],
      }) as Omit<ProviderInput, 'kind'> & { kind?: 'skill' },
    )
    skillToolNames.push(toolName)
  }

  // Build connected tool names + failed names for the prompt.
  const connectedMcpToolNames: Record<string, readonly string[]> = {}
  const failedMcpNames: string[] = []
  for (const result of settled) {
    if (result.status === 'rejected') continue
    const value = result.value
    if (value.ok) {
      const provider = session.listCapabilities().find((p) => p.id === value.id)
      if (provider) {
        connectedMcpToolNames[value.options.name ?? value.options.id] = provider.tools.map((t) => t.name)
      }
    } else {
      failedMcpNames.push(value.options.name ?? value.options.id)
    }
  }

  const result: BridgeResult = {
    issues,
    enabledMcpNames,
    attemptedMcpNames,
    connectedMcpIds,
    skillToolNames,
    connectedMcpToolNames,
    failedMcpNames,
  }

  // Always cache — even partial attaches. The next call with the same signature
  // returns the same `result` and avoids redoing 10+ seconds of MCP spawn work.
  // The previously-failed servers stay in `result.issues` so the user still sees
  // them; the previously-succeeded servers stay connected. To force a retry
  // (e.g. user fixed an MCP config), bump the signature by toggling the server.
  cacheRuntimeAttachment(session, signature, result)

  logger.info('Bridge attach cold done', {
    mode: 'cold',
    ms: Date.now() - t0,
    mcpCount: servers.length,
    skillCount: activeSkills.length,
    connectedMcp: connectedMcpIds.length,
    mcpFails: issues.filter((i) => i.kind === 'mcp-fail').length,
    signature,
  })

  return result
}

/**
 * Connect MCP servers in the background without blocking the caller. Returns
 * immediately — each MCP server's tools flow into the session registry as they
 * connect, so the flat loop's dynamic tool resolution can pick them up mid-run.
 *
 * Skills are registered synchronously (they're just text-returning tools, so
 * registration is instant). Cache priming runs in parallel as before.
 *
 * Use this when you want the LLM to start thinking immediately with built-in
 * tools while MCP servers connect asynchronously.
 */
export async function connectMcpBackground(
  session: Session,
  runtime: {
    readonly mcpSettings?: McpSettingsView
    readonly standardsContext?: AgentKernelStandardsContext
  },
  options?: {
    readonly projectPath?: string
    readonly mcpPool?: McpRuntimePool
  },
): Promise<{ ready: Promise<BridgeResult> }> {
  const t0 = Date.now()
  const enabledMcpNames = (runtime.mcpSettings?.servers ?? [])
    .filter((summary) => summary.enabled)
    .map((summary) => summary.name)
  const { servers, issues: mcpIssues } = resolveOpenWaggleMcpServers(runtime.mcpSettings)
  const activeSkills = runtime.standardsContext?.activeSkills ?? []
  const { mcpPool } = options ?? {}
  // Diagnostic: log the resolved server signatures so we can confirm the run's
  // borrow shares the prewarm's pool connection (same sig) vs. spawning a dup.
  const { mcpServerSignature } = await import('turing-harness')
  for (const s of servers) {
    logger.info('connectMcpBackground resolved server', {
      name: s.name,
      usePool: Boolean(mcpPool),
      poolInstanceId: (mcpPool as unknown as { getInstanceId?: () => number })?.getInstanceId?.() ?? 'none',
      sig: mcpServerSignature(s).slice(0, 90),
    })
  }

  // Fast-path: check if the same session was already wired (cached).
  const signature = buildRuntimeSignature(servers, enabledMcpNames, activeSkills)
  const cached = getCachedRuntimeAttachment(session, signature)
  if (cached) {
    logger.info('Bridge background fast-path', { mode: 'fast-path', ms: Date.now() - t0, signature })
    return { ready: Promise.resolve(cached) }
  }

  // Clear existing OpenWaggle providers AWAITED (not fire-and-forget). The clear
  // and the new provider registrations both touch the session registry; if they
  // run concurrently the clear can rip out freshly-added providers mid-run,
  // producing "unknown tool" failures on the summary finalizer turn. Await here
  // so the registry is in a clean state before anything new is registered.
  await clearExistingOpenWaggleRuntime(session)

  const issues: BridgeIssue[] = []
  const connectedMcpIds: string[] = []
  const skillToolNames: string[] = []
  const attemptedMcpNames = servers.map((server) => server.name ?? server.id)
  const connectedMcpToolNames: Record<string, readonly string[]> = {}
  const failedMcpNames: string[] = []
  issues.push(...mcpIssues)

  // Register skills synchronously (instant — no process spawn).
  for (const skill of activeSkills) {
    const toolName = sanitizeSkillToolName(skill.id)
    session.addSkill(
      defineSkill({
        id: `openwaggle:skill:${skill.id}`,
        source: 'external',
        name: skill.name,
        description: describeSkill(skill),
        phases: ['prepare', 'plan', 'perform', 'perfect'],
        tools: [
          {
            name: toolName,
            description: describeSkill(skill),
            parameters: { type: 'object', properties: {} },
            async execute() {
              return { output: buildSkillOutput(skill) }
            },
          },
        ],
      }) as Omit<ProviderInput, 'kind'> & { kind?: 'skill' },
    )
    skillToolNames.push(toolName)
  }

  // Build the ready promise: prime cache then spawn MCPs in background.
  const ready = (async (): Promise<BridgeResult> => {
    // Phase 1: prime npm cache — but ONLY for servers not already in the pool.
    // A warm-pool server reuses an existing child process, so priming its npm
    // cache again is pure latency (a subprocess spawn per server for nothing).
    // On the cold path (first-ever connect) priming still runs in parallel.
    const needsPriming = mcpPool ? servers.filter((options) => !mcpPool.has(options)) : servers
    if (needsPriming.length > 0) {
      await Promise.allSettled(needsPriming.map((options) => primeMcpServerCache(options)))
    }

    // Phase 2: spawn MCPs in parallel. Each connected server adds its tools
    // to the registry IMMEDIATELY so the loop's dynamic resolver picks them up.
    const settled = await Promise.allSettled(
      servers.map(async (options) => {
        try {
          let item
          if (mcpPool) {
            item = await session.addPooledMcpServer(options, mcpPool)
          } else {
            item = await session.addMcpServer(options)
          }
          const provider = session.listCapabilities().find((p) => p.id === item.id)
          if (provider) {
            connectedMcpToolNames[options.name ?? options.id] = provider.tools.map((t) => t.name)
          }
          return { ok: true as const, id: item.id, options }
        } catch (error) {
          return {
            ok: false as const,
            options,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      }),
    )
    for (const result of settled) {
      if (result.status === 'rejected') {
        issues.push({
          kind: 'mcp-fail',
          message: `MCP attach crashed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
        })
        continue
      }
      const value = result.value
      if (value.ok) {
        connectedMcpIds.push(value.id)
      } else {
        failedMcpNames.push(value.options.name ?? value.options.id)
        issues.push({
          kind: 'mcp-fail',
          message: `Failed to connect MCP "${value.options.name ?? value.options.id}": ${value.error}`,
        })
      }
    }

    const result: BridgeResult = {
      issues,
      enabledMcpNames,
      attemptedMcpNames,
      connectedMcpIds,
      skillToolNames,
      connectedMcpToolNames,
      failedMcpNames,
    }

    cacheRuntimeAttachment(session, signature, result)

    logger.info('Bridge background done', {
      mode: 'background',
      ms: Date.now() - t0,
      mcpCount: servers.length,
      skillCount: activeSkills.length,
      connectedMcp: connectedMcpIds.length,
      mcpFails: issues.filter((i) => i.kind === 'mcp-fail').length,
      signature,
    })

    return result
  })()

  return { ready }
}

export function buildOpenWaggleRuntimeDebugValue(
  session: Pick<Session, 'listCapabilities' | 'toolsForPhase'>,
  runtime: {
    readonly mcpSettings?: McpSettingsView
    readonly standardsContext?: AgentKernelStandardsContext
    /** Absent when the bridge attach timed out — the run proceeds with built-in
     *  tools only, and the debug node must still be emitted to say so. */
    readonly bridge?: BridgeResult
  },
) {
  const providers = session.listCapabilities()
  const prepareTools = session.toolsForPhase('prepare').map((tool) => tool.name)
  return {
    mcpAdapterEnabled: runtime.mcpSettings?.adapter.enabled ?? false,
    mcpRuntimeConfigPath: runtime.mcpSettings?.runtimeConfigPath ?? null,
    enabledMcpNames: [...(runtime.bridge?.enabledMcpNames ?? [])],
    attemptedMcpNames: [...(runtime.bridge?.attemptedMcpNames ?? [])],
    connectedMcpIds: [...(runtime.bridge?.connectedMcpIds ?? [])],
    bridgeIssues: (runtime.bridge?.issues ?? []).map((issue) => ({
      kind: issue.kind,
      message: issue.message,
    })),
    activeSkillIds: (runtime.standardsContext?.activeSkills ?? []).map((skill) => skill.id),
    activeSkillToolNames: [...(runtime.bridge?.skillToolNames ?? [])],
    providerIds: providers.map((provider) => provider.id),
    providerKinds: providers.map((provider) => ({ id: provider.id, kind: provider.kind })),
    prepareTools,
  }
}

export function buildOpenWaggleRuntimePrompt(
  userText: string,
  runtime: {
    readonly standardsContext?: AgentKernelStandardsContext
    // The prompt lists connected MCP tools and names the servers that failed, so
    // it needs those two fields too — the narrower Pick predated that section.
    readonly bridge?: Pick<
      BridgeResult,
      'issues' | 'skillToolNames' | 'connectedMcpToolNames' | 'failedMcpNames'
    >
    readonly pendingUserQuestionResolution?: {
      readonly request: {
        readonly phase: 'prepare' | 'plan' | 'perform' | 'perfect'
        readonly question: string
        readonly reason?: string
      }
      readonly answer: string
    }
  },
) {
  const sections: string[] = []
  const standards = runtime.standardsContext

  if (standards?.agentsInstruction?.trim()) {
    sections.push(['OPENWAGGLE AGENT INSTRUCTIONS:', standards.agentsInstruction.trim()].join('\n'))
  }

  if (standards?.agentsScopedInstructions?.length) {
    sections.push(
      [
        'OPENWAGGLE SCOPED INSTRUCTIONS:',
        ...standards.agentsScopedInstructions.map(
          (scope) => `- ${scope.scopeRelativeDir} (${scope.filePath})\n${scope.content.trim()}`,
        ),
      ].join('\n'),
    )
  }

  if (standards?.activeSkills?.length) {
    sections.push(
      [
        'OPENWAGGLE ACTIVE SKILLS:',
        ...standards.activeSkills.map((skill) => {
          const toolName = sanitizeSkillToolName(skill.id)
          return `- ${skill.name} (${skill.id}) — tool: ${toolName}${skill.description ? ` — ${skill.description}` : ''}`
        }),
      ].join('\n'),
    )
  }

  if (standards?.warnings?.length) {
    sections.push(
      [
        'OPENWAGGLE STANDARDS WARNINGS:',
        ...standards.warnings.map((warning) => `- ${warning}`),
      ].join('\n'),
    )
  }

  if (runtime.bridge) {
    // Connected MCP tools: list every tool from every connected MCP server
    // so the model knows EXACTLY what browser/automation tools it can call.
    const connected = runtime.bridge.connectedMcpToolNames
    const connectedEntries = Object.entries(connected)
    if (connectedEntries.length > 0) {
      const lines = connectedEntries.map(
        ([serverName, toolNames]) =>
          `  - ${serverName}: ${toolNames.join(', ')}`,
      )
      sections.push(
        [
          'CONNECTED MCP TOOLS (use these exact tool names for browser/device automation, testing, screenshots, etc.):',
          ...lines,
          'Prefer these MCP tools over bash for browser automation, testing, screenshots, or device interaction.',
        ].join('\n'),
      )
    }

    // Failed MCP servers: explicitly tell the model which servers are NOT available
    // so it doesn't try to call their tools or install workarounds.
    const failed = runtime.bridge.failedMcpNames
    if (failed.length > 0) {
      sections.push(
        [
          'UNAVAILABLE MCP SERVERS (these failed to connect — their tools are NOT available; do NOT try to call them):',
          ...failed.map((name) => `  - ${name}`),
          'Do NOT install packages (npm install, pip install, etc.) to work around unavailable tools.',
          'Use only the tools listed in CONNECTED MCP TOOLS above or the built-in coding tools.',
        ].join('\n'),
      )
    }

    // Legacy: bridge issues as notes
    if (runtime.bridge.issues?.length) {
      sections.push(
        [
          'OPENWAGGLE MCP BRIDGE NOTES:',
          ...runtime.bridge.issues.map((issue) => `- ${issue.message}`),
        ].join('\n'),
      )
    }
  }

  sections.push(
    [
      'OPENWAGGLE TRANSCRIPT MODE:',
      'Use compact transcript behavior.',
      'Do not emit conversational progress chatter such as "I will read", "Let me verify", "I found", or similar step-by-step narration before or after tool calls.',
      'Keep user-facing prose for phase summaries only. Let tool events carry tool activity.',
      'When a pending user question is answered, treat that answer as inline state for the existing card, not as a new user chat turn to mirror back.',
    ].join('\n'),
  )

  if (runtime.pendingUserQuestionResolution) {
    sections.push(
      [
        'OPENWAGGLE PENDING USER QUESTION:',
        `Phase: ${runtime.pendingUserQuestionResolution.request.phase}`,
        `Question: ${runtime.pendingUserQuestionResolution.request.question}`,
        ...(runtime.pendingUserQuestionResolution.request.reason
          ? [`Reason: ${runtime.pendingUserQuestionResolution.request.reason}`]
          : []),
        `User answer: ${runtime.pendingUserQuestionResolution.answer}`,
        'Treat this answer as the missing clarification that previously paused execution. Continue from that clarified plan instead of asking the same question again.',
      ].join('\n'),
    )
  }

  return sections.length > 0
    ? [
        `Use the following OpenWaggle runtime context while working on the task.`,
        ...sections,
        'USER TASK:',
        userText,
      ].join('\n\n')
    : userText
}
