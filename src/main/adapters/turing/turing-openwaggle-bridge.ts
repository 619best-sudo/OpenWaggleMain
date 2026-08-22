import type { McpServerDefinition, McpSettingsView } from '@shared/types/mcp'
import {
  defineSkill,
  type McpRuntimePool,
  type McpServerOptions,
  type ProviderInput,
  primeMcpServerCache,
  type Session,
} from 'turing-harness'
import { createLogger } from '../../logger'
import type {
  AgentKernelActiveSkill,
  AgentKernelStandardsContext,
} from '../../ports/agent-kernel-service'
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

/**
 * Internal provider-id prefixes for the OpenWaggle-originated runtime providers.
 * Session-scoped (never persisted). The construction sites below and the
 * matching filter in {@link clearExistingOpenWaggleRuntime} MUST stay in sync —
 * if you change one, change the other, or stale providers accumulate across runs.
 */
const MCP_PROVIDER_PREFIX = 'turing-machine:mcp:'
const SKILL_PROVIDER_PREFIX = 'turing-machine:skill:'
const SKILL_TOOL_NAME_PREFIX = 'turing_machine_skill_'

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
  return `${SKILL_TOOL_NAME_PREFIX}${skillId
    .replace(/[^a-z0-9_]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()}`
}

function describeSkill(skill: AgentKernelActiveSkill) {
  const description = skill.description.trim()
  return description.length > 0
    ? description
    : `Turing Machine skill "${skill.name}" instructions and guardrails.`
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
    id: `${MCP_PROVIDER_PREFIX}${name}`,
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
        providerId.startsWith(MCP_PROVIDER_PREFIX) || providerId.startsWith(SKILL_PROVIDER_PREFIX),
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
        id: `${SKILL_PROVIDER_PREFIX}${skill.id}`,
        source: 'external',
        name: skill.name,
        description: describeSkill(skill),
        // v2: registry scope is by categorizer id; skills ride every category.
        categorizers: ['conversation', 'read', 'write_edit', 'activity_inspect'],
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
    logger.info('Skill registered for run', {
      skillId: skill.id,
      skillName: skill.name,
      toolName,
    })
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
        connectedMcpToolNames[value.options.name ?? value.options.id] = provider.tools.map(
          (t) => t.name,
        )
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
): Promise<{
  readonly ready: Promise<BridgeResult>
  /** Whatever has attached so far — use this instead of giving up on timeout. */
  readonly snapshot: () => BridgeResult
}> {
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
      poolInstanceId:
        (mcpPool as unknown as { getInstanceId?: () => number })?.getInstanceId?.() ?? 'none',
      sig: mcpServerSignature(s).slice(0, 90),
    })
  }

  // Fast-path: check if the same session was already wired (cached).
  const signature = buildRuntimeSignature(servers, enabledMcpNames, activeSkills)
  const cached = getCachedRuntimeAttachment(session, signature)
  if (cached) {
    logger.info('Bridge background fast-path', {
      mode: 'fast-path',
      ms: Date.now() - t0,
      signature,
    })
    // Cached attach: already complete, so the snapshot IS the result.
    return { ready: Promise.resolve(cached), snapshot: () => cached }
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
        id: `${SKILL_PROVIDER_PREFIX}${skill.id}`,
        source: 'external',
        name: skill.name,
        description: describeSkill(skill),
        // v2: registry scope is by categorizer id; skills ride every category.
        categorizers: ['conversation', 'read', 'write_edit', 'activity_inspect'],
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
    logger.info('Skill registered for run', {
      skillId: skill.id,
      skillName: skill.name,
      toolName,
    })
  }

  // Build the ready promise: prime cache then spawn MCPs in background.
  const ready = (async (): Promise<BridgeResult> => {
    // No up-front priming barrier. `npm cache add` used to be awaited here for
    // every not-yet-pooled server BEFORE any server was attached — so on a fresh
    // launch nothing at all was registered until priming finished for all of
    // them, and the run's bridge-wait window expired with zero MCP tools even
    // though some were cache-backed and could have attached in milliseconds.
    // Priming now lives in the pool's cold-spawn path, where it delays only the
    // server that is actually spawning.
    //
    // Attach every server in parallel. Each one registers its tools the moment
    // it resolves, so a fast (or cache-backed) server is usable immediately and
    // `snapshot()` can report it while a slow sibling is still connecting.
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
          // Record the success HERE, not after `allSettled`. A fast server must
          // be visible to `snapshot()` while a slow sibling is still resolving —
          // otherwise the run's bridge-wait deadline expires and the prompt
          // reports zero MCP tools even though several are already attached.
          connectedMcpIds.push(item.id)
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
        // already recorded inside the per-server callback
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

  /**
   * Whatever has attached SO FAR, as a usable BridgeResult.
   *
   * `ready` only settles when every server has, and one slow or broken server
   * can take 15-30s (npm resolution for a bad spec, or a `github:` spec cloning).
   * The run cannot wait that long, and returning `undefined` on timeout was
   * all-or-nothing: the runtime prompt then had no CONNECTED MCP TOOLS section,
   * so the model was never told about the servers that WERE up. It would then
   * insist Playwright was unavailable while Playwright sat connected in the
   * registry.
   *
   * Skills are always included: they register synchronously, so they are never
   * the thing being waited on.
   */
  const snapshot = (): BridgeResult => ({
    issues: [...issues],
    enabledMcpNames,
    attemptedMcpNames,
    connectedMcpIds: [...connectedMcpIds],
    skillToolNames,
    connectedMcpToolNames: { ...connectedMcpToolNames },
    failedMcpNames: [...failedMcpNames],
  })

  return { ready, snapshot }
}

export function buildOpenWaggleRuntimeDebugValue(
  session: Pick<Session, 'listCapabilities' | 'toolsForCategorizer' | 'mcpServersSelected'>,
  runtime: {
    readonly mcpSettings?: McpSettingsView
    readonly standardsContext?: AgentKernelStandardsContext
    /** Absent when the bridge attach timed out — the run proceeds with built-in
     *  tools only, and the debug node must still be emitted to say so. */
    readonly bridge?: BridgeResult
  },
) {
  const providers = session.listCapabilities()
  // v2: the read categorizer's toolset is the successor of the old 'prepare'
  // view (memory-first, read-only discovery).
  const prepareTools = session.toolsForCategorizer('read').map((tool) => tool.name)
  return {
    mcpAdapterEnabled: runtime.mcpSettings?.adapter.enabled ?? false,
    mcpRuntimeConfigPath: runtime.mcpSettings?.runtimeConfigPath ?? null,
    enabledMcpNames: [...(runtime.bridge?.enabledMcpNames ?? [])],
    // The composer selection: which of the connected servers the user actually
    // offered to THIS run. enabled-but-unselected is the normal state now —
    // connection is not selection — and the distinction belongs in the status
    // node so a "why doesn't the model see my MCP" question is answerable
    // from the persisted card alone.
    selectedMcpNames: [...(session.mcpServersSelected ?? [])],
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

/**
 * How the model should use the connected browser/device MCPs — which is NOT
 * "prefer them over bash".
 *
 * That line used to read `Prefer these MCP tools over bash for browser
 * automation, testing, screenshots, or device interaction`, and it cost us a
 * run. Two things were wrong with it.
 *
 * It competed with the harness. turing-harness fronts every surface with
 * `activity_inspect`, which drives the browser or the device AND routes the
 * capture into `media_analysis` — and its verification gate credits visual
 * evidence for exactly that pairing. A raw `*_take_screenshot` is a CAPTURE,
 * not an EVALUATION; on its own the gate deliberately does not count it (see
 * the harness's verification-gate tests, which pin that revert). So a model
 * obeying "prefer the MCP tools" produced screenshots the run could not use,
 * looped through its verify rounds, and reported the change unverified.
 *
 * And "over bash" was wrong for the step that matters most on mobile. Getting a
 * native app onto a simulator is a shell job — `flutter run -d <id>` — and no
 * MCP tool does it. In the run that prompted this, the model read that line,
 * avoided the shell, reached for `flutter build apk` (which installs nothing),
 * and gave up on the simulator entirely.
 *
 * Each block is gated on the connected servers actually offering that kind of
 * tool, so a run with only, say, a filesystem MCP is not told about screens.
 */
function buildScreenRoutingGuidance(toolNames: readonly string[]): string[] {
  const has = (predicate: (name: string) => boolean) => toolNames.some(predicate)
  const canCapture = has((name) => name.includes('screenshot') || name.includes('snapshot'))
  const canDriveDevice = has((name) => name.startsWith('mobile_'))
  const out: string[] = []

  if (canCapture) {
    out.push(
      'VERIFYING A SCREEN: call `activity_inspect`, not a raw screenshot tool. It drives whichever surface above is connected (a browser by `url`; a device/simulator by `target:"mobile"` + `bundleId`), captures it, and routes the capture into `media_analysis` — that pairing is what counts as visual evidence. Taking a raw `*_take_screenshot` yourself is a capture, not an evaluation: you must still pass it to `media_analysis` (lens:"qa", `expected` = what you built) or the change stays unverified.',
      'Use the raw MCP tools for what `activity_inspect` does not do: taps, typing, gestures, element lists, console and network inspection.',
    )
  }
  if (canDriveDevice) {
    // Deliberately no example commands. This prompt is built before the run and
    // knows nothing about the project; the harness's verify round reads the
    // repo's own package scripts, Makefile targets and README/CLAUDE.md and
    // quotes the real ones. Naming a generic `flutter run -d <id>` here would
    // contradict that for any app with flavors or a non-default entrypoint —
    // which is most of them.
    out.push(
      "GETTING THE APP ONTO A DEVICE IS A `bash` JOB — no MCP tool does it, and a simulator with no app on it just screenshots someone else's screen. Use the command THIS project declares for it (its package scripts, a Makefile target, the run section of its README / CLAUDE.md / AGENTS.md, or the CI workflow) — the one that BUILDS, INSTALLS AND LAUNCHES, not a build/assemble/archive task, which produces an artifact and installs nothing. Run it through `bash` with `background: true` and poll the log it returns; a cold first build takes minutes, so do not shorten `timeoutMs` and do not read a kill as a failure.",
    )
  }
  out.push(
    'Do not shell out to curl, `open`, or a hand-rolled headless script for browser or device automation — that is what the MCP tools above are for.',
  )
  return out
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
    /**
     * The composer's MCP selection for THIS run. When present (even empty),
     * the CONNECTED MCP TOOLS section is filtered to the selected servers —
     * connected-but-unselected servers must not be advertised, or the model
     * calls tool names that exist in no hop's toolset. From the field: with
     * both browser MCPs connected and nothing selected, the prompt listed
     * ~40 browser tools the chain held none of, and the write pass stalled
     * itself to death calling `playwright` / `browser_navigate` it had just
     * been told to use. Absent = legacy callers that predate selection.
     */
    readonly mcpSelection?: readonly string[]
    readonly pendingUserQuestionResolution?: {
      readonly request: {
        /** v2: the categorizer id the question came from. */
        readonly phase: string
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
    sections.push(
      ['TURING MACHINE AGENT INSTRUCTIONS:', standards.agentsInstruction.trim()].join('\n'),
    )
  }

  if (standards?.agentsScopedInstructions?.length) {
    sections.push(
      [
        'TURING MACHINE SCOPED INSTRUCTIONS:',
        ...standards.agentsScopedInstructions.map(
          (scope) => `- ${scope.scopeRelativeDir} (${scope.filePath})\n${scope.content.trim()}`,
        ),
      ].join('\n'),
    )
  }

  if (standards?.activeSkills?.length) {
    sections.push(
      [
        'TURING MACHINE ACTIVE SKILLS:',
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
        'TURING MACHINE STANDARDS WARNINGS:',
        ...standards.warnings.map((warning) => `- ${warning}`),
      ].join('\n'),
    )
  }

  if (runtime.bridge) {
    // Connected MCP tools — FILTERED BY THE RUN'S SELECTION. The chain only
    // holds selected servers' tools (connection is not selection); advertising
    // the rest here hands the model tool names that will be refused in every
    // hop, which is how a run stalls itself calling tools it was just told to
    // use. `mcpSelection` absent = legacy caller predating selection.
    const connected = runtime.bridge.connectedMcpToolNames
    const selection = runtime.mcpSelection
    const connectedEntries = Object.entries(connected).filter(([serverName]) =>
      selection ? selection.includes(serverName) : true,
    )
    if (connectedEntries.length > 0) {
      const lines = connectedEntries.map(
        ([serverName, toolNames]) => `  - ${serverName}: ${toolNames.join(', ')}`,
      )
      const allToolNames = connectedEntries.flatMap(([, toolNames]) => toolNames)
      sections.push(
        [
          'CONNECTED MCP TOOLS (use these exact tool names for browser/device automation, testing, screenshots, etc.):',
          ...lines,
          ...buildScreenRoutingGuidance(allToolNames),
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
          'TURING MACHINE MCP BRIDGE NOTES:',
          ...runtime.bridge.issues.map((issue) => `- ${issue.message}`),
        ].join('\n'),
      )
    }
  }

  sections.push(
    [
      'TURING MACHINE TRANSCRIPT MODE:',
      'Use compact transcript behavior.',
      'Do not emit conversational progress chatter such as "I will read", "Let me verify", "I found", or similar step-by-step narration before or after tool calls.',
      'Keep user-facing prose for phase summaries only. Let tool events carry tool activity.',
      'When a pending user question is answered, treat that answer as inline state for the existing card, not as a new user chat turn to mirror back.',
    ].join('\n'),
  )

  if (runtime.pendingUserQuestionResolution) {
    sections.push(
      [
        'TURING MACHINE PENDING USER QUESTION:',
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
        `Use the following Turing Machine runtime context while working on the task.`,
        ...sections,
        'USER TASK:',
        userText,
      ].join('\n\n')
    : userText
}
