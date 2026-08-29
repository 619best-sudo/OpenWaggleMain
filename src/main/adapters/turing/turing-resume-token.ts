import type { JsonValue } from '@shared/types/json'
import type { PersistedResumeRecord, SessionResumeState } from '@shared/types/resume'
import { TURING_RESUME_TOKEN_CUSTOM_TYPE } from '@shared/types/structural-nodes'
import type { RunStop } from 'turing-harness'
import type { ProjectedSessionNodeInput } from '../../ports/session-repository'
import { buildCustomSessionNode } from './turing-message-projection'

export { TURING_RESUME_TOKEN_CUSTOM_TYPE }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Turn the harness's `RunStop` into the record we persist — or nothing, when
 * the run finished.
 *
 * A completed run leaves NO resume node. That is what makes "is there something
 * to continue?" a question about presence rather than about interpreting a
 * status field, and it is why a finished run cannot leave a stale Continue
 * button behind it.
 */
export function buildResumeRecord(stop: RunStop | undefined): PersistedResumeRecord | undefined {
  if (!stop?.resumable || !stop.token) return undefined
  const token = stop.token as { nextIndex?: number; plan?: unknown[]; stoppedAt?: number }
  const remainingSteps = Math.max(
    0,
    (Array.isArray(token.plan) ? token.plan.length : 0) - (token.nextIndex ?? 0),
  )
  const question =
    isRecord(stop.token) && isRecord(stop.token.pendingUserQuestion)
      ? String(stop.token.pendingUserQuestion.question ?? '')
      : undefined
  const state: SessionResumeState = {
    kind: stop.kind,
    reason: stop.reason,
    remainingSteps,
    needsAnswer: stop.kind === 'question',
    ...(question ? { question } : {}),
    stoppedAt: typeof token.stoppedAt === 'number' ? token.stoppedAt : Date.now(),
  }
  return { state, token: stop.token }
}

export function buildResumeTokenNode(
  record: PersistedResumeRecord,
  timestampMs: number,
): ProjectedSessionNodeInput {
  return {
    ...buildCustomSessionNode({
      customType: TURING_RESUME_TOKEN_CUSTOM_TYPE,
      data: record as unknown as JsonValue,
      timestampMs,
    }),
    parentId: null,
    pathDepth: 0,
    createdOrder: 0,
  }
}

/**
 * The MOST RECENT resume record in a session's tree, if any.
 *
 * Newest-first, and the first one wins — but only after checking that no LATER
 * run superseded it. Every run appends its own nodes, so a session that stopped,
 * was resumed, and finished has an old resume node still sitting in the tree.
 * Reading that one would offer to continue work that is already done, which is
 * worse than offering nothing: the user would watch a finished plan re-run.
 *
 * So a run that finished writes a TOMBSTONE (`{ cleared: true }`) rather than
 * nothing, and the tombstone being newer than the token is what says "settled".
 */
export function extractPersistedResumeRecord(
  nodes: readonly ProjectedSessionNodeInput[] | undefined,
): PersistedResumeRecord | undefined {
  if (!nodes?.length) return undefined
  const candidates = [...nodes]
    .filter((node) => node.kind === 'custom' && node.piEntryType === 'custom')
    .sort((left, right) => right.timestampMs - left.timestampMs)

  for (const node of candidates) {
    try {
      const parsed = JSON.parse(node.contentJson) as unknown
      if (!isRecord(parsed) || parsed.customType !== TURING_RESUME_TOKEN_CUSTOM_TYPE) continue
      const data = parsed.data
      if (!isRecord(data)) continue
      // The newest resume node is a tombstone: the run that wrote it finished,
      // so anything older is settled.
      if (data.cleared === true) return undefined
      if (!isRecord(data.state) || data.token == null) continue
      return data as unknown as PersistedResumeRecord
    } catch {}
  }
  return undefined
}

/**
 * A shallow shape check before handing a stored token back to the harness.
 *
 * Not a validation — the harness runs its own, and it is the authority on
 * version, working directory and plan cursor. This only keeps a corrupt blob
 * from being passed in as a `ResumeToken`-typed value.
 */
export function isResumeToken(value: unknown): value is import('turing-harness').ResumeToken {
  return isRecord(value) && typeof value.task === 'string' && Array.isArray(value.plan)
}

/** The tombstone a finished run leaves so an older token stops being offered. */
export function buildResumeClearedNode(timestampMs: number): ProjectedSessionNodeInput {
  return {
    ...buildCustomSessionNode({
      customType: TURING_RESUME_TOKEN_CUSTOM_TYPE,
      data: { cleared: true } as unknown as JsonValue,
      timestampMs,
    }),
    parentId: null,
    pathDepth: 0,
    createdOrder: 0,
  }
}
