import type { McpServerOptions, Session } from 'turing-harness'
import type { AgentKernelActiveSkill } from '../../ports/agent-kernel-service'
import type { BridgeResult } from './turing-openwaggle-bridge'

/**
 * What was last attached to a given (reused) session, so repeat runs can skip the
 * expensive clear + MCP reconnect when nothing changed. Keyed by the session
 * object: a new thread gets a fresh session with no entry (full attach), while a
 * thread's later runs reuse the same session and hit the fast path.
 */
const attachedRuntimeBySession = new WeakMap<Session, { signature: string; result: BridgeResult }>()

/**
 * A stable fingerprint of everything the attach step wires into the session.
 * MCP server spawns are the costly part, so this must capture the exact resolved
 * server options plus the active skills (whose bodies feed the skill tool output),
 * so any real change forces a reconnect while an unchanged config is skipped.
 */
export function buildRuntimeSignature(
  servers: readonly McpServerOptions[],
  enabledMcpNames: readonly string[],
  activeSkills: readonly AgentKernelActiveSkill[],
): string {
  return JSON.stringify({
    enabledMcpNames: [...enabledMcpNames].sort(),
    servers: [...servers]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((server) => ({
        id: server.id,
        name: server.name,
        command: server.command,
        args: server.args ?? null,
        env: server.env ?? null,
        cwd: server.cwd ?? null,
      })),
    skills: [...activeSkills]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        skillPath: skill.skillPath,
        folderPath: skill.folderPath,
        hasScripts: skill.hasScripts,
        body: skill.body,
      })),
  })
}

/** Return the prior attach result if this session already has the same signature wired. */
export function getCachedRuntimeAttachment(
  session: Session,
  signature: string,
): BridgeResult | undefined {
  const cached = attachedRuntimeBySession.get(session)
  return cached && cached.signature === signature ? cached.result : undefined
}

/** Remember a clean attach so a later run with the same config can skip reconnecting. */
export function cacheRuntimeAttachment(
  session: Session,
  signature: string,
  result: BridgeResult,
): void {
  attachedRuntimeBySession.set(session, { signature, result })
}
