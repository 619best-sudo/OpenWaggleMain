import { PERSISTED_PHASE_TRANSCRIPT_CUSTOM_TYPE } from './phase'

/** Custom node type for the turing thread-snapshot node persisted after a run. */
export const TURING_THREAD_SNAPSHOT_CUSTOM_TYPE = 'openwaggle.turing-thread-snapshot'

/** Custom node type for the turing bridge status/debug node persisted per run. */
export const TURING_BRIDGE_STATUS_CUSTOM_TYPE = 'turing_bridge_status'

/**
 * Custom nodes the turing run appends AFTER the active message to persist run
 * artifacts — the phase transcript, the thread snapshot, and the bridge status.
 * None of them are conversational turns.
 *
 * Branch derivation must treat these as structural: they must never count as
 * branchable leaves or branch heads. Otherwise the trailing artifact node reads
 * as a second leaf and the tree derives a phantom extra branch ("main" +
 * "branch2") for a plain linear conversation.
 */
export const STRUCTURAL_SESSION_NODE_CUSTOM_TYPES: ReadonlySet<string> = new Set([
  PERSISTED_PHASE_TRANSCRIPT_CUSTOM_TYPE,
  TURING_THREAD_SNAPSHOT_CUSTOM_TYPE,
  TURING_BRIDGE_STATUS_CUSTOM_TYPE,
])
