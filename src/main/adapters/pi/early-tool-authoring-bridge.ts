/**
 * Bridge that exposes the tool→model early-authoring plan to the patched
 * pi-agent-core runtime.
 *
 * The runtime cannot import app code, so it reads a pure, read-only lookup from
 * `globalThis.__openwaggleEarlyToolAuthoring` at tool-call streaming time. When a
 * routed-author tool (e.g. edit/write) starts streaming, the runtime uses the
 * returned key sets to interrupt the orchestrator as soon as the target (path) is
 * known but before the payload is generated, then hands authoring to the routed
 * model. Returning `null` (or leaving the global unset) simply disables the early
 * interrupt — the existing post-execution interception still applies.
 */
import {
  type EarlyToolAuthoringPlan,
  resolveEarlyToolAuthoringPlan,
} from '../../application/tool-model-route'

type EarlyToolAuthoringResolver = (toolName: string) => EarlyToolAuthoringPlan | null

declare global {
  var __openwaggleEarlyToolAuthoring: EarlyToolAuthoringResolver | undefined
}

/** Idempotently install the early-authoring lookup for the runtime to read. */
export function registerEarlyToolAuthoringBridge() {
  globalThis.__openwaggleEarlyToolAuthoring = (toolName) => resolveEarlyToolAuthoringPlan(toolName)
}

/** Remove the lookup (test/reset seam). */
export function clearEarlyToolAuthoringBridge() {
  globalThis.__openwaggleEarlyToolAuthoring = undefined
}
